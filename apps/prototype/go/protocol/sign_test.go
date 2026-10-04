package protocol_test

import (
	"bytes"
	"crypto/ed25519"
	"testing"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol/vectors"
)

const specDir = "../../spec/testvectors"

func TestVerifySignatureRFC8032Vector1(t *testing.T) {
	v, err := vectors.Load(specDir + "/ed25519/rfc8032-1.json")
	if err != nil {
		t.Fatal(err)
	}
	pub, _ := v.Bytes("input", "public_key_hex")
	msg, _ := v.Bytes("input", "message_hex")
	sig, _ := v.Bytes("output", "signature_hex")

	if err := protocol.VerifySignature(pub, msg, sig); err != nil {
		t.Fatalf("RFC 8032 test 1 must verify: %v", err)
	}
}

func TestVerifySignatureWycheproofSample(t *testing.T) {
	v, err := vectors.Load(specDir + "/ed25519/wycheproof-sample.json")
	if err != nil {
		t.Fatal(err)
	}
	cases, ok := v.Input["cases"].([]any)
	if !ok || len(cases) == 0 {
		t.Fatalf("input.cases is %T with no cases", v.Input["cases"])
	}
	for _, raw := range cases {
		c := raw.(map[string]any)
		name := c["flag"].(string)
		t.Run(name, func(t *testing.T) {
			pub := mustHex(c["public_key_hex"].(string))
			msg := mustHex(c["message_hex"].(string))
			sig := mustHex(c["signature_hex"].(string))
			got := protocol.VerifySignature(pub, msg, sig) == nil
			if want := c["result"] == "valid"; got != want {
				t.Fatalf("verifies = %v, Wycheproof says %v", got, c["result"])
			}
		})
	}
}

func TestVerifySignatureRejectsShortKey(t *testing.T) {
	if protocol.VerifySignature([]byte{1, 2, 3}, nil, make([]byte, ed25519.SignatureSize)) == nil {
		t.Fatal("a 3-byte public key verified")
	}
}

type recordingSigner struct{ got []byte }

func (s *recordingSigner) Sign(msg []byte) []byte {
	s.got = bytes.Clone(msg)
	return bytes.Repeat([]byte{0x5a}, ed25519.SignatureSize)
}

func TestSignHandsTheSignerTheBytesTheSignatureCovers(t *testing.T) {
	m := protocol.ReferenceRequest()
	signer := &recordingSigner{}

	wire, err := protocol.Sign(signer, m)
	if err != nil {
		t.Fatal(err)
	}
	want, err := protocol.SignedBytes(m)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(signer.got, want) {
		t.Fatalf("signer saw %x, want %x", signer.got, want)
	}
	got, err := protocol.Decode(wire)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got.Signature, bytes.Repeat([]byte{0x5a}, ed25519.SignatureSize)) {
		t.Fatalf("the signer's signature is not in the message: %x", got.Signature)
	}
}

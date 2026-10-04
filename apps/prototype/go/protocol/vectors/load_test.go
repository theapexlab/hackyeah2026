package vectors_test

import (
	"crypto/ed25519"
	"testing"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol/vectors"
)

const specDir = "../../../spec/testvectors"

func TestRFC8032Vector1Verifies(t *testing.T) {
	v, err := vectors.Load(specDir + "/ed25519/rfc8032-1.json")
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if v.Source == "" {
		t.Error("vector does not name its source")
	}

	pub, err := v.Bytes("input", "public_key_hex")
	if err != nil {
		t.Fatal(err)
	}
	msg, err := v.Bytes("input", "message_hex")
	if err != nil {
		t.Fatal(err)
	}
	sig, err := v.Bytes("output", "signature_hex")
	if err != nil {
		t.Fatal(err)
	}

	if got := ed25519.Verify(pub, msg, sig); got != (v.Expect == "valid") {
		t.Fatalf("Verify = %v, vector expects %q", got, v.Expect)
	}
}

func TestLoadRejectsMissingField(t *testing.T) {
	v, err := vectors.Load(specDir + "/ed25519/rfc8032-1.json")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := v.Bytes("input", "no_such_hex"); err == nil {
		t.Fatal("Bytes returned no error for a missing field")
	}
	if _, err := v.Bytes("input", "message_hex"); err != nil {
		t.Fatalf("empty hex field must decode: %v", err)
	}
}

func TestLoadRejectsBadHex(t *testing.T) {
	v := vectors.Vector{Input: map[string]any{"x_hex": "zz"}}
	if _, err := v.Bytes("input", "x_hex"); err == nil {
		t.Fatal("Bytes returned no error for invalid hex")
	}
}

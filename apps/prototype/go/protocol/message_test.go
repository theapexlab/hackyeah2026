package protocol_test

import (
	"bytes"
	"crypto/ed25519"
	"testing"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
)

// testKey is the RFC 8032 test 1 key pair, the one key the skeleton trusts.
func testKey(t testing.TB) ed25519.PrivateKey {
	t.Helper()
	seed := []byte{
		0x9d, 0x61, 0xb1, 0x9d, 0xef, 0xfd, 0x5a, 0x60, 0xba, 0x84, 0x4a, 0xf4, 0x92, 0xec, 0x2c, 0xc4,
		0x44, 0x49, 0xc5, 0x69, 0x7b, 0x32, 0x69, 0x19, 0x70, 0x3b, 0xac, 0x03, 0x1c, 0xae, 0x7f, 0x60,
	}
	return ed25519.NewKeyFromSeed(seed)
}

func TestReferenceRequestIs122Bytes(t *testing.T) {
	wire, err := protocol.Sign(protocol.Ed25519Key(testKey(t)), protocol.ReferenceRequest())
	if err != nil {
		t.Fatal(err)
	}
	if len(wire) != 122 {
		t.Fatalf("reference request is %d bytes, want 122", len(wire))
	}
	t.Logf("reference request: %d bytes of the %d-byte budget", len(wire), protocol.FrameBudget)
}

func TestSignDecodeVerifyRoundTrip(t *testing.T) {
	key := testKey(t)
	want := protocol.ReferenceRequest()
	wire, err := protocol.Sign(protocol.Ed25519Key(key), want)
	if err != nil {
		t.Fatal(err)
	}

	got, err := protocol.Decode(wire)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if err := protocol.Verify(key.Public().(ed25519.PublicKey), wire); err != nil {
		t.Fatalf("verify: %v", err)
	}
	if got.Class != want.Class || got.Seq != want.Seq || !bytes.Equal(got.Payload, want.Payload) {
		t.Fatalf("decoded %+v, want fields of %+v", got, want)
	}
}

func TestEveryFlippedBitFailsVerification(t *testing.T) {
	key := testKey(t)
	pub := key.Public().(ed25519.PublicKey)
	wire, err := protocol.Sign(protocol.Ed25519Key(key), protocol.ReferenceRequest())
	if err != nil {
		t.Fatal(err)
	}

	for i := range wire {
		for bit := range 8 {
			tampered := bytes.Clone(wire)
			tampered[i] ^= 1 << bit
			if protocol.Verify(pub, tampered) == nil {
				t.Fatalf("flipping bit %d of byte %d still verifies", bit, i)
			}
		}
	}
}

func TestVerifyRejectsWrongKey(t *testing.T) {
	wire, err := protocol.Sign(protocol.Ed25519Key(testKey(t)), protocol.ReferenceRequest())
	if err != nil {
		t.Fatal(err)
	}
	other := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{7}, 32)).Public().(ed25519.PublicKey)
	if protocol.Verify(other, wire) == nil {
		t.Fatal("verify accepted a signature from another key")
	}
}

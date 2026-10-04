package protocol_test

import (
	"crypto/sha256"
	"encoding/hex"
	"testing"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
)

func TestIDHashesTheSignedBytesWithoutTheSignature(t *testing.T) {
	wire, err := protocol.Sign(protocol.Ed25519Key(testKey(t)), protocol.ReferenceRequest())
	if err != nil {
		t.Fatal(err)
	}
	// Strip the signature by hand: the last element is label 11 (0x0b), a 64-byte string (0x58 0x40 and
	// 64 bytes), so 67 bytes, and the map header drops from 11 entries (0xab) to 10 (0xaa).
	stripped := append([]byte(nil), wire[:len(wire)-67]...)
	if stripped[0] != 0xab {
		t.Fatalf("map header is %#x, want 0xab", stripped[0])
	}
	stripped[0] = 0xaa
	sum := sha256.Sum256(stripped)

	got, err := protocol.ID(wire)
	if err != nil {
		t.Fatal(err)
	}

	if want := hex.EncodeToString(sum[:16]); got != want {
		t.Fatalf("ID is %s, want %s", got, want)
	}
}

func TestIDIgnoresTheSignature(t *testing.T) {
	m := protocol.ReferenceRequest()
	a, err := protocol.Sign(protocol.Ed25519Key(testKey(t)), m)
	if err != nil {
		t.Fatal(err)
	}
	m.Signature = make([]byte, 64)
	b, err := protocol.Encode(m)
	if err != nil {
		t.Fatal(err)
	}

	idA, errA := protocol.ID(a)
	idB, errB := protocol.ID(b)

	if errA != nil || errB != nil || idA != idB {
		t.Fatalf("IDs differ with the signature: %q %v, %q %v", idA, errA, idB, errB)
	}
}

func TestIDFailsOnGarbage(t *testing.T) {
	if _, err := protocol.ID([]byte{0xff, 0x00}); err == nil {
		t.Fatal("want an error for bytes that are not a message")
	}
}

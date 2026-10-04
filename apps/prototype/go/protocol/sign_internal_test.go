package protocol

import (
	"bytes"
	"testing"

	"pgregory.net/rapid"
)

func TestStripSignatureMatchesSignedBytes(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := Message{
			Version:   Version,
			Class:     Class(rapid.Uint8().Draw(t, "class")),
			Signer:    rapid.SliceOfN(rapid.Byte(), 0, 16).Draw(t, "signer"),
			Seq:       rapid.Uint32().Draw(t, "seq"),
			Timestamp: rapid.Uint32().Draw(t, "timestamp"),
			TTL:       rapid.Uint16().Draw(t, "ttl"),
			HopLimit:  rapid.Uint8().Draw(t, "hopLimit"),
			Geohash:   rapid.StringN(0, 12, 48).Draw(t, "geohash"),
			Radius:    rapid.Uint16().Draw(t, "radius"),
			Payload:   rapid.SliceOfN(rapid.Byte(), 0, 200).Draw(t, "payload"),
			Signature: rapid.SliceOfN(rapid.Byte(), 64, 64).Draw(t, "signature"),
		}
		wire, err := Encode(m)
		if err != nil {
			t.Fatal(err)
		}
		want, err := SignedBytes(m)
		if err != nil {
			t.Fatal(err)
		}
		got, err := stripSignature(wire)
		if err != nil || !bytes.Equal(got, want) {
			t.Fatalf("stripped %x (%v), want %x", got, err, want)
		}
	})
}

func TestStripSignatureRejectsWhatIsNotSigned(t *testing.T) {
	m := ReferenceRequest()
	wire, err := Encode(m)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := stripSignature(wire); err == nil {
		t.Fatal("stripped a signature from an unsigned message")
	}
}

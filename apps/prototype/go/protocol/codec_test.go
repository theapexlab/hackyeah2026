package protocol_test

import (
	"bytes"
	"encoding/hex"
	"errors"
	"fmt"
	"testing"

	"pgregory.net/rapid"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
)

func genMessage() *rapid.Generator[protocol.Message] {
	return rapid.Custom(func(t *rapid.T) protocol.Message {
		return protocol.Message{
			Version:   protocol.Version,
			Class:     protocol.Class(rapid.Uint8().Draw(t, "class")),
			Signer:    rapid.SliceOfN(rapid.Byte(), 0, 16).Draw(t, "signer"),
			Seq:       rapid.Uint32().Draw(t, "seq"),
			Timestamp: rapid.Uint32().Draw(t, "timestamp"),
			TTL:       rapid.Uint16().Draw(t, "ttl"),
			HopLimit:  rapid.Uint8().Draw(t, "hopLimit"),
			Geohash:   rapid.StringN(0, 12, 48).Draw(t, "geohash"),
			Radius:    rapid.Uint16().Draw(t, "radius"),
			Payload:   rapid.SliceOfN(rapid.Byte(), 0, 200).Draw(t, "payload"),
			Signature: rapid.SliceOfN(rapid.Byte(), 0, 64).Draw(t, "signature"),
		}
	})
}

// sameMessage compares byte slices with bytes.Equal, because a nil slice and an empty one encode alike.
func sameMessage(a, b protocol.Message) bool {
	return a.Version == b.Version && a.Class == b.Class && bytes.Equal(a.Signer, b.Signer) &&
		a.Seq == b.Seq && a.Timestamp == b.Timestamp && a.TTL == b.TTL && a.HopLimit == b.HopLimit &&
		a.Geohash == b.Geohash && a.Radius == b.Radius && bytes.Equal(a.Payload, b.Payload) &&
		bytes.Equal(a.Signature, b.Signature)
}

func TestCodecRoundTripProperty(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		want := genMessage().Draw(t, "message")
		wire, err := protocol.Encode(want)
		if err != nil {
			t.Fatalf("encode: %v", err)
		}
		got, err := protocol.Decode(wire)
		if err != nil {
			t.Fatalf("decode of our own encoding: %v", err)
		}
		if !sameMessage(got, want) {
			t.Fatalf("decoded %+v, want %+v", got, want)
		}
		again, err := protocol.Encode(got)
		if err != nil {
			t.Fatalf("re-encode: %v", err)
		}
		if !bytes.Equal(again, wire) {
			t.Fatalf("re-encoding differs: %x vs %x", again, wire)
		}
	})
}

func TestEncodeIsDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMessage().Draw(t, "message")
		a, errA := protocol.Encode(m)
		b, errB := protocol.Encode(m)
		if err := errors.Join(errA, errB); err != nil {
			t.Fatalf("encode: %v", err)
		}
		if !bytes.Equal(a, b) {
			t.Fatalf("two encodings differ: %x vs %x", a, b)
		}
	})
}

// baseHead is the map header and every label but the payload, by hand, each in its shortest form.
const baseHead = "a8" +
	"0101" + // version 1
	"0201" + // class 1
	"0341aa" + // signer
	"0411" + // seq 17
	"051a6553f100" + // timestamp
	"06190e10" + // ttl 3600
	"070a" // hop limit 10

func validBase() []byte {
	return mustHex(baseHead + "0a41bb") // payload
}

func mustHex(s string) []byte {
	b, err := hex.DecodeString(s)
	if err != nil {
		panic(err)
	}
	return b
}

func replace(t *testing.T, base []byte, old, repl string) []byte {
	t.Helper()
	o, n := mustHex(old), mustHex(repl)
	if bytes.Count(base, o) != 1 {
		t.Fatalf("%s is not in the base exactly once", old)
	}
	return bytes.Replace(base, o, n, 1)
}

// canonicalOfSize builds a canonical message of exactly size bytes by padding the payload. The payload
// length is a two-byte uint16 argument, so size must leave it at 256 or more.
func canonicalOfSize(size int) []byte {
	head := mustHex(baseHead + "0a59")
	n := size - len(head) - 2
	head = append(head, byte(n>>8), byte(n)) //nolint:gosec // n is under 65536
	wire := append(head, make([]byte, n)...)
	if len(wire) != size {
		panic(fmt.Sprintf("built %d bytes, want %d", len(wire), size))
	}
	return wire
}

func TestValidBaseDecodes(t *testing.T) {
	if _, err := protocol.Decode(validBase()); err != nil {
		t.Fatalf("the hand-built base must decode, or the rejections below prove nothing: %v", err)
	}
}

func TestDecodeRejectsInvalidEncodings(t *testing.T) {
	base := validBase()
	tests := []struct {
		name string
		wire []byte
		want error // nil means any error
	}{
		{"non-shortest integer value", replace(t, base, "0411", "041811"), protocol.ErrNotCanonical},
		{"non-shortest integer label", replace(t, base, "0411", "180411"), protocol.ErrNotCanonical},
		{"non-shortest byte string length", replace(t, base, "0a41bb", "0a5801bb"), protocol.ErrNotCanonical},
		{"non-shortest map length", replace(t, base, "a8", "b808"), protocol.ErrNotCanonical},
		{"indefinite-length byte string", replace(t, base, "0a41bb", "0a5f41bbff"), nil},
		{"indefinite-length map", append(append([]byte{0xbf}, base[1:]...), 0xff), nil},
		{"duplicate label", append(replace(t, base, "a8", "a9"), mustHex("0201")...), nil},
		{"adjacent duplicate label", replace(t, replace(t, base, "a8", "a9"), "0201", "02010201"), nil},
		{"labels out of order", replace(t, base, "01010201", "02010101"), protocol.ErrNotCanonical},
		{"unknown label", append(replace(t, base, "a8", "a9"), mustHex("0c00")...), nil},
		{"text where an integer is wanted", replace(t, base, "0101", "016131"), nil},
		{"integer where bytes are wanted", replace(t, base, "0341aa", "0301"), nil},
		{"null for the signer", replace(t, base, "0341aa", "03f6"), protocol.ErrNotCanonical},
		{"null for the payload", replace(t, base, "0a41bb", "0af6"), protocol.ErrNotCanonical},
		{"null for a number", replace(t, base, "0411", "04f6"), nil},
		{"tagged value", replace(t, base, "0201", "02c101"), nil},
		{"missing label", replace(t, replace(t, base, "a8", "a7"), "070a", ""), protocol.ErrNotCanonical},
		{"integer out of range for its field", replace(t, base, "070a", "07190100"), nil},
		{"a message that is not a map", mustHex("820101"), nil},
		{"unsupported version", replace(t, base, "0101", "0102"), protocol.ErrBadVersion},
		{"trailing bytes", append(bytes.Clone(base), 0x00), protocol.ErrTrailingBytes},
		{"truncated", base[:len(base)-1], nil},
		{"empty", nil, nil},
		{"one byte over the size limit", canonicalOfSize(protocol.MaxWireSize + 1), protocol.ErrTooLarge},
		{"over the size limit and not a message", bytes.Repeat([]byte{0xff}, protocol.MaxWireSize+1), protocol.ErrTooLarge},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := protocol.Decode(tc.wire)
			if err == nil {
				t.Fatalf("decode accepted %x", tc.wire)
			}
			if tc.want != nil && !errors.Is(err, tc.want) {
				t.Fatalf("got %v, want %v", err, tc.want)
			}
		})
	}
}

func TestDecodeAcceptsExactlyMaxWireSize(t *testing.T) {
	if _, err := protocol.Decode(canonicalOfSize(protocol.MaxWireSize)); err != nil {
		t.Fatalf("a message of exactly %d bytes must decode: %v", protocol.MaxWireSize, err)
	}
}

func FuzzDecode(f *testing.F) {
	f.Add(validBase())
	signed, err := protocol.Sign(protocol.Ed25519Key(testKey(f)), protocol.ReferenceRequest())
	if err != nil {
		f.Fatal(err)
	}
	f.Add(signed)
	f.Add(canonicalOfSize(300))
	f.Fuzz(func(t *testing.T, wire []byte) {
		m, err := protocol.Decode(wire)
		if err != nil {
			return
		}
		again, err := protocol.Encode(m)
		if err != nil {
			t.Fatalf("accepted %x but cannot re-encode it: %v", wire, err)
		}
		if !bytes.Equal(again, wire) {
			t.Fatalf("accepted %x but it re-encodes to %x", wire, again)
		}
	})
}

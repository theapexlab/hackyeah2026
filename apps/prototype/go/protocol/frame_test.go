package protocol_test

import (
	"bytes"
	"crypto/ed25519"
	"errors"
	"math"
	"slices"
	"testing"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
)

// largestLegal is the biggest message of a class that carries no free text: every optional field present
// (link-local classes carry no geohash or radius), the sequence and the ttl at their widest encodings, and
// the payload at the class budget.
func largestLegal(c protocol.Class) protocol.Message {
	m := protocol.Message{
		Version:   protocol.Version,
		Class:     c,
		Signer:    bytes.Repeat([]byte{0xaa}, 8),
		Seq:       1 << 31,
		Timestamp: 1 << 31,
		TTL:       65535,
		HopLimit:  math.MaxUint8,
		Geohash:   "u2yhv5",
		Radius:    65535,
		Payload:   bytes.Repeat([]byte{0x55}, protocol.MaxPayload(c)),
	}
	if protocol.IsLinkLocal(c) {
		m.Geohash, m.Radius = "", 0
	}
	return m
}

func TestAllClassesFit240(t *testing.T) {
	key := testKey(t)
	for _, c := range protocol.Classes() {
		signed, err := protocol.Sign(protocol.Ed25519Key(key), largestLegal(c))
		if err != nil {
			t.Fatalf("%s: %v", c, err)
		}
		full := protocol.Envelope{HopCount: math.MaxUint8, Path: make([]uint16, protocol.MaxPath), Wire: signed}
		if protocol.IsLinkLocal(c) {
			full.Path = nil
		}
		frame, err := protocol.EncodeFrame(full)
		if err != nil {
			t.Fatalf("%s: %v", c, err)
		}
		t.Logf("%-20s payload %3d  signed %3d  frame %3d", c, protocol.MaxPayload(c), len(signed), len(frame))
		if len(frame) > protocol.FrameBudget {
			t.Errorf("%s frame is %d bytes, budget is %d", c, len(frame), protocol.FrameBudget)
		}
	}
}

func TestFrameRoundTrip(t *testing.T) {
	signed, err := protocol.Sign(protocol.Ed25519Key(testKey(t)), protocol.ReferenceRequest())
	if err != nil {
		t.Fatal(err)
	}
	want := protocol.Envelope{HopCount: 3, Path: []uint16{0x0102, 0xfffe}, Wire: signed}

	frame, err := protocol.EncodeFrame(want)
	if err != nil {
		t.Fatal(err)
	}
	got, err := protocol.DecodeFrame(frame)
	if err != nil {
		t.Fatal(err)
	}

	if got.HopCount != want.HopCount || !slices.Equal(got.Path, want.Path) {
		t.Fatalf("decoded envelope %+v", got)
	}
	if !bytes.Equal(got.Wire, signed) {
		t.Fatal("message bytes changed in the round trip")
	}
	if err := protocol.Verify(testKey(t).Public().(ed25519.PublicKey), got.Wire); err != nil {
		t.Fatalf("signed bytes no longer verify: %v", err)
	}
}

func TestEnvelopeLeavesTheMessageAlone(t *testing.T) {
	signed, err := protocol.Sign(protocol.Ed25519Key(testKey(t)), protocol.ReferenceRequest())
	if err != nil {
		t.Fatal(err)
	}
	a, err := protocol.EncodeFrame(protocol.Envelope{HopCount: 0, Wire: signed})
	if err != nil {
		t.Fatal(err)
	}
	b, err := protocol.EncodeFrame(protocol.Envelope{HopCount: 9, Path: []uint16{1, 2, 3}, Wire: signed})
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasSuffix(a, signed) || !bytes.HasSuffix(b, signed) {
		t.Fatal("hop count and path must sit before the signed bytes and never inside them")
	}
}

func TestEncodeFrameRejectsALongPath(t *testing.T) {
	_, err := protocol.EncodeFrame(protocol.Envelope{Path: make([]uint16, protocol.MaxPath+1), Wire: []byte{0xa0}})
	if !errors.Is(err, protocol.ErrBadFrame) {
		t.Fatal("a path over the cap was accepted")
	}
}

func TestDecodeFrameRejectsBadInput(t *testing.T) {
	cases := map[string][]byte{
		"empty":                {},
		"hop count only":       {3},
		"path longer than cap": {0, protocol.MaxPath + 1, 0, 0, 0xa0},
		"path cut short":       {0, 2, 0, 1, 0},
		"no signed bytes":      {0, 0},
	}
	for name, frame := range cases {
		if _, err := protocol.DecodeFrame(frame); !errors.Is(err, protocol.ErrBadFrame) {
			t.Errorf("%s: err = %v, want ErrBadFrame", name, err)
		}
	}
}

func TestForwardedRaisesTheHopCountAndRecordsTheRelay(t *testing.T) {
	in := protocol.Envelope{HopCount: 1, Path: []uint16{7}, Wire: []byte{0xa0}}

	out := in.Forwarded(9)

	if out.HopCount != 2 || len(out.Path) != 2 || out.Path[1] != 9 {
		t.Fatalf("forwarded envelope %+v", out)
	}
	if len(in.Path) != 1 || in.HopCount != 1 {
		t.Fatal("Forwarded changed its receiver")
	}
}

func TestForwardedStopsRecordingWhenThePathIsFull(t *testing.T) {
	in := protocol.Envelope{HopCount: 4, Path: []uint16{1, 2, 3, 4}, Wire: []byte{0xa0}}

	out := in.Forwarded(5)

	if len(out.Path) != protocol.MaxPath || out.Path[3] != 4 {
		t.Fatalf("path %v, want the first four entries kept", out.Path)
	}
	if out.HopCount != 5 {
		t.Fatalf("hop count %d, want 5", out.HopCount)
	}
}

func TestForwardedSaturatesTheHopCount(t *testing.T) {
	if got := (protocol.Envelope{HopCount: math.MaxUint8}).Forwarded(1).HopCount; got != 255 {
		t.Fatalf("hop count wrapped to %d", got)
	}
}

func TestEncodeFrameRejectsAnEmptyMessage(t *testing.T) {
	if _, err := protocol.EncodeFrame(protocol.Envelope{HopCount: 1}); !errors.Is(err, protocol.ErrBadFrame) {
		t.Fatal("a frame with no signed bytes was encoded, and DecodeFrame would reject it")
	}
}

func TestDecodeFrameNeverPanics(t *testing.T) {
	signed, err := protocol.Sign(protocol.Ed25519Key(testKey(t)), protocol.ReferenceRequest())
	if err != nil {
		t.Fatal(err)
	}
	frame, err := protocol.EncodeFrame(protocol.Envelope{HopCount: 1, Path: []uint16{1, 2}, Wire: signed})
	if err != nil {
		t.Fatal(err)
	}
	for n := range len(frame) + 1 {
		_, _ = protocol.DecodeFrame(frame[:n])
	}
	for pathLen := range 256 {
		short := []byte{0, byte(pathLen), 0, 1, 0xa0}
		_, _ = protocol.DecodeFrame(short)
	}
}

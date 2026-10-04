package protocol

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"slices"
)

const (
	// FrameBudget is the size a frame must stay within when its message has no free text (NFR-PERF-01).
	FrameBudget = 240
	// MaxPath is the cap on the recorded path. A longer path is a malformed frame, never truncated.
	MaxPath = 4
)

var ErrBadFrame = errors.New("protocol: malformed frame")

// Envelope is the unsigned, mutable part of a frame: a relay raises the hop count and appends itself to
// the path. Wire is the complete encoded message exactly as the origin sent it.
type Envelope struct {
	HopCount uint8
	Path     []uint16
	Wire     []byte
}

func EncodeFrame(e Envelope) ([]byte, error) {
	if len(e.Path) > MaxPath {
		return nil, fmt.Errorf("%w: path has %d entries, cap is %d", ErrBadFrame, len(e.Path), MaxPath)
	}
	if len(e.Wire) == 0 {
		return nil, fmt.Errorf("%w: no message", ErrBadFrame)
	}
	out := make([]byte, 0, 2+2*len(e.Path)+len(e.Wire))
	out = append(out, e.HopCount, byte(len(e.Path))) //nolint:gosec // len(e.Path) <= MaxPath above
	for _, hop := range e.Path {
		out = binary.BigEndian.AppendUint16(out, hop)
	}
	return append(out, e.Wire...), nil
}

// DecodeFrame checks the layout and leaves the message to Decode. Wire aliases frame, so a caller that
// reuses its receive buffer must copy first.
func DecodeFrame(frame []byte) (Envelope, error) {
	if len(frame) < 2 {
		return Envelope{}, fmt.Errorf("%w: %d bytes", ErrBadFrame, len(frame))
	}
	n := int(frame[1])
	if n > MaxPath {
		return Envelope{}, fmt.Errorf("%w: path has %d entries, cap is %d", ErrBadFrame, n, MaxPath)
	}
	rest := frame[2:]
	if len(rest) < 2*n {
		return Envelope{}, fmt.Errorf("%w: path cut short", ErrBadFrame)
	}
	wire := rest[2*n:]
	if len(wire) == 0 {
		return Envelope{}, fmt.Errorf("%w: no message", ErrBadFrame)
	}
	var path []uint16
	for i := range n {
		path = append(path, binary.BigEndian.Uint16(rest[2*i:]))
	}
	return Envelope{HopCount: frame[0], Path: path, Wire: wire}, nil
}

// Forwarded is the envelope a relay sends on: hop count plus one (saturating) and the relay's tag appended
// to the path while there is room. It does not modify e.
func (e Envelope) Forwarded(tag uint16) Envelope {
	out := e
	out.Path = slices.Clone(e.Path)
	if out.HopCount < math.MaxUint8 {
		out.HopCount++
	}
	if len(out.Path) < MaxPath {
		out.Path = append(out.Path, tag)
	}
	return out
}

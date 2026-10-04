package protocol

import (
	"bytes"
	"errors"
	"fmt"

	"github.com/fxamacker/cbor/v2"
)

var (
	ErrNotCanonical  = errors.New("protocol: encoding is not the canonical form")
	ErrBadVersion    = errors.New("protocol: unsupported version")
	ErrTrailingBytes = errors.New("protocol: trailing bytes after the message")
	ErrTooLarge      = errors.New("protocol: message is over the size limit")
)

// MaxWireSize is the most bytes Decode accepts. It bounds the work an attacker can make a decode do.
const MaxWireSize = 1024

var (
	encMode = mustEncMode()
	decMode = mustDecMode()
)

func mustEncMode() cbor.EncMode {
	opts := cbor.CoreDetEncOptions()
	// A nil byte slice encodes as an empty byte string, not as null. Otherwise a wire with null in a byte
	// string field would decode to nil, re-encode to the same null and pass the canonical check.
	opts.NilContainers = cbor.NilContainerAsEmpty
	em, err := opts.EncMode()
	if err != nil {
		panic(err)
	}
	return em
}

func mustDecMode() cbor.DecMode {
	dm, err := cbor.DecOptions{
		DupMapKey:         cbor.DupMapKeyEnforcedAPF,
		ExtraReturnErrors: cbor.ExtraDecErrorUnknownField,
		IndefLength:       cbor.IndefLengthForbidden,
	}.DecMode()
	if err != nil {
		panic(err)
	}
	return dm
}

// Encode returns the canonical encoding of m, with whatever signature m carries.
func Encode(m Message) ([]byte, error) {
	return encMode.Marshal(m)
}

// Decode parses one message and rejects anything that is not its canonical encoding, or is over
// MaxWireSize.
func Decode(wire []byte) (Message, error) {
	if len(wire) > MaxWireSize {
		return Message{}, ErrTooLarge
	}
	var m Message
	rest, err := decMode.UnmarshalFirst(wire, &m)
	if err != nil {
		return Message{}, fmt.Errorf("protocol: decode: %w", err)
	}
	if len(rest) != 0 {
		return Message{}, ErrTrailingBytes
	}
	if m.Version != Version {
		return Message{}, ErrBadVersion
	}
	again, err := encMode.Marshal(m)
	if err != nil {
		return Message{}, err
	}
	if !bytes.Equal(again, wire) {
		return Message{}, ErrNotCanonical
	}
	return m, nil
}

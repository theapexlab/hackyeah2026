package protocol

// Message is the signed map. The integer labels are ascending and the signature is the last label,
// so the bytes to sign are the encoding with the signature element absent.
type Message struct {
	Version   uint8  `cbor:"1,keyasint"`
	Class     Class  `cbor:"2,keyasint"`
	Signer    []byte `cbor:"3,keyasint"`
	Seq       uint32 `cbor:"4,keyasint"`
	Timestamp uint32 `cbor:"5,keyasint"`
	TTL       uint16 `cbor:"6,keyasint"`
	HopLimit  uint8  `cbor:"7,keyasint"`
	Geohash   string `cbor:"8,keyasint,omitempty"`
	Radius    uint16 `cbor:"9,keyasint,omitempty"`
	Payload   []byte `cbor:"10,keyasint"`
	Signature []byte `cbor:"11,keyasint,omitempty"`
}

// ReferenceRequest is the fixed request the byte budget and the vectors are measured on.
func ReferenceRequest() Message {
	return Message{
		Version:   Version,
		Class:     ClassLifeCritical,
		Signer:    []byte{0xd7, 0x5a, 0x98, 0x01, 0x82, 0xb1, 0x0a, 0xb7},
		Seq:       17,
		Timestamp: 1791000000,
		TTL:       3600,
		HopLimit:  10,
		Geohash:   "u2yhv5",
		Radius:    12,
		Payload:   []byte("AED needed now"),
	}
}

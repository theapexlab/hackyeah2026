package protocol

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"errors"
)

var ErrBadSignature = errors.New("protocol: signature does not verify")

// Signer signs the bytes the signature covers. The role-keyed signers of the certificate authority
// implement it too.
type Signer interface {
	Sign(msg []byte) []byte
}

// Ed25519Key is a Signer over a plain Ed25519 private key.
type Ed25519Key ed25519.PrivateKey

func (k Ed25519Key) Sign(msg []byte) []byte {
	return ed25519.Sign(ed25519.PrivateKey(k), msg)
}

// signatureElementSize is label 11, a 64-byte string: the label byte, the 0x58 0x40 length head, 64 bytes.
const signatureElementSize = 3 + ed25519.SignatureSize

// SignedBytes is the encoding of m with the signature element absent.
func SignedBytes(m Message) ([]byte, error) {
	m.Signature = nil
	return Encode(m)
}

// ID is the message id, which is never sent: the hex of SHA-256 over the signed bytes, first 16 bytes.
func ID(wire []byte) (string, error) {
	m, err := Decode(wire)
	if err != nil {
		return "", err
	}
	tbs, err := SignedBytes(m)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(tbs)
	return hex.EncodeToString(sum[:16]), nil
}

// Sign signs m with signer and returns the full encoded message.
func Sign(signer Signer, m Message) ([]byte, error) {
	tbs, err := SignedBytes(m)
	if err != nil {
		return nil, err
	}
	m.Signature = signer.Sign(tbs)
	return Encode(m)
}

// stripSignature cuts the signature element off the end of a canonical wire message: the bytes the
// signature covers, taken from the received bytes rather than from a re-encoding. The signature is the
// last label, and the map has fewer than 24 entries, so the header is one byte holding the entry count.
func stripSignature(wire []byte) ([]byte, error) {
	n := len(wire)
	if n < signatureElementSize+1 || wire[0]&0xe0 != 0xa0 ||
		wire[n-signatureElementSize] != 0x0b || wire[n-signatureElementSize+1] != 0x58 ||
		wire[n-signatureElementSize+2] != ed25519.SignatureSize {
		return nil, ErrBadSignature
	}
	tbs := make([]byte, n-signatureElementSize)
	copy(tbs, wire)
	tbs[0]--
	return tbs, nil
}

// VerifySignature checks an Ed25519 signature over msg. Every signature check in the protocol goes
// through it.
func VerifySignature(pub ed25519.PublicKey, msg, sig []byte) error {
	if len(pub) != ed25519.PublicKeySize || !ed25519.Verify(pub, msg, sig) {
		return ErrBadSignature
	}
	return nil
}

// Verify decodes wire and checks its signature against pub.
func Verify(pub ed25519.PublicKey, wire []byte) error {
	m, err := Decode(wire)
	if err != nil {
		return err
	}
	if len(m.Signature) != ed25519.SignatureSize {
		return ErrBadSignature
	}
	tbs, err := stripSignature(wire)
	if err != nil {
		return err
	}
	return VerifySignature(pub, tbs, m.Signature)
}

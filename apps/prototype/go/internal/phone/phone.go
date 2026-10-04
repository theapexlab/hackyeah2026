// Package phone is the skeleton stand-in for the phone: it sends one signed request and leaves.
package phone

import (
	"context"
	"crypto/ed25519"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/broker"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
)

// Send signs m with key and sends it to the broker as node "phone".
func Send(ctx context.Context, brokerAddr string, key ed25519.PrivateKey, m protocol.Message) error {
	wire, err := protocol.Sign(protocol.Ed25519Key(key), m)
	if err != nil {
		return err
	}
	conn, err := broker.Dial(ctx, brokerAddr, "phone")
	if err != nil {
		return err
	}
	defer func() { _ = conn.Close() }()
	return broker.WriteFrame(conn, wire)
}

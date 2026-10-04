// Package relay verifies signed frames from the broker and passes the good ones on: back to the
// broker for its neighbours, or to the server when the relay is the gateway.
package relay

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/internal/broker"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol/event"
)

// IngestFunc delivers a verified message to the server.
type IngestFunc func(ctx context.Context, signed []byte) error

// Relay is a gateway when Ingest is set, and forwards to its neighbours otherwise. It writes one
// decision event per frame to Log, which defaults to discarding them.
type Relay struct {
	PublicKey ed25519.PublicKey
	Ingest    IngestFunc
	Node      string
	Mode      string
	Log       *slog.Logger
}

// Serve handles frames from conn until it closes or ctx ends.
func (r *Relay) Serve(ctx context.Context, conn net.Conn) error {
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stop()

	for {
		frame, err := broker.ReadFrame(conn)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
		decision, reason, id, class := r.judge(frame)
		r.emit(ctx, event.Event{MsgID: id, Class: class, Decision: decision, Reason: reason})
		if decision == event.Drop {
			continue
		}
		if err := r.deliver(ctx, conn, frame); err != nil {
			r.logger().Error("delivery failed", "node", r.Node, "msg_id", id, "err", err)
		}
	}
}

func (r *Relay) judge(frame []byte) (event.Decision, event.Reason, string, string) {
	decision := event.Forward
	if r.Ingest != nil {
		decision = event.Post
	}
	m, err := protocol.Decode(frame)
	if err != nil {
		return event.Drop, dropReason(err), "", ""
	}
	id, err := protocol.ID(frame)
	if err != nil {
		return event.Drop, dropReason(err), "", ""
	}
	if err := protocol.Verify(r.PublicKey, frame); err != nil {
		return event.Drop, dropReason(err), id, m.Class.String()
	}
	return decision, event.ReasonValid, id, m.Class.String()
}

func dropReason(err error) event.Reason {
	switch {
	case errors.Is(err, protocol.ErrBadSignature):
		return event.ReasonBadSignature
	case errors.Is(err, protocol.ErrNotCanonical):
		return event.ReasonNotCanonical
	case errors.Is(err, protocol.ErrBadVersion):
		return event.ReasonBadVersion
	default:
		return event.ReasonMalformed
	}
}

func (r *Relay) emit(ctx context.Context, e event.Event) {
	e.Node = r.Node
	e.Mode = r.Mode
	if e.Mode == "" {
		e.Mode = "peace"
	}
	e.TS = time.Now().UTC()
	event.Emit(ctx, r.logger(), e)
}

func (r *Relay) logger() *slog.Logger {
	if r.Log == nil {
		return event.NewLogger(io.Discard)
	}
	return r.Log
}

func (r *Relay) deliver(ctx context.Context, conn net.Conn, frame []byte) error {
	if r.Ingest != nil {
		return r.Ingest(ctx, frame)
	}
	return broker.WriteFrame(conn, frame)
}

// HTTPIngest posts the signed bytes to url.
func HTTPIngest(client *http.Client, url string) IngestFunc {
	return func(ctx context.Context, signed []byte) error {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(signed))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/cbor")
		resp, err := client.Do(req)
		if err != nil {
			return err
		}
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode/100 != 2 {
			return fmt.Errorf("relay: ingest returned %s", resp.Status)
		}
		return nil
	}
}

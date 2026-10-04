// Package broker stands in for the radio. Nodes connect over TCP, say who they are in a hello
// frame, wait for an empty ack frame, and every later frame reaches only the nodes next to the sender in a fixed adjacency map.
package broker

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"sync"
)

// maxFrame bounds one frame body. A real radio frame is a few hundred bytes.
const maxFrame = 64 * 1024

var errFrameTooLarge = errors.New("broker: frame too large")

// SkeletonAdjacency is the three-node line phone - relay - gateway. The phone cannot reach the
// gateway directly, which is what the skeleton proves.
func SkeletonAdjacency() map[string][]string {
	return map[string][]string{
		"phone":   {"relay"},
		"relay":   {"phone", "gateway"},
		"gateway": {"relay"},
	}
}

type Broker struct {
	adjacency map[string][]string

	mu     sync.Mutex
	ln     net.Listener
	closed bool
	nodes  map[string]*node
}

type node struct {
	conn net.Conn
	wmu  sync.Mutex
}

func New(adjacency map[string][]string) *Broker {
	return &Broker{adjacency: adjacency, nodes: map[string]*node{}}
}

// Serve accepts connections until Close is called.
func (b *Broker) Serve(ln net.Listener) error {
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		_ = ln.Close()
		return nil
	}
	b.ln = ln
	b.mu.Unlock()
	for {
		conn, err := ln.Accept()
		if err != nil {
			b.mu.Lock()
			closed := b.closed
			b.mu.Unlock()
			if closed {
				return nil
			}
			return err
		}
		go b.handle(conn)
	}
}

func (b *Broker) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.closed = true
	var err error
	if b.ln != nil {
		err = b.ln.Close()
	}
	for _, n := range b.nodes {
		_ = n.conn.Close()
	}
	return err
}

func (b *Broker) handle(conn net.Conn) {
	defer func() { _ = conn.Close() }()

	hello, err := ReadFrame(conn)
	if err != nil {
		return
	}
	id := string(hello)
	if _, ok := b.adjacency[id]; !ok {
		slog.Warn("broker: unknown node", "node", id)
		return
	}

	self := &node{conn: conn}
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return
	}
	if old := b.nodes[id]; old != nil {
		_ = old.conn.Close()
	}
	// Holding the write lock until the ack is out stops forward from putting a data frame ahead of it.
	self.wmu.Lock()
	b.nodes[id] = self
	b.mu.Unlock()
	ackErr := WriteFrame(conn, nil)
	self.wmu.Unlock()
	defer func() {
		b.mu.Lock()
		if b.nodes[id] == self {
			delete(b.nodes, id)
		}
		b.mu.Unlock()
	}()

	if ackErr != nil {
		return
	}
	for {
		body, err := ReadFrame(conn)
		if err != nil {
			return
		}
		b.forward(id, body)
	}
}

func (b *Broker) forward(from string, body []byte) {
	for _, to := range b.adjacency[from] {
		b.mu.Lock()
		n := b.nodes[to]
		b.mu.Unlock()
		if n == nil {
			continue
		}
		if err := n.write(body); err != nil {
			slog.Warn("broker: write failed", "from", from, "to", to, "err", err)
		}
	}
}

func (n *node) write(body []byte) error {
	n.wmu.Lock()
	defer n.wmu.Unlock()
	return WriteFrame(n.conn, body)
}

// WriteFrame writes body behind a 4-byte big-endian length. Clients of the broker use it too.
func WriteFrame(w io.Writer, body []byte) error {
	if len(body) > maxFrame {
		return errFrameTooLarge
	}
	frame := binary.BigEndian.AppendUint32(make([]byte, 0, 4+len(body)), uint32(len(body))) //nolint:gosec // len(body) <= maxFrame above
	_, err := w.Write(append(frame, body...))
	return err
}

func ReadFrame(r io.Reader) ([]byte, error) {
	var n [4]byte
	if _, err := io.ReadFull(r, n[:]); err != nil {
		return nil, err
	}
	size := binary.BigEndian.Uint32(n[:])
	if size > maxFrame {
		return nil, errFrameTooLarge
	}
	body := make([]byte, size)
	if _, err := io.ReadFull(r, body); err != nil {
		return nil, err
	}
	return body, nil
}

// Dial connects to the broker as node id and returns once the broker has registered it, so a frame
// sent right after cannot be lost to a neighbour that is not registered yet.
func Dial(ctx context.Context, addr, id string) (net.Conn, error) {
	conn, err := (&net.Dialer{}).DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, err
	}
	if err := WriteFrame(conn, []byte(id)); err != nil {
		_ = conn.Close()
		return nil, err
	}
	ack, err := ReadFrame(conn)
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("broker: no ack for node %q: %w", id, err)
	}
	if len(ack) != 0 {
		_ = conn.Close()
		return nil, fmt.Errorf("broker: unexpected ack for node %q", id)
	}
	return conn, nil
}

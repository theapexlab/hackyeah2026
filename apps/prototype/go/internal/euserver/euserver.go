// Package euserver is the Elevated User Server: it takes signed messages from the gateway and shows
// them on a page.
package euserver

import (
	"crypto/ed25519"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
)

// maxIngestBody bounds one POST body; a message is a few hundred bytes.
const maxIngestBody = 64 * 1024

type Received struct {
	ID      string
	Class   string
	Signer  string
	Seq     uint32
	Payload string
	At      time.Time
}

type Server struct {
	pub ed25519.PublicKey

	mu       sync.Mutex
	received []Received
}

func New(pub ed25519.PublicKey) *Server {
	return &Server{pub: pub}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /ingest", s.ingest)
	mux.HandleFunc("GET /{$}", s.page)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	return mux
}

func (s *Server) ingest(w http.ResponseWriter, r *http.Request) {
	wire, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxIngestBody))
	if err != nil {
		http.Error(w, "unreadable body", http.StatusBadRequest)
		return
	}
	if err := protocol.Verify(s.pub, wire); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	m, err := protocol.Decode(wire)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	id, err := protocol.ID(wire)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	s.received = append(s.received, Received{
		ID:      id,
		Class:   m.Class.String(),
		Signer:  fmt.Sprintf("%x", m.Signer),
		Seq:     m.Seq,
		Payload: string(m.Payload),
		At:      time.Now(),
	})
	s.mu.Unlock()
	w.WriteHeader(http.StatusAccepted)
}

func (s *Server) page(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	msgs := append([]Received(nil), s.received...)
	s.mu.Unlock()

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := Page(msgs).Render(r.Context(), w); err != nil {
		slog.Error("euserver: render failed", "err", err)
	}
}

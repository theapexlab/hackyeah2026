// Package event defines the one JSON line every node writes per forwarding decision. The scenario
// runner and the end-to-end tests read these lines instead of guessing from side effects.
package event

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"time"
)

type Decision string

const (
	Forward Decision = "forward"
	Post    Decision = "post"
	Drop    Decision = "drop"
)

type Reason string

const (
	ReasonValid        Reason = "valid"
	ReasonBadSignature Reason = "bad_signature"
	ReasonNotCanonical Reason = "not_canonical"
	ReasonBadVersion   Reason = "bad_version"
	ReasonMalformed    Reason = "malformed"
)

const message = "decision"

type Event struct {
	Node     string    `json:"node"`
	MsgID    string    `json:"msg_id"`
	Class    string    `json:"class"`
	Hop      int       `json:"hop"`
	Decision Decision  `json:"decision"`
	Reason   Reason    `json:"reason"`
	Mode     string    `json:"mode"`
	TS       time.Time `json:"ts"`
}

// NewLogger writes JSON lines with the time under "ts", the key the decision events use.
func NewLogger(w io.Writer) *slog.Logger {
	return slog.New(slog.NewJSONHandler(w, &slog.HandlerOptions{
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if len(groups) == 0 && a.Key == slog.TimeKey {
				a.Key = "ts"
			}
			return a
		},
	}))
}

// Emit writes e as one decision line through l, stamped with e.TS.
func Emit(ctx context.Context, l *slog.Logger, e Event) {
	rec := slog.NewRecord(e.TS, slog.LevelInfo, message, 0)
	rec.AddAttrs(
		slog.String("node", e.Node),
		slog.String("msg_id", e.MsgID),
		slog.String("class", e.Class),
		slog.Int("hop", e.Hop),
		slog.String("decision", string(e.Decision)),
		slog.String("reason", string(e.Reason)),
		slog.String("mode", e.Mode),
	)
	_ = l.Handler().Handle(ctx, rec)
}

// Parse reads one log line and reports whether it is a decision event.
func Parse(line []byte) (Event, bool) {
	var raw struct {
		Msg string `json:"msg"`
		Event
	}
	if err := json.Unmarshal(line, &raw); err != nil || raw.Msg != message {
		return Event{}, false
	}
	return raw.Event, true
}

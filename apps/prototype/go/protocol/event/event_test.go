package event_test

import (
	"bytes"
	"testing"
	"time"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol/event"
)

var sample = event.Event{
	Node:     "relay",
	MsgID:    "0123456789abcdef0123456789abcdef",
	Class:    "LIFE_CRITICAL",
	Hop:      1,
	Decision: event.Forward,
	Reason:   event.ReasonValid,
	Mode:     "peace",
	TS:       time.Date(2026, 10, 4, 9, 0, 0, 123000000, time.UTC),
}

func TestEmitWritesTheGoldenLine(t *testing.T) {
	var buf bytes.Buffer

	event.Emit(t.Context(), event.NewLogger(&buf), sample)

	want := `{"ts":"2026-10-04T09:00:00.123Z","level":"INFO","msg":"decision","node":"relay",` +
		`"msg_id":"0123456789abcdef0123456789abcdef","class":"LIFE_CRITICAL","hop":1,` +
		`"decision":"forward","reason":"valid","mode":"peace"}` + "\n"
	if buf.String() != want {
		t.Fatalf("got\n%s\nwant\n%s", buf.String(), want)
	}
}

func TestParseReadsAnEmittedLine(t *testing.T) {
	var buf bytes.Buffer
	event.Emit(t.Context(), event.NewLogger(&buf), sample)

	got, ok := event.Parse(buf.Bytes())

	if !ok || got != sample {
		t.Fatalf("Parse = %+v, %v; want %+v", got, ok, sample)
	}
}

func TestParseSkipsOtherLogLines(t *testing.T) {
	for _, line := range []string{
		`{"ts":"2026-10-04T09:00:00Z","level":"INFO","msg":"connected to broker"}`,
		`not json`,
		``,
	} {
		if _, ok := event.Parse([]byte(line)); ok {
			t.Errorf("Parse accepted %q", line)
		}
	}
}

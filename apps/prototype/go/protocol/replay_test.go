package protocol_test

import (
	"errors"
	"testing"
	"testing/synctest"
	"time"

	"github.com/theapexlab/hackyeah2026/apps/prototype/go/protocol"
)

func TestCheckTime(t *testing.T) {
	const now = 1791000000
	at := time.Unix(now, 0)
	tests := []struct {
		name string
		ts   uint32
		ttl  uint16
		now  time.Time
		want error
	}{
		{"timestamp equals now", now, 60, at, nil},
		{"exactly 300 s ahead is allowed", now + 300, 60, at, nil},
		{"301 s ahead is future", now + 301, 60, at, protocol.ErrFutureTimestamp},
		{"a fraction of a second is ignored", now + 301, 60, at.Add(999 * time.Millisecond), protocol.ErrFutureTimestamp},
		{"valid through ts+ttl", now - 60, 60, at, nil},
		{"one second past ts+ttl is expired", now - 61, 60, at, protocol.ErrExpired},
		{"valid at the last fraction of ts+ttl", now - 60, 60, at.Add(999 * time.Millisecond), nil},
		{"expired once the next second starts", now - 60, 60, at.Add(time.Second), protocol.ErrExpired},
		{"zero ttl is valid only at its own second", now, 0, at, nil},
		{"zero ttl one second later is expired", now - 1, 0, at, protocol.ErrExpired},
		{"ts+ttl does not wrap at 32 bits", 1<<32 - 1, 65535, time.Unix(1<<32, 0), nil},
		{"far ahead is future", now + 400, 0, at, protocol.ErrFutureTimestamp},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			m := protocol.Message{Timestamp: tc.ts, TTL: tc.ttl}
			if got := protocol.CheckTime(m, tc.now); !errors.Is(got, tc.want) {
				t.Fatalf("CheckTime = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestWindow(t *testing.T) {
	var w protocol.Window

	if got := w.Check(100); got != nil {
		t.Fatalf("first sequence on an empty window = %v, want nil", got)
	}
	w = w.Accept(100)

	steps := []struct {
		name string
		seq  uint32
		want error
	}{
		{"repeat of the top", 100, protocol.ErrReplay},
		{"new above the top", 101, nil},
		{"new inside the window, not seen", 99, nil},
		{"oldest slot of the window", 100 - 63, nil},
		{"one below the window", 100 - 64, protocol.ErrBelowWindow},
		{"far below the window", 3, protocol.ErrBelowWindow},
	}
	for _, s := range steps {
		if got := w.Check(s.seq); !errors.Is(got, s.want) {
			t.Errorf("%s: Check(%d) = %v, want %v", s.name, s.seq, got, s.want)
		}
	}

	w = w.Accept(99)
	if got := w.Check(99); !errors.Is(got, protocol.ErrReplay) {
		t.Fatalf("seen slot inside the window = %v, want ErrReplay", got)
	}

	// Moving the top up by 10 slides the window: 100-63 is now below it, 100-53 is the oldest slot.
	w = w.Accept(110)
	if got := w.Check(100 - 63); !errors.Is(got, protocol.ErrBelowWindow) {
		t.Errorf("slot that slid out = %v, want ErrBelowWindow", got)
	}
	if got := w.Check(110 - 63); got != nil {
		t.Errorf("oldest slot after the slide = %v, want nil", got)
	}
	if got := w.Check(100); !errors.Is(got, protocol.ErrReplay) {
		t.Errorf("old top still remembered after a small advance = %v, want ErrReplay", got)
	}
	if got := w.Check(99); !errors.Is(got, protocol.ErrReplay) {
		t.Errorf("seen slot kept through the slide = %v, want ErrReplay", got)
	}

	// A jump of 64 or more forgets everything below the new top.
	w = w.Accept(110 + 64)
	if got := w.Check(110); !errors.Is(got, protocol.ErrBelowWindow) {
		t.Errorf("after a 64-slot jump = %v, want ErrBelowWindow", got)
	}
	if got := w.Check(110 + 1); got != nil {
		t.Errorf("unseen slot inside the new window = %v, want nil", got)
	}
}

func TestWindowOldestSlotIsRemembered(t *testing.T) {
	w := protocol.Window{}.Accept(200).Accept(200 - 63)
	if got := w.Check(200 - 63); !errors.Is(got, protocol.ErrReplay) {
		t.Fatalf("seen oldest slot = %v, want ErrReplay", got)
	}
	if got := w.Check(200 - 62); got != nil {
		t.Fatalf("unseen neighbour of the oldest slot = %v, want nil", got)
	}
}

func TestWindowAdvanceBy63KeepsTheOldTop(t *testing.T) {
	w := protocol.Window{}.Accept(100).Accept(163)
	if got := w.Check(100); !errors.Is(got, protocol.ErrReplay) {
		t.Fatalf("old top after a 63-slot advance = %v, want ErrReplay", got)
	}
	if got := w.Check(101); got != nil {
		t.Fatalf("unseen slot after a 63-slot advance = %v, want nil", got)
	}
}

func TestWindowAdvanceIntoTheTopOfTheRange(t *testing.T) {
	w := protocol.Window{}.Accept(1<<32 - 10).Accept(1<<32 - 1)
	if got := w.Check(1<<32 - 10); !errors.Is(got, protocol.ErrReplay) {
		t.Fatalf("old top = %v, want ErrReplay", got)
	}
	if got := w.Check(5); !errors.Is(got, protocol.ErrBelowWindow) {
		t.Fatalf("a low number after max = %v, want ErrBelowWindow", got)
	}
}

func TestWindowSmallSequenceOnAnEmptyWindow(t *testing.T) {
	var w protocol.Window
	if got := w.Check(0); got != nil {
		t.Fatalf("seq 0 on an empty window = %v, want nil", got)
	}
	w = w.Accept(0)
	if got := w.Check(0); !errors.Is(got, protocol.ErrReplay) {
		t.Fatalf("repeat of seq 0 = %v, want ErrReplay", got)
	}
	if got := w.Check(1); got != nil {
		t.Fatalf("seq 1 after seq 0 = %v, want nil", got)
	}
}

func TestWindowAtTheTopOfTheRange(t *testing.T) {
	w := protocol.Window{}.Accept(1<<32 - 1)
	if got := w.Check(1<<32 - 1); !errors.Is(got, protocol.ErrReplay) {
		t.Fatalf("repeat at max = %v, want ErrReplay", got)
	}
	if got := w.Check(1<<32 - 2); got != nil {
		t.Fatalf("one below max = %v, want nil", got)
	}
}

type fakeClock struct{ now time.Time }

func (c *fakeClock) Now() time.Time { return c.now }

func TestReplayCacheReadsItsOwnClock(t *testing.T) {
	clock := &fakeClock{now: time.Unix(1791000000, 0)}
	c := protocol.NewReplayCache(clock)
	c.Remember("a", time.Minute)

	clock.now = clock.now.Add(time.Minute - time.Nanosecond)
	if !c.Seen("a") {
		t.Fatal("a forgotten before its retention")
	}
	clock.now = clock.now.Add(time.Nanosecond)
	if c.Seen("a") {
		t.Fatal("a kept past its retention")
	}
}

// A message first accepted at t0 with a timestamp 300 s ahead stays acceptable until t0+300+ttl, so an
// id kept for the longest ttl alone would be forgotten while a copy still passes CheckTime.
func TestRetentionOutlastsEveryCopyThatCheckTimeStillAccepts(t *testing.T) {
	const (
		maxTTL = time.Hour
		start  = 1791000000
	)
	t0 := time.Unix(start, 0)
	clock := &fakeClock{now: t0}
	c := protocol.NewReplayCache(clock)
	m := protocol.Message{Timestamp: start + 300, TTL: uint16(maxTTL / time.Second)}

	if err := protocol.CheckTime(m, clock.now); err != nil {
		t.Fatal(err)
	}
	c.Remember("a", protocol.Retention(maxTTL))

	for clock.now = t0; protocol.CheckTime(m, clock.now) == nil; clock.now = clock.now.Add(time.Second) {
		if !c.Seen("a") {
			t.Fatalf("id forgotten at +%v while a copy still passes CheckTime", clock.now.Sub(t0))
		}
	}
}

func TestReplayCacheKeepsAnIdForItsRetention(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		c := protocol.NewReplayCache(protocol.SystemClock{})
		if c.Seen("a") {
			t.Fatal("empty cache reports a hit")
		}

		c.Remember("a", time.Hour)
		c.Remember("b", 10*time.Minute)

		time.Sleep(10*time.Minute - time.Nanosecond)
		if !c.Seen("a") || !c.Seen("b") {
			t.Fatal("ids must survive until their retention ends")
		}

		time.Sleep(time.Nanosecond)
		if !c.Seen("a") {
			t.Fatal("a with a one-hour retention was forgotten early")
		}
		if c.Seen("b") {
			t.Fatal("b must be forgotten once its retention ends")
		}

		time.Sleep(50 * time.Minute)
		if c.Seen("a") {
			t.Fatal("a must be forgotten after its retention")
		}
	})
}

func TestReplayCacheRememberingAgainNeverShortensTheRetention(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		c := protocol.NewReplayCache(protocol.SystemClock{})
		c.Remember("a", time.Hour)
		c.Remember("a", time.Minute)

		time.Sleep(30 * time.Minute)
		if !c.Seen("a") {
			t.Fatal("a shorter second retention replaced the longer first one")
		}
	})
}

func TestReplayCachePrunesExpiredIds(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		c := protocol.NewReplayCache(protocol.SystemClock{})
		for _, id := range []string{"a", "b", "c"} {
			c.Remember(id, time.Minute)
		}
		time.Sleep(2 * time.Minute)
		c.Remember("d", time.Minute)
		if got := c.Len(); got != 1 {
			t.Fatalf("Len = %d after expiry and one new id, want 1", got)
		}
	})
}

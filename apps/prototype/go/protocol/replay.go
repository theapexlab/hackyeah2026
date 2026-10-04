package protocol

import (
	"errors"
	"maps"
	"time"
)

// MaxClockSkew is how far ahead of the receiver's clock a timestamp may be.
const MaxClockSkew = 300 * time.Second

// windowSize is the bit width of Window.seen (RFC 4303 style).
const windowSize = 64

var (
	ErrFutureTimestamp = errors.New("protocol: timestamp is more than 300 s ahead")
	ErrExpired         = errors.New("protocol: message has expired")
	ErrReplay          = errors.New("protocol: sequence number already seen")
	ErrBelowWindow     = errors.New("protocol: sequence number is below the replay window")
)

type Clock interface {
	Now() time.Time
}

type SystemClock struct{}

func (SystemClock) Now() time.Time { return time.Now() }

// CheckTime compares in whole seconds, because the wire carries whole seconds. A message is valid through
// its second timestamp+ttl and expired from the next one.
func CheckTime(m Message, now time.Time) error {
	ts, nowSec := int64(m.Timestamp), now.Unix()
	if ts-nowSec > int64(MaxClockSkew/time.Second) {
		return ErrFutureTimestamp
	}
	if ts+int64(m.TTL) < nowSec {
		return ErrExpired
	}
	return nil
}

// Window is the replay window of one credential: the highest sequence number accepted and a bitmap of
// the 64 numbers up to it. The zero value is empty. Check and Accept are separate so that a caller can
// accept a number only once the message has passed every later check, and Accept returns the new value
// instead of changing the receiver. Concurrent use is the caller's to guard.
type Window struct {
	started bool
	top     uint32
	seen    uint64 // bit i is set when top-i was accepted
}

func (w Window) Check(seq uint32) error {
	if !w.started || seq > w.top {
		return nil
	}
	back := w.top - seq
	if back >= windowSize {
		return ErrBelowWindow
	}
	if w.seen>>back&1 == 1 {
		return ErrReplay
	}
	return nil
}

func (w Window) Accept(seq uint32) Window {
	switch {
	case !w.started:
		return Window{started: true, top: seq, seen: 1}
	case seq > w.top:
		if ahead := seq - w.top; ahead >= windowSize {
			w.seen = 1
		} else {
			w.seen = w.seen<<ahead | 1
		}
		w.top = seq
	case w.top-seq < windowSize:
		w.seen |= 1 << (w.top - seq)
	}
	return w
}

// Retention is how long a cache must hold the id of a message whose ttl is at most maxTTL. A timestamp
// may be MaxClockSkew ahead, so a copy stays acceptable that much longer than ttl after the first one
// arrived, and CheckTime counts the last second as valid.
func Retention(maxTTL time.Duration) time.Duration {
	return maxTTL + MaxClockSkew + time.Second
}

// ReplayCache remembers message ids for a retention the caller chooses, normally Retention of the longest
// ttl the current mode allows. It is not safe for concurrent use.
type ReplayCache struct {
	clock   Clock
	expires map[string]time.Time
}

func NewReplayCache(clock Clock) *ReplayCache {
	return &ReplayCache{clock: clock, expires: make(map[string]time.Time)}
}

func (c *ReplayCache) Seen(id string) bool {
	until, ok := c.expires[id]
	return ok && c.clock.Now().Before(until)
}

// Remember records id for retention, and never shortens an id that is already held for longer. It
// prunes every expired id, so it costs a pass over the cache and has no size bound.
func (c *ReplayCache) Remember(id string, retention time.Duration) {
	now := c.clock.Now()
	maps.DeleteFunc(c.expires, func(_ string, until time.Time) bool { return !now.Before(until) })
	if until := now.Add(retention); until.After(c.expires[id]) {
		c.expires[id] = until
	}
}

func (c *ReplayCache) Len() int { return len(c.expires) }

# Decision events

Every node writes one JSON line for each frame it decides about. Scenario tooling and
the end-to-end tests read these lines, so a rule is checked from what nodes said, not from side effects.

One line, keys in this order:

| Key | Type | Meaning |
|---|---|---|
| `ts` | RFC 3339 string, UTC | When the node decided. |
| `level` | string | `INFO` for a decision. |
| `msg` | string | Always `decision`. A line with any other `msg` is not a decision event. |
| `service` | string | Added by the service binary, not part of the event. |
| `node` | string | The node id: `relay`, `gateway`. |
| `msg_id` | hex string, 32 characters | SHA-256 over the signed bytes without the signature element, first 16 bytes. Empty when the frame did not decode. |
| `class` | string | The class name, for example `LIFE_CRITICAL`. Empty when the frame did not decode. |
| `hop` | integer | Hops the node counted. The skeleton does not count hops yet and writes `0`. |
| `decision` | string | `forward`, `post` or `drop`. |
| `reason` | string | `valid` for `forward` and `post`. For `drop`: `bad_signature`, `not_canonical`, `bad_version` or `malformed`. |
| `mode` | string | `peace`, `L1`, `L2` or `L3`, the modes in `docs/diagrams/03-mode-state-machine.mmd`. The skeleton writes `peace`. |

`post` is a gateway handing a verified message to the server. A node writes the event before it acts
on the decision, so a `post` line can exist for a POST that then failed; that failure is a separate
`ERROR` line.

Example, as the golden test in `go/protocol/event/event_test.go` pins it:

```json
{"ts":"2026-10-04T09:00:00.123Z","level":"INFO","msg":"decision","node":"relay","msg_id":"0123456789abcdef0123456789abcdef","class":"LIFE_CRITICAL","hop":1,"decision":"forward","reason":"valid","mode":"peace"}
```

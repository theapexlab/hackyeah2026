# Pomóc open specification

The open specification of the Pomóc protocol, written so that a second
implementation can interoperate (NFR-INT-01). The JSON vectors in `testvectors/` are shared by the
Go library and the Kotlin SDK, so a rule both languages must agree on is a vector here before it is
code in either.

| File | Status |
|---|---|
| `wire-format.md` | Written: frame, message, classes, size budget |
| `log-events.md` | Written: the decision event every node logs |
| `credential-profile.md` | Not written yet |
| `forwarding-rules.md` | Not written yet |
| `mode-policy.md` | Not written yet |
| `cap-codes.md` | Not written yet |

## Test vectors

Each vector is a JSON file with `name`, `source`, `input`, `intermediates`, `output`, `expect` and
`diagnostic`. Binary fields end in `_hex`. A vector taken from an RFC is hand-written and names its
section in `source`. A vector Go produces is regenerated with `go run ./go/cmd/vectors -update`.

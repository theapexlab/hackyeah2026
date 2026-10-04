# wire-format

What a node sends and receives. A second implementation needs only this file and `testvectors/`.
The Go reference is `go/protocol/` (`message.go`, `class.go`, `frame.go`).

## Frame

A frame is one unit on the radio:

```
[hop_count u8] [path_len u8] [path_len x 2 bytes, big endian] [message]
```

- The first three parts are the **envelope**. It is unsigned. A relay raises `hop_count` by one and
  appends its own 2-byte tag to the path when it forwards.
- `hop_count` stops at 255 and does not wrap.
- `path_len` is at most 4 (`MaxPath`). A longer path is a malformed frame. A relay never truncates a
  path to make room; it stops recording once the path is full.
- The **message** is the complete encoded message exactly as the origin sent it, signature included.
  Nothing in the envelope is covered by the signature, so a relay can never change a signed field.
- A frame has at least one byte of message.
- The path records which relays carried the message (FR-NET-07). A response goes back along it while the
  nodes are still there, and floods to the requester otherwise.

## Message

The message is a CBOR map (RFC 8949) in the deterministic form of section 4.2.1: integer keys in
ascending order, definite lengths, shortest integer encodings. A decoder rejects any other encoding of
the same data, because the signature is checked over the received bytes.

A decoder rejects, before it reads further: a message over 1024 bytes; a map with an unknown, duplicate
or out-of-order label; a value of the wrong type or out of range for its field; an indefinite-length item;
a non-shortest integer or length; and bytes after the map. The decoder checks the size first, so an
oversize input costs no parsing. A decoded message re-encodes to exactly the bytes received.

| Label | Field | CBOR type | Notes |
|---|---|---|---|
| 1 | version | uint | `1`. Any other value is rejected. |
| 2 | class | uint | See the class table. |
| 3 | signer | byte string | The credential id (`cid`), 8 bytes. |
| 4 | seq | uint, up to 32 bits | Per `cid`, strictly increasing. |
| 5 | timestamp | uint, up to 32 bits | Seconds since the Unix epoch. |
| 6 | ttl | uint, up to 16 bits | Seconds. The message expires at `timestamp + ttl`. |
| 7 | hop_limit | uint, up to 8 bits | `255` means unbounded. |
| 8 | geohash | text string | Six characters. Omitted when the message has no area. |
| 9 | radius | uint, up to 16 bits | Meters. Omitted when absent. |
| 10 | payload | byte string | Class specific. |
| 11 | signature | byte string | Ed25519, 64 bytes. Always last. |

The signature covers the encoding of the map with label 11 absent and the map header counting one entry
fewer. Call these the bytes the signature covers. The message id is never sent. Every node computes it as
the first 16 bytes of SHA-256 over those same bytes.

A verifier cuts the signature element off the received bytes and decrements the map header; it does not
re-encode. Every Ed25519 check goes through one function, which rejects a public key that is not 32 bytes.
The vectors `spec/testvectors/ed25519/rfc8032-1.json` and `wycheproof-sample.json` pin it.

## Classes

The codes are fixed. A code is never reused.

| Code | Class | Payload budget (bytes) | Link local |
|---|---|---|---|
| 1 | LIFE_CRITICAL | 32 | no |
| 2 | SAFETY | 32 | no |
| 3 | CHECK_IN | 24 | no |
| 4 | INFO | 64 | no |
| 5 | OFFICIAL_ALERT | 96 | no |
| 6 | MODE_DECLARATION | 64 | no |
| 7 | CASUALTY_REPORT | 96 | no |
| 8 | TOPOLOGY | 96 | no |
| 9 | PORTAL_SUMMARY | 64 | no |
| 10 | LEND | 48 | no |
| 11 | BORROW | 48 | no |
| 12 | GIVE | 48 | no |
| 13 | SELL | 48 | no |
| 14 | CREDENTIAL_ANNOUNCE | 125 | yes |
| 15 | CREDENTIAL_REQUEST | 8 | yes |

A **link local** class travels one hop. It carries no geohash, no radius and no recorded path. The
decision pipeline enforces this (`forwarding-rules.md`); the frame layer does not know the class.
CREDENTIAL_ANNOUNCE carries the 125-byte compact credential. CREDENTIAL_REQUEST carries the 8-byte `cid`
that is being asked for.

The payload budget is for a message without free text. A message with free text may reach 1 KB
(NFR-PERF-01). A payload layout per class will be specified with its class: the CAP subset in
`cap-codes.md`, the declaration in `mode-policy.md`, the announce in `credential-profile.md`. None of
the three is written yet.

## Size budget

A frame without free text is at most 240 bytes (`FrameBudget`, NFR-PERF-01). The table is the largest
legal message of each class: every optional field present, a four-entry path, the sequence, timestamp and
ttl at their widest encodings, and the payload at its budget. The test `TestAllClassesFit240` produces it.

| Class | Message bytes | Frame bytes |
|---|---|---|
| LIFE_CRITICAL | 148 | 158 |
| SAFETY | 148 | 158 |
| CHECK_IN | 140 | 150 |
| INFO | 180 | 190 |
| OFFICIAL_ALERT | 212 | 222 |
| MODE_DECLARATION | 180 | 190 |
| CASUALTY_REPORT | 212 | 222 |
| TOPOLOGY | 212 | 222 |
| PORTAL_SUMMARY | 180 | 190 |
| LEND, BORROW, GIVE, SELL | 164 | 174 |
| CREDENTIAL_ANNOUNCE | 229 | 231 |
| CREDENTIAL_REQUEST | 111 | 113 |

The largest frame is CREDENTIAL_ANNOUNCE at 231 bytes, which leaves 9 bytes. Among the classes that carry a
path, the largest are OFFICIAL_ALERT, CASUALTY_REPORT and TOPOLOGY at 222 bytes, which leaves 18.
The CAP subset in `cap-codes.md` and the sealed casualty payload (80 bytes: a 32-byte encapsulated key and
a 48-byte ciphertext) must fit these budgets.

## Reference request

The signed LIFE_CRITICAL request that the vectors and the skeleton use is 122 bytes: signer `d75a980182b10ab7`,
sequence 17, timestamp 1791000000, ttl 3600, hop limit 10, geohash `u2yhv5`, radius 12, payload
`AED needed now`. See `testvectors/skeleton/`.

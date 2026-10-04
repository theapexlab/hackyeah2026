# Prototype roadmap

What is left to build in the [Pomóc prototype](README.md), in dependency order.

## Phases

Each phase needs the phases in its Depends on column. Phases 2 and 3 can start in parallel once
phase 1 is done: phase 3 runs without credentials until phase 2 provides them. The codec part of
phase 4 can also start after phase 1.

| Phase | Builds | Depends on | State |
|---|---|---|---|
| 0 Foundations | Pinned toolchain, build, containers, the end-to-end path | none | Done |
| 1 Protocol core | Go protocol library, open specification, shared test vectors | 0 | 4 of 14 steps done |
| 2 Certificate authority | Registration: checks identity, attestation and proof of possession, then signs the certificate over the phone's own public key; renewal; region-scoped declaration keys for local authorities; transparency log; web certificates | 1 | Not started |
| 3 Radio, relay, gateway | Broker with link loss, delay, power and backhaul; relay with disk buffer, topology gossip, captive portal | 1, and 2 for credentials | Not started |
| 4 Kotlin SDK | Phone library that generates its key on the device, and a host that runs many virtual phones in one JVM | 1, then 2 and 3 | Not started |
| 5 Elevated User Server | Role login for the local authority's crisis office and for Police, Fire, Emergency Medical Services and Military; live dashboard; mode declarations and alerts for the authority's own region, L3 with two approvers | 2, 3 | Not started |
| 6 Scenarios and metrics | A Kraków district fixture, ten scripted scenarios, reach and delivery metrics, a one-command demo | 2 to 5 | Not started |
| 7 Hardening | Security scans, decoder fuzzing, reproducible builds, licence audit, clean-clone check | 0 to 6 | Not started |

## Phase 1 steps

| Step | State |
|---|---|
| Wire format and size budget | Done |
| Strict deterministic codec | Done |
| Signature envelope and message id | Done |
| Time, replay and sequence window | Done |
| Classes, priorities and the mode matrix | Next. The class codes and payload budgets exist; priorities and the mode matrix do not |
| Compact credential and trust bundle | Open |
| Validity, grace period and role rules | Open |
| Credential reference, announce and hold | Open |
| Policy and the mode state machine | Open |
| The forwarding decision pipeline | Open |
| Rate limits, de-duplication cache, queue and expiry | Open |
| Privacy and scope checks | Open |
| Shared test vectors for the new rules | Open |
| Specification review | Open |

Open questions:

- Which drop reason a sequence number below the replay window maps to. The candidates are
  `DUPLICATE` and `STALE_TIMESTAMP`.
- Where the replay window is persisted between restarts. `Window` in
  `apps/prototype/go/protocol/replay.go` has no exported state yet.
- The time and window rules have no shared test vectors yet. They need them before the Kotlin SDK
  implements the same rules.

## Trust model

Phases 2 and 4 follow `docs/concept.md` and FR-ID-02 to FR-ID-04: the phone generates its own key
pair, and the authority only signs the certificate over the public key. No private key travels
anywhere. Containers have no secure element and no hardware attestation, so the emulation needs a
software stand-in for both.

## Target design

When phase 6 is done, the stack runs a whole district:

```
 phone (Kotlin host, N virtual phones)      relay                       gateway (relay with backhaul)
        |  TCP frames                           |  TCP frames                 |  TCP frames
        +-----------------> radio broker <------+-----------------------------+
                            (adjacency, loss, delay, power, backhaul flag)
                                                                              |  HTTPS, only when backhaul is up
                                                          +-------------------+-------------------+
                                                          v                                       v
                                                 Certificate authority                    Elevated User Server
                                                 (sign certificates, renew, certify       (ingest, dashboard, role login,
                                                  region keys, transparency log)           declaration console, alert console)
```

The broker is the only path between mesh nodes. A node reaches the certificate authority or the
server only while the broker reports its backhaul as up, which follows FR-NET-11.

## Related

- [Prototype README](README.md)
- [Concept](../../docs/concept.md)
- [Functional requirements](../../docs/requirements/functional.md)

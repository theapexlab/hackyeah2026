# Pomóc

_The network that is already there._

**A dual-use civic mesh for cities.** In peacetime it is a hyperlocal, identity-verified
resource-sharing network: borrow a drill, get sour cream from the neighbour instead of
driving to the shop, hand over a parking spot. When mobile networks or power fail, the same
network switches into a resilient emergency mode: phones and home routers relay signed
emergency requests (AED, EpiPen, fire, first aid) and official alerts hop-by-hop, without
any backbone.

Built for **HackYeah 2026, Open Task: SMART CITY**.

## One-paragraph pitch

A city already owns almost everything it needs; it is just in the wrong pocket. A drill is
used for 13 minutes in its lifetime, an AED hangs on a wall 80 metres from a cardiac arrest.
Pomóc does not create resources, it creates the _route_ between a need and a resource,
through the people and devices physically around you. Every participant is a node in a
proximity graph; routers are the static backbone, phones are the mobile edge. The same
graph, the same identities and the same protocol serve two very different days: the
ordinary Tuesday and the day the network goes dark.

## Two operating modes

|                 | Peace mode                                             | Emergency mode                                              |
| --------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| Purpose         | Waste reduction, utilisation, neighbourhood efficiency | Resilient communication and life-critical resource routing  |
| Request classes | Lend / borrow / give / sell, information               | Life-critical, safety, official alerts, "I am OK" check-ins |
| Payments        | Optional micro-payments or credits                     | Disabled                                                    |
| Reach           | Hop-limited (local by design)                          | Hop limit raised, store-and-forward enabled                 |
| Transport       | Internet when available, mesh otherwise                | Router mesh, then phone-only degraded mesh                  |
| Trigger         | Default                                                | Local backhaul loss, or signed national declaration         |

## Actors

- **Citizen**: registered with address and ID, holds a device key pair, can request and offer.
- **Router / relay node**: ISP-managed CPE bound to a verified customer, relays only, cannot act.
- **Authority**: issues citizen certificates, signs emergency declarations and official alerts.
- **ISP**: provisions relay capability on routers remotely (existing TR-069 / TR-369 channel).
- **Gateway**: a node with backhaul (satellite, municipal fibre) bridging mesh islands to the authority.

## Hackathon scope

Nothing of the production system is built at the hackathon. The deliverable is an
**interactive simulation** that shows the protocol and both operating modes on a city-scale
graph (routers as static nodes, phones as mobile nodes), including mode switching, controlled
flooding with hop limits, TTL and de-duplication, store-and-forward via moving people, and
coverage analysis for decision makers. Cryptography is standard and not simulated; the
simulation is about mesh behaviour.

## Running the simulation

The hackathon deliverable is a browser-only simulation of the protocol on a district graph.
It lives in `apps/sim` (Vite, React, Mantine) on top of `packages/core` (the pure TypeScript
protocol engine, unit-tested, no UI dependencies). Cryptography is stubbed: trust is a
boolean on each message's signer, so forged messages are still *computed* as rejected.

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # engine tests (vitest)
pnpm typecheck  # tsc for both packages
pnpm check      # biome lint + format
pnpm build      # static bundle in apps/sim/dist (works offline, relative base)
```

### Driving the demo

Configure the world in the left panel (phones, routers, gateways, radio ranges, seed, random
walk) and press **Generate**. **Reset** rebuilds the same seed, so a rehearsed run replays
exactly. Click any device, or the Authority badge, to inspect its inbox, store-and-forward
buffer and log, and to act from it (send a request, accept one, check in, declare a level,
broadcast an alert, cut power).

| Key | Event |
|---|---|
| `c` | Mobile network (cells) up / down |
| `g` | Power grid on / off: routers without battery backup go dark |
| `1` `2` `3` | Authority declares L1 Disruption / L2 Disaster / L3 Security (regions via the Authority inspector) |
| `0` | Authority all-clear (L3 steps down through L1, never straight to peace) |
| `a` | Authority broadcasts an official alert |
| `r` | A random citizen sends a request allowed in its current mode |
| `x` | The nearest eligible citizen accepts the oldest open request |
| `f` | An unregistered phone sends a forged request; every neighbour drops it |
| `space` `.` `+` `-` | Play / pause, single step, speed |
| `v` `t` `h` `d` `Esc` | Range circles, topology packets, fit view, dark / light, deselect |

Packets move one hop per tick, so the flood, the response travelling back along the recorded
path, store-and-forward across islands and the hop-limit edge are all visible on the map.

## Documents

- [Concept](docs/concept.md): vision, actors, trust model, modes, economics.
- [Functional requirements](docs/requirements/functional.md)
- [Non-functional requirements](docs/requirements/non-functional.md)
- [Prior art and related initiatives](docs/prior-art.md)
- [Diagrams](docs/diagrams/README.md): system overview, trust model, mode state machine, degradation ladder, AED scenario, forwarding logic

## Disclosure

Concept development, research and documentation were done with AI assistance
(Claude Code). External sources are cited in [docs/prior-art.md](docs/prior-art.md).

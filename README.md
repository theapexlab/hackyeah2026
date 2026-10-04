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
| Request classes | Lend / borrow / give, local questions                  | Life-critical, safety, official alerts, "I am OK" check-ins, sealed casualty reports, local info (off at L3) |
| Fees            | Free by default; a lender may ask a fee for a loan, settled directly between the two people | Disabled                         |
| Reach           | Hop-limited (local by design)                          | Hop limit raised, store-and-forward enabled                 |
| Transport       | Mesh between neighbours; internet only to reach the Authority | Router mesh, then phone-only degraded mesh                  |
| Trigger         | Default                                                | Local backhaul loss, or signed local authority declaration         |

## Actors

- **Citizen**: registered with address and ID, holds a device key pair, can request and offer.
- **Router / relay node**: ISP-managed CPE bound to a verified customer, relays only, cannot act.
- **Authority**: issues citizen certificates, signs emergency declarations and official alerts.
- **ISP**: provisions relay capability on routers remotely (existing TR-069 / TR-369 channel), unpaid, as required by regulation.
- **Gateway**: a node with backhaul (satellite, municipal fibre) bridging mesh islands to the authority.

**Funding.** Pomóc is government-legalised, nonprofit software. ISPs receive no payment and
sign no commercial contract. The only infrastructure cost is the gateway servers, which the
governing body has to maintain anyway as its communication hubs.

## Hackathon scope

Nothing of the production system is built at the hackathon. The deliverable is an
**interactive simulation** that shows the protocol and both operating modes on a city-scale
graph (routers as static nodes, phones as mobile nodes), including mode switching, controlled
flooding with hop limits, TTL and de-duplication, and store-and-forward via moving people. Coverage planning for the city is part of the
vision, not of the simulation. Cryptography is standard and not simulated; the
simulation is about mesh behaviour. Also not modelled: topology gossip (links come from
device positions and radio range), per-sender rate limits, AED / resource matching,
casualty reports and the router captive portal.

## Prototype

Beyond the hackathon deliverable, [`apps/prototype`](apps/prototype/README.md) holds a partly built
prototype of the protocol and services: Go services running as containers on one machine, with real
signatures, and the start of a Kotlin phone SDK. Its README says what works today and what is left.

## Running the simulation

The hackathon deliverable is a browser-only simulation of the protocol on a district graph.
It lives in `apps/sim` (Vite, React, Mantine) on top of `packages/core` (the pure TypeScript
protocol engine, unit-tested, no UI dependencies). Cryptography is stubbed: trust is a
boolean on each message's signer, so forged messages are still *computed* as rejected.

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # engine + sim pure-module tests (vitest)
pnpm typecheck  # tsc for both packages
pnpm check      # biome lint + format
pnpm build      # static bundle in apps/sim/dist (works offline, relative base)
```

### Driving the demo

The demo opens already playing, in real time: a tick is 200 ms of simulated time and takes
200 ms at 1×; 10× and 60× compress ten minutes into one or six. Protocol timers are
shortened for the stage: losing the cells triggers L1 after 1 s instead of 10 min,
declarations last 60 s and message TTLs are 24–60 s, so every effect shows within a minute. Configure the world in the left panel (phones, routers,
gateways, radio ranges, seed, phones on the move) and press **Generate**. **Reset** rebuilds the same seed, so a rehearsed run
replays exactly.

The default seed **42 loads Kraków**: about 2.2 × 1.3 km around the Vistula bend (Kazimierz,
Stradom, Stare Podgórze, Dębniki, Grzegórzki, Zabłocie), traced from a street map into a street
graph with parks and the river. Nothing stands in the Vistula: phones start on streets,
gateways on the most central street junctions (the first on the network's central hub, the
others at least 400 m apart), routers anywhere outside the river and the parks (in the blocks between the
streets). A phone or gateway moved into the water lands on the nearest street, a router moved
into the water or a park on the nearest allowed spot, and only the bridges cross the river. With **Phones on the move** on (the default), at every moment 10% of the phones walk
(2–3 km/h), 5% cycle (10 km/h) and 10% drive (50 km/h). Each traveller follows the shortest
street route to a destination (walks 120–600 m, sometimes into a park and back; rides
300–1500 m; drives 500–2000 m), stops and lingers there for 30 s to 5 min, then sets off again
on foot, by bike or by car, whichever is short of people, or stays put for good while someone
else sets off. Everyone else stays still. In an emergency mode
every phone and router that receives a message keeps a copy for five simulated minutes and
hands it to anyone who comes into range without it (walkers, cyclists and drivers carry it
between islands); only then is the copy dropped. Any other seed draws a procedural district of the configured size. Click any device, or the Authority badge, to inspect its inbox, store-and-forward
buffer and log, and to act from it (send a request, accept one, check in, declare a level,
broadcast an alert, cut power). A lime badge on a phone counts the requests it currently sees
as open.

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

Concept, research, documentation and the simulation code were made with AI assistance
(Claude Code); the title illustration was generated with Gemini. External sources are cited in [docs/prior-art.md](docs/prior-art.md).

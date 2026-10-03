# Colony (working title)

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
Colony does not create resources, it creates the _route_ between a need and a resource,
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
graph (routers as static nodes, phones as mobile nodes), including mode switching, signature
verification, hop limits, store-and-forward via moving people, and coverage analysis for
decision makers.

## Documents

- [Concept](docs/concept.md): vision, actors, trust model, modes, economics.
- [Functional requirements](docs/requirements/functional.md)
- [Non-functional requirements](docs/requirements/non-functional.md)
- [Prior art and related initiatives](docs/prior-art.md)

## Disclosure

Concept development, research and documentation were done with AI assistance
(Claude Code). External sources are cited in [docs/prior-art.md](docs/prior-art.md).

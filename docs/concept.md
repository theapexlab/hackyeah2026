# Concept

## Vision

Cities fail in two ways that look unrelated but share a root cause: in ordinary times,
resources sit idle because nobody nearby knows they exist; in emergencies, help sits idle
because nobody can reach it. Both are routing problems on the same graph: the graph of who
is physically near whom.

Colony is a state-backed, identity-verified proximity network that runs on devices people
already own (phones) and devices the state already regulates (ISP home routers). It has
one protocol and two rule sets.

The inspiration is the ant colony, not literally but structurally: no node sees the whole
colony, every node acts on local information, and coordinated behaviour emerges anyway.

## Actors and node castes

| Actor              | Node type | Can request | Can offer / accept | Relays                    | Identity                                                          |
| ------------------ | --------- | ----------- | ------------------ | ------------------------- | ----------------------------------------------------------------- |
| Citizen (phone)    | Mobile    | Yes         | Yes                | Yes                       | Citizen certificate issued by the Authority                       |
| Unregistered phone | Mobile    | No          | No                 | Yes (emergency mode only) | None                                                              |
| Home router (CPE)  | Static    | No          | No                 | Yes                       | Relay certificate issued by the ISP, bound to a verified customer |
| Gateway            | Static    | No          | No                 | Yes, plus backhaul        | Authority or municipal certificate                                |
| Authority          | Virtual   | Broadcasts  | No                 | No                        | Root key, embedded in every app build                             |

Routers are the backbone caste: powered, static, dense in cities, and already remotely
manageable by ISPs. Phones are the worker caste: mobile, battery-powered, and the only
thing left when the power goes.

## Trust model

Standard public key infrastructure, nothing exotic:

1. The app generates a key pair on the device. The private key never leaves the device.
2. On registration (address plus national ID, in practice through the national identity
   wallet such as mObywatel or an EUDI wallet) the Authority signs the citizen's public
   key, producing a **citizen certificate**. The certificate is pseudonymous on the wire:
   the Authority knows the mapping, peers see only a stable pseudonym.
3. Every request, offer, acceptance and check-in is signed with the device private key and
   carries the certificate.
4. Any node can verify any message **offline** using only the Authority root public key,
   which is embedded in the app. No network round trip is needed.
5. Certificates are short-lived and renewed silently in peace mode, so revocation does not
   depend on fetching revocation lists during an outage.
6. Routers hold **relay certificates** issued by the ISP under the Authority root. A relay
   certificate grants forwarding rights only. Messages signed by a relay certificate are
   rejected as requests. "Routers cannot act" is therefore a cryptographic property, not a
   policy.
7. Emergency declarations and official alerts are signed with Authority keys. A forged
   declaration is unverifiable and dropped by every node.

## Operating modes

### Peace mode (default)

- Local resource sharing: lend, borrow, give away, sell, share information.
- Requests carry a **hop limit** (default 3, max 6) and an optional geographic radius.
  Reach is local by protocol design, not by policy.
- Optional micro-payment or credit per transaction. The mental model is **shared ownership
  amortisation**: a tool pays itself back through community use, so a breakage after N
  lends is already covered.
- Transport: internet when available, mesh when not. The protocol does not care.

### Emergency mode

- Entered when (a) a node has seen no backhaul for a configurable window, or (b) a signed
  national or regional declaration arrives over the mesh. Case (b) overrides (a).
- Payments disabled. Request classes restricted to: life-critical, safety, official alert,
  check-in ("I am OK"), and no-payment resource sharing (water, generator, shelter).
- Hop limit raised, time-to-live extended, **store-and-forward** enabled: messages wait on
  a node until a new neighbour appears. Moving people become data mules between islands.
- Priority classes: life-critical traffic pre-empts everything.
- Degradation ladder:
  1. Internet up: normal.
  2. Mobile network down, power up: router backbone carries traffic, phones attach.
  3. Power down: routers dark, phone-only mesh for hours, store-and-forward bridges gaps.
  4. Gateways (satellite, generator-backed municipal sites) reconnect islands to the Authority.
- An attacker who jams cells to force emergency mode gains nothing: emergency mode is
  strictly less capable than peace mode.

## Message classes

| Class                                     | Peace              | Emergency         | Signed by            | Payment  |
| ----------------------------------------- | ------------------ | ----------------- | -------------------- | -------- |
| LEND / BORROW / GIVE / SELL               | Yes                | GIVE only         | Citizen              | Optional |
| INFO (local question or answer)           | Yes                | Yes               | Citizen              | No       |
| LIFE_CRITICAL (AED, EpiPen, insulin, CPR) | Yes, high priority | Yes, top priority | Citizen              | Never    |
| SAFETY (fire, flooding, structural)       | Yes                | Yes               | Citizen              | Never    |
| CHECK_IN ("I am OK", "I need evacuation") | No                 | Yes               | Citizen              | Never    |
| OFFICIAL_ALERT                            | Yes                | Yes               | Authority            | Never    |
| MODE_DECLARATION                          | n/a                | n/a               | Authority            | Never    |
| TOPOLOGY (neighbour list, link state)     | Yes                | Yes               | Any node incl. relay | Never    |

## The graph

- Nodes: citizens, routers, gateways, and registered static resources (public AEDs,
  hydrants, shelters) pinned to a location.
- Edges: radio adjacency (changes per second for phones, stable for routers), weighted by
  signal quality bucket (near, medium, far).
- A request is a bounded breadth-first search over the adjacency graph.
- Each node knows only its ego network. Nodes gossip their neighbour lists (link state)
  so that any node, or a city dashboard, can assemble the topology.
- Static routers make the peacetime graph **predictable**: coverage gaps, articulation
  points and the percolation threshold can be computed in advance and used to decide
  where battery-backed relays or gateways belong.

## Why the state

- Identity: only a state can verify that every participant is a real, locatable person,
  which is what makes lending to strangers and trusting an emergency request possible.
- Routers: only a regulator can ask ISPs to enable a dormant relay capability on CPE.
- Legitimacy: emergency declarations and alerts need a root of trust that everyone
  already accepts.
- Legal design: because the operator is the state, thresholds for occasional income,
  liability for lent goods and data retention can be designed into the system rather
  than litigated afterwards.

## Why not just an app, a LoRa network or satellite

- Consumer mesh apps (Bridgefy, Briar, bitchat) have no identity, no backbone and no
  peacetime reason to be installed. Adoption at disaster time is too late.
- LoRa meshes (Meshtastic, ClusterDuck) need new hardware and reach the fewest people in
  the poorest districts.
- Direct-to-device satellite needs line of sight and new handsets, and carries almost no
  capacity per cell.
- Routers are already in every household, dense exactly where people are, and already
  remotely managed.

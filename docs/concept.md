# Concept

## Vision

Cities fail in two ways that look unrelated but share a root cause: in ordinary times,
resources sit idle because nobody nearby knows they exist; in emergencies, help sits idle
because nobody can reach it. Both are routing problems on the same graph: the graph of who
is physically near whom.

Pomóc is a state-backed, identity-verified proximity network that runs on devices people
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
| Authority          | Virtual   | Broadcasts  | No                 | No                        | Root key, embedded in every app build; generates and issues all citizen key pairs                            |

Routers are the backbone caste: powered, static, dense in cities, and already remotely
manageable by ISPs. Phones are the worker caste: mobile, battery-powered, and the only
thing left when the power goes.

## Trust model

Standard public key infrastructure with **issuer-generated keys**:

1. The Authority (governance body) generates the key pair. On registration (address plus
   national ID, in practice through the national identity wallet such as mObywatel or an
   EUDI wallet) it issues the private key and the **citizen certificate** together. The
   certificate is pseudonymous on the wire: the Authority knows the mapping, peers see
   only a stable pseudonym.
2. The private key is delivered wrapped to a non-extractable enrollment key created in the
   device secure element at install time. The device imports it into the secure element;
   it never exists in clear outside the HSM and the secure element, including on any mesh
   hop.
3. Every request, offer, acceptance and check-in is signed with the device private key and
   carries the certificate.
4. Any node can verify any message **offline** using only the Authority root public key,
   which is embedded in the app. No network round trip is needed.
5. Certificates and key pairs are short-lived and re-issued silently. In peace mode renewal
   goes over the internet; during an outage the renewal request is forwarded through the
   mesh to a gateway and the issuer returns a receipt, so revocation and renewal do not
   depend on fetching lists during an outage.
6. Routers hold **relay certificates** issued by the ISP under the Authority root. A relay
   certificate grants forwarding rights only. Messages signed by a relay certificate are
   rejected as requests. "Routers cannot act" is therefore a cryptographic property, not a
   policy.
7. Emergency declarations and official alerts are signed with Authority keys. A forged
   declaration is unverifiable and dropped by every node.

### Key escrow and its mitigations

Because the Authority generates every private key, it can impersonate any citizen. That is
accepted as the price of a single trusted issuer and bounded as follows:

1. **No retention.** Private keys are generated inside an HSM, exported only wrapped to the
   target device, and destroyed after delivery is confirmed. Escrow, where law requires
   it, is a separate, split-knowledge vault (k-of-n custodians), never the issuing HSM.
2. **Wrapped delivery.** A key is wrapped to the device enrollment key, so mesh hops and
   gateways carry ciphertext only.
3. **Short life.** 30-day keys bound the window of any compromise; a compromised key is
   superseded by the next issuance.
4. **Separate issuing key.** Citizen-certificate issuance uses a different key from
   declarations and alerts (NFR-SEC-04), so abuse of citizen keys cannot forge official
   messages.
5. **Dual control and audit.** Issuance HSMs require m-of-n operators; access is logged
   under rules published in advance (NFR-PRV-04).
6. **Non-repudiation is not claimed.** A signature proves "a credential the Authority
   issued", not "this person". Disputes in peace mode already rest on reputation
   (FR-GOV-06), not on signature evidence.

## Operating modes

### Peace mode (default)

- Local resource sharing: lend, borrow, give away, sell, share information.
- Requests carry a **hop limit** (default 3, max 6) and an optional geographic radius.
  Reach is local by protocol design, not by policy.
- Optional micro-payment or credit per transaction. The mental model is **shared ownership
  amortisation**: a tool pays itself back through community use, so a breakage after N
  lends is already covered.
- Transport: peer traffic is always mesh. The internet is only a path to authorities and
  issuers (registration, renewal, ledger, alerts, sync). Without internet, authority-bound
  messages are forwarded through the mesh to a gateway, gated by the sender's priority class.

### Emergency mode: levels and policy

Emergency mode is not one setting. Every signed MODE_DECLARATION carries a **policy**,
and three named levels are presets of that policy. This keeps the rules explainable
without hard-wiring them.

Policy fields: `portal_write` (none / check-in / check-in + structured request),
`citizen_classes`, `hop_limit`, `ttl`, `store_and_forward`, `phone_topology_gossip`,
`emission` (normal / reduced). Portal aggregation (see below) is always on.

| | L1 Disruption | L2 Disaster | L3 Security |
|---|---|---|---|
| Typical cause | cell outage, cable cut, cyberattack on networks | flood, storm, earthquake, long blackout | terror, war, hybrid attack |
| Entered by | local automation (no backhaul) or declaration | declaration only | declaration only |
| Router captive portal | read + check-in, aggregated | read + check-in + structured request, aggregated, flagged unverified | **read only**, one-way |
| Citizen classes | LIFE_CRITICAL, SAFETY, CHECK_IN, CASUALTY_REPORT, INFO, free GIVE | same | LIFE_CRITICAL, SAFETY, CHECK_IN, CASUALTY_REPORT only; **INFO off** |
| Hop limit | 10 | 15 | 6 |
| Phone topology gossip | on | on | **off** (routers only) |
| Radio emission | normal | normal | reduced duty cycle |
| Payments | off | off | off |

Why L3 is stricter than "one-way":

- **Rumour control.** Under terror or war the citizen INFO class is the disinformation
  channel. Only Authority-signed messages propagate as information; life-critical and
  safety requests remain because they are concrete and signed.
- **Visibility.** Phone neighbour-list gossip draws a map of where people are. In peace
  that is the coverage map; in war it is a target map. Routers keep gossiping because
  their locations are known anyway.

Transitions:

- Local automation reaches **L1 at most**. L2 and L3 are political decisions and need a
  signature. The worst an attacker can force by jamming cells is L1, which is permissive.
- Downgrades need a signed all-clear or expiry. L3 always steps down through L1, never
  straight to peace.
- Declarations are regional: one district can be at L3 while the rest of the city is at L2.

Common to all levels: payments disabled, priority classes on, store-and-forward on,
and the degradation ladder below.

- Degradation ladder:
  1. Internet up: normal.
  2. Mobile network down, power up: router backbone carries traffic, phones attach.
  3. Power down: routers dark, phone-only mesh for hours, store-and-forward bridges gaps.
  4. Gateways (satellite, generator-backed municipal sites) reconnect islands to the Authority.

### Captive portal and flood resistance

In emergency mode routers broadcast an open SSID and serve a captive portal, so phones
without the app can take part. The portal is the only unauthenticated entry point, so it
is bounded by three rules at every level:

1. **Aggregate, never forward.** A router never relays portal inputs one by one. Once a
   minute it emits one signed PORTAL_SUMMARY ("router X: 23 OK, 2 need evacuation"). This
   is the single message class a relay certificate may originate, and it is rate-limited,
   so mesh load is bounded by the number of routers, not by an attacker.
2. **Free text stays local.** Any free-text field is visible only to clients of that
   router. Only structured, few-byte fields enter the mesh.
3. **Per-client rate limit** at the router (one input per device per minute). MAC
   randomisation only distorts the local counter; rule 1 protects the mesh.

Portal-derived numbers are always flagged unverified and shown on the dashboard in a
separate column from signed citizen check-ins.

## Message classes

| Class                                     | Peace              | Emergency         | Signed by            | Payment  |
| ----------------------------------------- | ------------------ | ----------------- | -------------------- | -------- |
| LEND / BORROW / GIVE / SELL               | Yes                | GIVE only         | Citizen              | Optional |
| INFO (local question or answer)           | Yes                | Yes               | Citizen              | No       |
| LIFE_CRITICAL (AED, EpiPen, insulin, CPR) | Yes, high priority | Yes, top priority | Citizen              | Never    |
| SAFETY (fire, flooding, structural)       | Yes                | Yes               | Citizen              | Never    |
| CHECK_IN ("I am OK", "I need evacuation"; status in the clear, free text sealed to contacts and the Authority) | No | Yes | Citizen | Never |
| CASUALTY_REPORT (sealed to the Authority: short message, optional position; relays forward it opaque) | No | Yes | Citizen | Never |
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

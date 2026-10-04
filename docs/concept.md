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
| Authority          | Virtual   | Broadcasts  | No                 | No                        | Root key, embedded in every app build; certifies separate issuing, declaration and alert keys                            |

Routers are the backbone caste: powered, static, dense in cities, and already remotely
manageable by ISPs. Phones are the worker caste: mobile, battery-powered, and the only
thing left when the power goes.

### Radio layer

| Link            | Technology                                   | Multi-peer                         | Caveat                                                                    |
| --------------- | -------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| Router ↔ router | 802.11s Wi-Fi mesh, fixed city-wide channel  | Yes, peers with every router in range | mac80211 firmware (OpenWrt / prplOS); closed Broadcom CPE is portal-only |
| Phone ↔ router  | Ordinary Wi-Fi client on the emergency SSID  | One router at a time               | None; strongest phone path, works on every handset                        |
| Phone ↔ phone   | BLE extended advertising, Wi-Fi Aware on Android | Yes, connectionless broadcast  | 255 B per packet; iOS relays fully only in foreground                     |

Only the router layer is a Wi-Fi mesh. Phones flood over Bluetooth LE, so the phone-only
stage is Android-first; iPhones are endpoints in background. Broadcast frames carry no
acknowledgement and go out at the lowest rate, so hop limit and TTL are capacity controls,
not only reach controls. Indoors through concrete a hop is 20 to 40 m, not 100 to 200 m.

## Trust model

Standard public key infrastructure with **device-generated keys and Authority-signed
certificates**:

1. On registration the phone's secure element (Android Keystore / StrongBox, iOS Secure
   Enclave) generates the key pair. The private key is non-exportable and never leaves the
   chip, including on any mesh hop or at the Authority.
2. The phone sends a certificate request through the national identity wallet (mObywatel or
   an EUDI wallet), which has already verified the person (address plus national ID). The
   request carries the public key, a proof-of-possession signature made with the private
   key, and a hardware attestation (Android Key Attestation, Apple App Attest) proving the
   key was generated inside genuine secure hardware.
3. The Authority checks the identity, the attestation chain, the proof of possession and
   that the person holds no other active certificate, then signs the **citizen
   certificate** over the public key. The certificate is pseudonymous on the wire: the
   Authority knows the mapping, peers see only a stable pseudonym.
4. Every request, offer, acceptance and check-in is signed with the device private key and
   carries the certificate.
5. Any node can verify any message **offline** using only the Authority root public key,
   which is embedded in the app. No network round trip is needed.
6. Certificates are short-lived (about 30 days) and renewed silently: the phone generates a
   new key and sends a renewal request signed with the current one. In peace mode renewal
   goes over the internet; during an outage the request is forwarded through the mesh to a
   gateway and the issuer returns the new certificate, so renewal does not depend on
   fetching lists during an outage.
7. Routers hold **relay certificates** issued by the ISP under the Authority root. A relay
   certificate grants forwarding rights only. Messages signed by a relay certificate are
   rejected as requests. "Routers cannot act" is therefore a cryptographic property, not a
   policy.
8. Emergency declarations are made by **local authorities** (the city or gmina crisis
   management office) for their own area, signed with a region-scoped declaration key
   certified under the Authority root. Official alerts are signed the same way. A forged
   declaration is unverifiable and dropped by every node.

### Why the key is born on the device

1. **The Authority still controls validity.** No certificate, no voice on the network; the
   Authority can refuse a request or let a certificate expire.
2. **Nothing to steal at the issuer.** No private key ever exists outside a phone, so there
   is no escrow, no key vault to breach, and the Authority cannot impersonate a citizen.
3. **Spoofing is stopped at registration.** Emulators and tampered phones cannot produce a
   valid hardware attestation; a copied certificate is useless without the chip holding its
   key.
4. **It is the only option on iPhones.** The Secure Enclave holds only keys it generated
   itself; an issuer-generated key could not be hardware-protected on iOS.
5. **Separate issuing key.** Citizen-certificate issuance uses a different key from
   declarations and alerts (NFR-SEC-04), so abuse of the issuing key cannot forge official
   messages.
6. **Non-repudiation is not claimed.** A signature proves "a credential the Authority
   certified on an attested device", not "this person". Disputes in peace mode already rest
   on reputation (FR-GOV-06), not on signature evidence.

## Operating modes

### Peace mode (default)

- Local resource sharing: lend, borrow, give away, share information.
- Requests carry a **hop limit** (default 3, max 6) and an optional geographic radius.
  Reach is local by protocol design, not by policy.
- Free by default. A fee appears only when someone borrows for money: the lender may ask a
  small fee for a loan, the borrower sees it before accepting, and the two settle directly
  (BLIK, cash). Pomóc only shows the fee the lender asked; it never moves or stores money.
  The mental model is **shared ownership amortisation**: a tool lent for small fees pays
  itself back, so a breakage after N lends is already covered.
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
| Typical cause | cell outage, cable cut, cyberattack on networks | flood, storm, earthquake, long blackout | armed attack, hybrid threat |
| Entered by | local automation (no backhaul) or local authority declaration | local authority declaration | local authority declaration |
| Router captive portal | read + check-in, aggregated | read + check-in + structured request, aggregated, flagged unverified | **read only**, one-way |
| Citizen classes | LIFE_CRITICAL, SAFETY, CHECK_IN, CASUALTY_REPORT, INFO, free GIVE | same | LIFE_CRITICAL, SAFETY, CHECK_IN, CASUALTY_REPORT only; **INFO off** |
| Hop limit | 10 | 15 | 6 |
| Phone topology gossip | on | on | **off** (routers only) |
| Radio emission | normal | normal | reduced duty cycle |
| Loan fees | off | off | off |

Why L3 is stricter than "one-way":

- **Rumour control.** Under an armed or hybrid attack the citizen INFO class is the disinformation
  channel. Only Authority-signed messages propagate as information; life-critical and
  safety requests remain because they are concrete and signed.
- **Visibility.** Phone neighbour-list gossip draws a map of where people are. In peace
  that is the coverage map; under attack it is a target map. Routers keep gossiping because
  their locations are known anyway.

Transitions:

- Local automation reaches **L1 at most**. L2 and L3 are political decisions and need a
  signature. The worst an attacker can force by jamming cells is L1, which is permissive.
- Downgrades need a signed all-clear or expiry. L3 always steps down through L1, never
  straight to peace.
- Declarations are regional: one district can be at L3 while the rest of the city is at L2.

Common to all levels: loan fees disabled, priority classes on, store-and-forward on,
and the degradation ladder below.

- Degradation ladder:
  1. Internet up: normal.
  2. Mobile network down, power up: router backbone carries traffic, phones attach.
  3. Power down: routers dark, phone-only BLE mesh for hours (Android-first, iPhones in
     foreground), store-and-forward bridges gaps.
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

| Class                                     | Peace              | Emergency         | Signed by            | Fee      |
| ----------------------------------------- | ------------------ | ----------------- | -------------------- | -------- |
| LEND / BORROW                             | Yes                | No                | Citizen              | Optional, set by the lender |
| GIVE                                      | Yes                | Yes               | Citizen              | Never    |
| INFO (local question or answer)           | Yes                | Yes               | Citizen              | No       |
| LIFE_CRITICAL (AED, EpiPen, insulin, CPR) | Yes, high priority | Yes, top priority | Citizen              | Never    |
| SAFETY (fire, flooding, structural)       | Yes                | Yes               | Citizen              | Never    |
| CHECK_IN ("I am OK", "I need evacuation"; status in the clear, free text sealed to contacts and the Authority) | No | Yes | Citizen | Never |
| CASUALTY_REPORT (sealed to the Authority: short message, optional position; relays forward it opaque) | No | Yes | Citizen | Never |
| OFFICIAL_ALERT                            | Yes                | Yes               | Authority            | Never    |
| MODE_DECLARATION                          | n/a                | n/a               | Local authority      | Never    |
| TOPOLOGY (neighbour list, link state)     | Yes                | Yes               | Any node incl. relay | Never    |

## The graph

- Nodes: citizens, routers, gateways, and registered static resources (public AEDs,
  hydrants, shelters) pinned to a location.
- Edges: radio adjacency (changes per second for phones, stable for routers), weighted by
  signal quality bucket (near, medium, far).
- A request is a bounded breadth-first search over the adjacency graph.
- Each node knows only its ego network. Nodes gossip their neighbour lists (link state)
  so that any node, or a city dashboard, can assemble the topology.
- Static routers make the backbone **predictable**; phones make the edge **ever-changing**,
  with density shifting by district, time of day and season. A city dashboard tracks both
  over time: where Pomóc is thin, the city can add battery-backed relays or gateways, or run
  campaigns and incentives to raise local participation. This coverage planning is part of
  the vision, not of the hackathon simulation.

## Why the state

- Identity: only a state can verify that every participant is a real, locatable person,
  which is what makes lending to strangers and trusting an emergency request possible.
- Routers: only a regulator can ask ISPs to enable a dormant relay capability on CPE.
- Funding: Pomóc is government-legalised, nonprofit software. ISPs are not paid and sign
  no commercial contract: the relay capability is enabled by regulation through the ISP's
  existing update channel. The only infrastructure cost is the gateway servers, which the
  governing body has to maintain anyway as its communication hubs.
- Legitimacy: emergency declarations and alerts need a root of trust that everyone
  already accepts.
- Legal design: because the operator is the state, liability for lent goods and data
  retention can be designed into the system rather than litigated afterwards. Pomóc moves
  no money, so it is neither a marketplace operator nor a payment service.

## Why not just an app, a LoRa network or satellite

- Consumer mesh apps (Bridgefy, Briar, bitchat) have no identity, no backbone and no
  peacetime reason to be installed. Adoption at disaster time is too late.
- LoRa meshes (Meshtastic, ClusterDuck) need new hardware and reach the fewest people in
  the poorest districts.
- Direct-to-device satellite needs line of sight and new handsets, and carries almost no
  capacity per cell.
- Routers are already in every household, dense exactly where people are, and already
  remotely managed.

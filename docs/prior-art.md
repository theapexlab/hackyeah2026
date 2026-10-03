# Prior art and related initiatives

Research done 2026-10-03. The purpose is twofold: cite what we build on, and show the
jury precisely where Pomóc differs. Short version: every building block exists somewhere,
nobody has combined verified identity, a dual peace / emergency mode, and a two-caste mesh
of phones plus ISP routers into one civic system.

## Closest conceptual match

**Smart Street Lights and Mobile Citizen Apps for Resilient Communication in a Digital City**
(Meuser et al., TU Darmstadt, arXiv 1908.10233, 2019). Proposes a citizen app with an
_everyday mode_ (client-server, gives people a reason to install it before a crisis) and an
_emergency mode_ where middleware switches to direct exchange with access points on smart
street lights. This is the same dual-use insight as ours. Differences: their backbone is
new municipal hardware (street lights), ours is hardware already in every home (ISP
routers); they have no identity layer and no peer-to-peer resource economy; their emergency
backbone dies with street power, ours continues on phones with store-and-forward.

## Infrastructure precedents: ISPs opening existing hardware in emergencies

- **00000JAPAN** (Japan, all carriers since 2014). During major disasters carriers flip a
  configuration on their existing public access points to broadcast an open SSID
  "00000JAPAN" usable by anyone, any carrier, any SIM. No new hardware, activation within
  hours. This is the strongest real-world proof that "remote config change on existing
  radios in an emergency" is operationally and politically acceptable. Difference: it still
  needs the backhaul behind the access point; Pomóc works when the backhaul is gone.
- **Comcast Xfinity hotspots** (USA). Before hurricanes Ian, Idalia and Milton, Comcast
  opened 141 000 to 261 000 public hotspots, many of them the second SSID on customer home
  gateways, to customers and non-customers alike. Same pattern, same limitation.
- **Lifeline: Emergency Ad Hoc Network** (arXiv 2203.16857, 2022). Battery-powered routers
  that boot into ad hoc mode when grid power fails, proposed for hospitals, schools and
  public buildings. We take the battery-backed relay idea for the coverage planning view.

## Phone-to-phone mesh

- **Relay-by-Smartphone** (Tohoku University, Kozo Keikaku Engineering, Japan). Born from
  the 2011 earthquake. Phones relay messages and photos over BLE and D2D Wi-Fi in a
  "bucket brigade" to collect safety status and deliver it to evacuation centres. Japan's
  government has tested it for years. Closest match to our phone-only degraded mode and
  to the "I am OK" check-in. No identity, no peacetime function, no router backbone.
- **Bridgefy** (BLE mesh, 12M+ users, used in Hong Kong 2019, Iran, Ukraine). Shows that
  consumer mesh is installable at scale, and that adoption spikes only when the crisis has
  already started. Had serious cryptographic flaws found by researchers in 2020.
- **Briar** (Android, Bluetooth / Wi-Fi / Tor, strong privacy) and **bitchat** (BLE mesh,
  iOS and Android, open source, launched July 2025). Good references for transport
  engineering; both are chat tools without identity or civic integration.
- **Serval Project**, **FireChat** (discontinued), **qaul.net**: earlier generations of the
  same idea.

## Dedicated-hardware emergency meshes

- **ClusterDuck Protocol / Project OWL** (Linux Foundation, LoRa on ESP32, IBM Call for
  Code 2018 winner). Rapidly deployable LoRa mesh for hurricane response; active with
  documentation updates in 2026. Needs new hardware delivered into the disaster zone.
- **Meshtastic**, **goTenna**: LoRa consumer and professional meshes. Same hardware
  dependency.
- **Safe Mesh**, **SafeGrid**, **Crisis Connect**, **Offline Protocol**: 2025-era startups
  selling solar / battery nodes or phone mesh to municipalities. Validates the market,
  none has identity or a peacetime mode.
- University of Zürich / St. Gallen off-grid system (October 2025): LoRa radios plus
  phone app for civilian emergency communication under infrastructure loss or
  cyberattack.

## Peacetime hyperlocal sharing

- **Peerby** (Amsterdam, since 2011). Demand-first neighbourhood lending: a request is
  pushed to neighbours, 80% of requests fulfilled within 30 minutes. Members are verified,
  lenders can insure items. This validates the peacetime behaviour we assume. Difference:
  centralised, platform-verified identity, no emergency function, no mesh.
- **Olio** (food and household surplus), **Nextdoor**, library-of-things schemes: same
  space, same limitations.

## Identity and alerting infrastructure we plug into

- **mObywatel** (Poland). The national identity app. Alert RCB warnings are being moved
  into it in 2025 in addition to SMS, with threat-ended messages. Pomóc's registration
  would be a module of mObywatel and its OFFICIAL_ALERT class would be the offline
  continuation of Alert RCB when the mobile network is down.
- **EU Digital Identity Wallet (eIDAS 2.0)**. Every member state must offer a certified
  wallet; it issues verifiable attributes (name, address) to apps. This is the standard
  path for the "verified real person" requirement and for cross-border use.
- **Alert RCB / EECC Article 110**. EU law already mandates public warning systems; they
  run on cellular (cell broadcast or location SMS) and therefore fail with the cells.
- **EU direct-to-device satellite pilot (EENA, 2025)** and **European Critical
  Communication System (EUCCS)**: Europe is actively funding emergency communication
  resilience; Pomóc is the ground layer those programmes lack.

## Where Pomóc is different

| Property                                      | Consumer mesh apps | LoRa meshes   | 00000JAPAN / Xfinity | Street-light paper | Peerby         | **Pomóc**                      |
| --------------------------------------------- | ------------------ | ------------- | -------------------- | ------------------ | -------------- | ------------------------------- |
| Works with backhaul gone                      | Yes                | Yes           | No                   | Partly             | No             | Yes                             |
| Works with grid power gone                    | Yes                | Yes (battery) | No                   | No                 | No             | Yes (phone caste)               |
| Uses hardware already deployed                | Phones             | No            | Yes                  | No                 | n/a            | Phones + routers                |
| Verified real-person identity                 | No                 | No            | No                   | No                 | Platform-level | State-level, offline-verifiable |
| Reason to have it installed before the crisis | No                 | No            | n/a                  | Yes                | Yes            | Yes                             |
| Hop-limited local economy                     | No                 | No            | No                   | No                 | Centralised    | Yes                             |
| Official alerts verifiable offline            | No                 | No            | No                   | No                 | No             | Yes                             |

## Sources

- https://arxiv.org/pdf/1908.10233
- https://arxiv.org/pdf/2203.16857
- https://arxiv.org/html/2509.22568v1
- https://www.softbank.jp/en/sbnews/entry/20220913_01
- https://visitor.access-network.jp/00000japan/
- https://medium.com/social-innovation-japan/japans-free-disaster-wifi-service-00000japan-665c2f40fcb8
- https://corporate.comcast.com/press/releases/comcast-free-xfinity-wifi-hotspot-network-hurricane-ian
- https://www.businesswire.com/news/home/20230830668215/en/Comcast-Opens-Free-Xfinity-WiFi-Hotspots-as-Hurricane-Idalia-Approaches
- https://www.bosai-jp.org/en/solution/detail/130/search
- https://en.wikipedia.org/wiki/Smartphone_ad_hoc_network
- https://bridgefy.me/
- https://www.kaspersky.com/blog/mesh-messengers/54192/
- https://bitchat.online/2025/07/22/bluetooth-chat-apps-compared-bitchat-bridgefy-briar-more/
- https://github.com/ClusterDuck-Protocol/ClusterDuck-Protocol
- https://devops.com/project-owl-announces-new-release-of-clusterduck-protocol-to-build-emergency-mesh-networks/
- https://meshtastic.org/
- https://safemesh.vercel.app/
- https://safegrid.app/
- https://www.helpnetsecurity.com/2025/10/08/off-grid-emergency-communication/
- https://rominwest.nl/en/game-changers/peerby-peer2peer-platform-for-borrowing-and-lending-items-in-the-neighborhood/
- https://techcrunch.com/2013/09/29/peerbys-local-lending-app-is-ready-to-help-neighbours-participate-in-the-sharing-economy/
- https://www.dobreprogramy.pl/alerty-rcb-w-mobywatelu-rzad-zapowiada-szybsze-ostrzezenia,7330692328925408a
- https://polskieradio24.pl/polska/alert-rcb-juz-nie-tylko-sms-em-nowe-powiadomienia-w-mobywatelu
- https://caribou.global/publications/european-digital-identity-wallet/
- https://eena.org/press-releases/eenas-pilot-project-on-direct-to-device-emergency-communications-secures-strong-mep-support/
- https://home-affairs.ec.europa.eu/news/enhancing-europes-capacity-react-preparing-european-critical-communication-system-2026-01-30_en
- https://www.governing.com/archive/gov-mesh-networking-service-during-emergencies.html

# Infrastructure Plan — Docker, Redis, Grafana, Elasticsearch, Kafka, Kubernetes, ZooKeeper

Written 2026-10-08. What each tool is, what it would do in DevTinder specifically, whether it's
worth adding, and the order to learn them. Companion to `docs/roadmap.md` (Phases 4–5).

Run all of this on the **personal laptop**, not a company device. Running everything at once
needs ~16 GB RAM — Elasticsearch and Kafka are the heavy ones.

---

## Quick picture

| Tool | One-line idea | Analogy |
|---|---|---|
| **Docker** | Packages the app with everything it needs, so it runs the same on any machine | A shipping container: same box on any ship, truck or train |
| **Kubernetes (K8s)** | Runs and manages many Docker containers across many servers | The port manager deciding where containers go, replacing broken ones |
| **Redis** | A very fast database that lives in memory | A sticky note on your desk vs a filing cabinet in the basement |
| **Kafka** | A durable message log: services publish events, others read them, even later | A newspaper archive: anyone reads any edition, in order, whenever |
| **ZooKeeper** | Coordination service other distributed systems used to stay in sync | The meeting chair who keeps everyone agreed on who's in charge |
| **Elasticsearch** | A search engine for your own data: fast full-text, typo-tolerant | Google, but for your own database |
| **Grafana** | Dashboards and alerts for the app's health | A car dashboard: speed, fuel, warning lights |

---

## Each one in DevTinder

### Docker — yes, definitely (roadmap Phase 4)
**Problem:** "works on my machine." Setting up the project on a new laptop (Node 22, MongoDB,
`.env`) is exactly this pain.
**In DevTinder:** a `Dockerfile` for the backend, one for the frontend, and a
`docker-compose.yml` that starts **api + web + mongo + redis** with one command:
`docker compose up`. A new machine only needs Docker installed.
**Interview:** "Containers vs virtual machines?" "What's in your Dockerfile and why?"

### Redis — yes (roadmap Phase 5), real uses in this app
1. **Rate limiting** for `/login` and the OTP routes (security audit #3). Redis counts attempts
   per IP/email, so the limit holds even with several servers.
2. **Caching the feed** — the heaviest query. Cache each user's candidate list for ~1 minute;
   clear it when they swipe.
3. **Caching Nominatim results** — a repeated "Nehru Place" search skips the 1 req/sec limit.
4. **Socket.io adapter** for chat across servers — without it, two users connected to different
   servers can't message each other.
5. **Token denylist** — real logout / revoke on password reset (security audit #8).
6. **BullMQ queues** (built on Redis) — send OTP emails in the background.

**Interview:** cache invalidation strategies; rate limiting across servers. Among the most-asked
backend topics.

### Grafana — yes, as part of monitoring
Grafana only *draws* data; it needs sources:
- **Prometheus** collects numbers. The Node app exposes `/metrics` via `prom-client`: requests
  per second, response time per route, error rate.
- **Loki** collects logs (the `pino` logging from roadmap Phase 1).

**In DevTinder:** dashboard for feed response time, login failures (a spike = someone
brute-forcing), and 500 errors; an alert when errors jump.
**Interview:** "How would you know your app is broken before users tell you?"

### Elasticsearch — yes, if you build a search feature
**In DevTinder:** "Find developers who know **React and Node** near me" — searching names,
skills, and **about-me** text, typo-tolerant ("reactjs" still finds "React"). MongoDB only does
basic text search. Keep MongoDB as the main database and copy user profiles into Elasticsearch
for searching.
**The hard part (and the interview gold):** keeping the two in sync when a user edits their
profile or deletes their account.
**Cost:** heavy — 1–2 GB RAM just to run locally.

### Kafka — optional, learning exercise only
**What it's really for:** many services and huge event volumes (Uber trips, LinkedIn activity)
where events must be kept and replayed.
**Honest take:** one app with a few users doesn't need Kafka. For background jobs, Redis +
BullMQ is far simpler. To learn it anyway, use it where it genuinely fits: every swipe, match
and message becomes an event; a separate "analytics service" reads them and computes stats
(match rate, most active hours).
**Interview:** be ready to say **why** it's there and that it's more than this app needs.

### ZooKeeper — skip
Kafka used to need ZooKeeper to coordinate its servers. **Kafka 4.0 removed that requirement**
(KRaft mode: Kafka coordinates itself). Learning ZooKeeper now is learning something on its way
out. Interview line: "Kafka moved from ZooKeeper to KRaft."

### Kubernetes — last, optional
**What it's for:** running dozens of containers across many servers, restarting crashed ones,
scaling up under load.
**Honest take:** DevTinder runs fine on one server with Docker Compose. Learn K8s **after**
Docker, locally with `kind` or `minikube`: deploy the api with 3 copies, kill one, watch
Kubernetes replace it. Managed cloud clusters cost real money — local is enough for a portfolio.

---

## Target architecture

```
             ┌──────────────┐
  Browser ──▶│ nginx        │
             └──────┬───────┘
          ┌─────────┴─────────┐
          ▼                   ▼
   React (web)         Node API ×3  ──▶ MongoDB      (main data)
                          │  │  │  ──▶ Redis        (cache, rate limits, sessions, chat adapter, queues)
                          │  │  └───▶ Elasticsearch (search profiles by skills/about)
                          │  └──────▶ Kafka ──▶ analytics service (swipe/match events)
                          └─────────▶ /metrics ──▶ Prometheus ──▶ Grafana (dashboards, alerts)

  All of it: Docker containers → run by Docker Compose (simple) or Kubernetes (advanced)
```

---

## Learning order

| # | Tool | Why then | Status |
|---|---|---|---|
| 1 | **Docker** | Needed for the new laptop and for deploying | ⬜ |
| 2 | **Redis** | Directly fixes rate-limiting and caching gaps | ⬜ |
| 3 | **Prometheus + Grafana** | Monitoring once it's live | ⬜ |
| 4 | **Elasticsearch** | When building developer search | ⬜ |
| 5 | **Kafka** | Learning exercise: swipe/match events → analytics | ⬜ |
| 6 | **Kubernetes** | Last, once Docker is solid | ⬜ |
| – | **ZooKeeper** | Skip | — |

---

## Warning — don't add tools just for the resume

Adding all seven to a small app can backfire. Interviewers often ask "why did you need Kafka
here?" — "to learn it" is fine **only if** you can also explain when you *wouldn't* use it.

- **Solve real problems in DevTinder today:** Docker, Redis, Prometheus + Grafana.
- **Learning extras — present them honestly as that:** Elasticsearch, Kafka, Kubernetes.

# DevTinder Roadmap — From Course Project to Portfolio-Grade Full-Stack App

Written 2026-10-07. Goal: use DevTinder (Namaste Node.js, Akshay Saini) as an end-to-end MERN
learning project that is strong on a resume and prepares for interviews with real examples and
real edge cases.

Related: `notes/security-audit-2026-10-07.md` (Phase 0 details).

---

## 1. Where the course leaves you

The community notes for the course (`akshadjaiswal/Namaste-Nodejs`) cover Season 2 up to
"DevTinder UI - Part 5" (already done), then Season 3:

1. Launching an AWS instance and deploying the frontend
2. nginx and deploying the backend Node app
3. Adding a custom domain name

Those notes list only these three Season 3 chapters. The real course may have more after them
(emails, payments, chat) — check the actual syllabus. If it does, those map onto Phase 3 below.

### What finishing Season 3 adds
- **A live link.** "Visit devtinder.yourdomain.com" beats a GitHub repo on a resume.
- **Skills most frontend-only / backend-only devs lack:** Linux, SSH, process managers (likely PM2),
  nginx reverse proxy, DNS, production vs localhost. Answers "How did you deploy it?"
- **Real production bugs to fix:** hardcoded `localhost:7777` breaks, CORS must allow the real
  domain, cookies behave differently across domains and over HTTPS, env vars must exist on the
  server.

### What Season 3 won't cover
- Security hardening — the course code has the same holes the audit found.
- Tests and CI/CD — deployment there is manual.
- Docker, Redis, background jobs, scaling.
- Product features: instant match, chat, photo upload, block/report (unless later episodes add them).

Season 3 makes the project **live**, not **production-grade**. Both matter.

### Order to follow
1. Fix the two critical security holes first (Phase 0) — once it's on a public URL, anyone can
   find the account-takeover bug.
2. Do Season 3 (add the axios instance + env API URL from Phase 1 as part of it).
3. Then the features in Phase 3, shipped to the live app, with tests.

---

## 2. Where the code would break at scale

| Today | Breaks when | Real-world fix |
|---|---|---|
| `http://localhost:7777` hardcoded in every component | You deploy | One axios instance with `baseURL` from `.env` |
| Feed collects **all** your requests into a hidden-IDs list, then `$nin` | Heavy users have thousands of swipes | Indexes, caching candidates, `explain()` to measure |
| Images (planned) saved on server disk | You run 2+ servers | Cloudinary or S3 |
| Rate limits (once added) kept in server memory | 2+ servers each count separately | Redis-backed limiter |
| OTP printed / email sent inside the request | Email is slow or down | Background job queue (BullMQ + Redis) |
| JWT can't be revoked | Stolen token, password reset | Short access token + refresh token, or a Redis denylist |
| Nominatim allows 1 request/sec for the whole server | More than a few users | Cache results, or a paid geocoder |

Each row is a ready-made "what breaks at scale and how would you fix it" interview answer.

---

## 3. The roadmap, in phases

### Phase 0 — Fix security (1–2 days, do first)
Follow the fix order in `notes/security-audit-2026-10-07.md`. Critical: delete the old
`GET /user` and `GET /feed` in `src/index.js`; block non-string `email` (or
`mongoose.set('sanitizeFilter', true)`). Then cookie flags, rate limiting, OTP hardening.
Interview story: "I found an account-takeover chain in my own app — here's how, here's the fix."

### Phase 1 — Clean up the engineering (~1 week)
- **Folder structure:** routes → controllers → services, instead of all logic in route files.
- **One error handler:** central error middleware + a custom `AppError` class, so routes stop
  writing their own `try/catch` with inconsistent status codes (400 and 404 are mixed today for
  the same kind of error).
- **One response shape everywhere:** `{ data, message }` was fixed route by route — make it a
  rule enforced in one place.
- **Validation at the edges with `zod`:** removes the whole category of NoSQL-injection and
  string-vs-number bugs.
- **Frontend:** shared axios instance, env-based API URL, reusable `<ProtectedRoute>`.
- **Logging** with `pino` instead of `console.log`. Delete dead code (old `index.js` routes).

Learn: how real codebases are organised. Interview: "How do you structure an Express app?"

### Phase 2 — Tests and CI (~1 week, big resume value)
- **Backend:** Jest + Supertest against an in-memory MongoDB (`mongodb-memory-server`). Test the
  edge cases actually hit: duplicate request, request to yourself, expired OTP, wrong OTP,
  preferences with `minAge > maxAge`, the NoSQL-injection payload.
- **Frontend:** Vitest + React Testing Library — e.g. the debounce and stale-reply guard with
  fake timers.
- **End to end:** Playwright running signup → login → swipe → match.
- **GitHub Actions:** lint and tests on every push.

Interview: "How do you test?" — most freshers can't answer this well.

### Phase 3 — Features real dating apps have (the heart of the project)

| Feature | Edge cases that make it interview-grade |
|---|---|
| **Instant match** when both swipe "interested" | Both swipe at the same moment → two requests race. Use a unique compound index and handle the duplicate-key error |
| **Real-time chat** (Socket.io) | Only matched users can message; blocked users can't; history loaded in pages; online status; reconnecting; duplicate sends on retry |
| **Photo upload** (multer → Cloudinary) + drag-and-drop | Wrong file type, a fake `.jpg`, huge files, compress before upload, multiple photos, delete the old file when replaced |
| **Email** (Nodemailer): OTP + verify email at signup | Expired links, resend cooldown, unverified users |
| **Block / report / unmatch** | A blocked user vanishes from feed, chat and mutuals; a reported user is hidden from the reporter instantly |
| **Daily swipe limit** + reset job (`node-cron`) | Time zones, what counts as "today" |
| **Premium** (Razorpay/Stripe test mode): "see who liked you", unlimited swipes | Webhooks, verifying the payment signature, idempotency so one payment never grants premium twice |
| **Drift detection** (parked) | Distance threshold, GPS jitter, not nagging repeatedly |

Do **two or three properly** (with tests and edge cases) rather than all of them half-done.
Suggested order: **instant match → chat → photo upload** — they build on each other and cover
race conditions, real-time, and file handling.

### Phase 4 — Ship it (course Season 3 + more)
- **Docker** + `docker-compose` (api, web, mongo, redis) — runs anywhere with one command.
- **Deploy:** AWS EC2 + nginx + own domain (course covers this), HTTPS via Let's Encrypt,
  MongoDB Atlas.
- Health-check endpoint and uptime monitoring.

A **live link** on the resume beats any number of GitHub links.

### Phase 5 — Scale (what turns "project" into "system")
- **Redis:** feed caching, rate-limit store, Socket.io adapter across servers, token revocation.
- **BullMQ:** send emails in the background.
- **Access + refresh tokens** with rotation.
- **Load testing** with `k6` or `autocannon`: measure the feed before and after indexing/caching
  and **write the numbers down** — real numbers make resume bullets believable.
- **Frontend:** React Query for fetching/caching/retries (replacing manual fetch-then-dispatch
  for server data), code splitting, lazy-loaded images.

### Phase 6 — Optional extras
TypeScript migration, an admin dashboard to review reports, basic analytics.

---

## 4. How it would read on a resume

- Built a MERN dating app with real-time chat (Socket.io + Redis adapter), geospatial feed
  matching (`$near` + `2dsphere`), and batched mutual-connection counts that replaced N+1 queries.
- Found and fixed an account-takeover chain and NoSQL injection in my own app; added rate
  limiting, OTP hardening, httpOnly cookies, and `zod` validation (OWASP Top 10).
- Cut feed latency from X ms to Y ms with indexes and Redis caching, measured with k6 load tests.
- 80% backend test coverage (Jest/Supertest), Playwright E2E tests, CI on GitHub Actions, deployed
  with Docker on AWS behind nginx + HTTPS.

Every bullet is something an interviewer can dig into — and something actually built.

---

## 5. Progress tracker

| Phase | Status |
|---|---|
| Course S2 (Ep 1–19) | ✅ Done |
| Custom features (preferences, location, mutuals, delete, forgot password, about me) | ✅ Done |
| Phase 0 — Security | ⬜ Not started (audit written 2026-10-07) |
| Course S3 — Deploy | ⬜ Not started |
| Phase 1 — Engineering cleanup | ⬜ |
| Phase 2 — Tests + CI | ⬜ |
| Phase 3 — Features | ⬜ |
| Phase 4 — Docker / HTTPS / monitoring | ⬜ |
| Phase 5 — Scale | ⬜ |
| Phase 6 — Extras | ⬜ |

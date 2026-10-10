# DevTinder Learning Notes

Personal study notes from building DevTinder (Namaste Node.js course, Season 2), covering the
concepts that were genuinely confusing the first time through, explained with the same examples
used when working through them live.

- [javascript-gotchas.md](./javascript-gotchas.md) — plain JS traps: operator precedence, `undefined` comparisons, `.every()` vs `.forEach()`, bracket notation, `typeof`, string-vs-number comparison.
- [mongoose-schema-patterns.md](./mongoose-schema-patterns.md) — schema field shapes, `enum`, custom `validate()`, `.methods`, `.pre('save')`, why field order relative to `mongoose.model()` matters.
- [mongodb-query-operators.md](./mongodb-query-operators.md) — `$or`/`$and`/`$in`/`$nin`/`$ne`/`$gte`/`$lte`, `.populate()` + `ref`, GeoJSON `Point` + `2dsphere` + `$near`.
- [express-http-patterns.md](./express-http-patterns.md) — `express.Router()`, middleware `next()`, `req.user` vs `res.user`, PATCH vs PUT vs POST, URL params vs query params vs body, and calling a third-party API from the backend as a proxy (`fetch` vs `axios`, the `User-Agent` header restriction that forces this server-side).
- [architecture-decisions.md](./architecture-decisions.md) — the actual design choices made and *why* (router splitting, persistent vs per-request preferences, dedicated routes vs shared validators, duplicate-request prevention logic).
- [mutual-connections-batching.md](./mutual-connections-batching.md) — full walkthrough of the batched mutual-connections-count algorithm: one query for all candidates, `Map`+`Set` grouping in memory, fully traced with example data instead of the naive N+1-queries version.
- [security-audit-2026-10-07.md](./security-audit-2026-10-07.md) — "is it hacker proof?" Proven account-takeover chain via the old `GET /user` route, NoSQL injection on `/login`, missing rate limits, weak OTP, cookie flags, enumeration — each with the real request that proved it, the fix, and the OWASP category.
- [nosql-injection.md](./nosql-injection.md) — how `{"$regex":"^you"}` logged in without the email, the `typeof` fix, and why the "one-line" `sanitizeFilter` fix was rejected: tested, it broke the app's own feed/mutuals/connections queries (`$near` silently returned 0).
- **Location feature (frontend + backend together):** see the frontend repo's `notes/location-feature-end-to-end.md` — covers `/location/search`, `/location/reverse`, `/user/location`, the `locationLabel`/`locationAutoSync` schema fields, the `Allowed_Edits` whitelist, and real Nominatim outputs, alongside the frontend code that calls them.
- [session-2026-09-05-mutual-connections.md](./session-2026-09-05-mutual-connections.md) — chronological log of every bug hit while building the mutual-connections feature: the broken code, why it was wrong, the fix, and a dry run for each — including the `.lean()` silent-serialization trap.

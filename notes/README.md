# DevTinder Learning Notes

Personal study notes from building DevTinder (Namaste Node.js course, Season 2), covering the
concepts that were genuinely confusing the first time through, explained with the same examples
used when working through them live.

- [javascript-gotchas.md](./javascript-gotchas.md) — plain JS traps: operator precedence, `undefined` comparisons, `.every()` vs `.forEach()`, bracket notation, `typeof`, string-vs-number comparison.
- [mongoose-schema-patterns.md](./mongoose-schema-patterns.md) — schema field shapes, `enum`, custom `validate()`, `.methods`, `.pre('save')`, why field order relative to `mongoose.model()` matters.
- [mongodb-query-operators.md](./mongodb-query-operators.md) — `$or`/`$and`/`$in`/`$nin`/`$ne`/`$gte`/`$lte`, `.populate()` + `ref`, GeoJSON `Point` + `2dsphere` + `$near`.
- [express-http-patterns.md](./express-http-patterns.md) — `express.Router()`, middleware `next()`, `req.user` vs `res.user`, PATCH vs PUT vs POST, URL params vs query params vs body.
- [architecture-decisions.md](./architecture-decisions.md) — the actual design choices made and *why* (router splitting, persistent vs per-request preferences, dedicated routes vs shared validators, duplicate-request prevention logic).

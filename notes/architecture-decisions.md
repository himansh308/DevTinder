# Architecture Decisions — the "why," not just the "what"

## Router splitting (Episode 11)

Moved from one giant `index.js` with every route inline, to separate files
(`authRouter.js`, `profile.js`, `request.js`, `userRouter.js`), each using `express.Router()`
and mounted in `index.js` via `app.use('/', someRouter)`. Grouped by *domain* — auth actions,
profile actions, connection-request actions, user-level aggregate views (feed/connections) —
not by HTTP verb or by file size.

## `:toUserId` vs `:requestId` — identifying a PERSON vs identifying a RECORD

- `/request/send/:status/:toUserId` — no `ConnectionRequest` document exists yet at this point,
  so the only thing to identify is *who* you're targeting → a person's ID.
- `/request/review/:status/:requestId` — a document already exists (created by `/send`); you're
  now acting on *that specific record*, which has its own independent `_id`, separate from
  either person's user ID → the record's ID, not a person's.

## Preventing duplicate/self connection requests — two different mechanisms, two different layers

- **Self-request prevention** lives in the **schema**, via `.pre('save', ...)` on
  `ConnectionRequest` — because it's a data-integrity rule that should hold true no matter
  *which* route or code path ever tries to save one of these documents, now or in the future.
- **Duplicate-direction prevention** lives in the **route** (`/request/send`), as an explicit
  `$or` query checked *before* creating anything — because it requires looking at OTHER existing
  documents first, which a single-document schema hook can't do on its own.

## Why the course's own feed-filtering solves the "mutual swipe" edge case — without smart merging

`/user/feed` excludes anyone with *any* existing `ConnectionRequest` (either direction, any
status) from ever appearing in your feed again. This means if B already sent A a request, B is
permanently hidden from A's feed — so A can never accidentally "duplicate-swipe" on B through
the UI. The duplicate-check in `/request/send` is really a defense-in-depth backstop for a
scenario the feed already prevents from happening through normal use — not the primary
mechanism. (Real dating apps *do* auto-match on a mutual swipe, which this simplified version
does not — deliberately deferred as a future enhancement, not a bug.)

## Preferences: persistent vs per-request — and why gender/age went one way

Decision: `genderPreference`/`minAge`/`maxAge` (and later `maxDistance`) are **saved on the
`User` document**, applied automatically every time `/user/feed` runs — not passed as query
params on every single feed request (unlike `page`/`limit`, which genuinely change per-request).
Reasoning: these represent a standing preference ("who do I generally want to see"), matching
how real apps have a persistent "Discovery Settings" screen, not something you'd re-specify
every time you open the app.

## `/profile/edit` vs `/profile/preferences` — why NOT one shared endpoint

Both are "update fields on my own User document," but deliberately kept as two separate routes
with two separate allowed-fields lists and two separate validators:
- `/profile/edit` — "who I am" (name, skills, photo).
- `/profile/preferences` — "who I want to see" (gender/age/distance preferences).

Reasoning: these are semantically different concerns, and bundling them means one validator
function keeps absorbing more and more unrelated rules over time (age-range logic, gender-list
checks, eventually distance logic) as more preference types get added. Splitting keeps each
validator focused on one job. Real apps mirror this too — "Edit Profile" and "Discovery
Settings" are almost always separate screens, not one form.

## `location` as its OWN route, not folded into `/profile/preferences`

Even though `location` conceptually feels preference-adjacent, it went to its own dedicated
route (e.g. `/profile/location`) instead. Reasoning: it's a *third*, distinct category —
"where am I" is neither "who I am" (`/profile/edit`) nor "who do I want to see"
(`/profile/preferences`) — and it will likely update far more frequently than either (every
app-open, in a real mobile app with live GPS), so it gets a minimal, purpose-built endpoint
rather than growing the shared preferences validator with unrelated high-frequency logic.
`maxDistance`, however, genuinely IS a feed-filter preference (same category as age/gender), so
it stayed with `/profile/preferences`.

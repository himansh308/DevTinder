# NoSQL Injection — How It Works, and the Two Fixes (One of Which Breaks the App)

Found 2026-10-07 in the security audit (#2), worked through 2026-10-10. Everything below was
**tested against the real running app and local database** — not guessed.

Status: fix (Option B) decided, **not applied yet** — goes in `/login`, `/forgotPassword`,
`/resetPassword` in `src/routes/authRouter.js`.

---

## 1. The attack, traced

### A normal login request
```json
{ "email": "you@test.com", "password": "Test1234@#$" }
```
`express.json()` turns this into a JS object, so in `/login`:
```js
const { email, password } = req.body;
// email = "you@test.com"   ← a string
await User.findOne({ email });
// MongoDB receives: { email: "you@test.com" }
//                   → "find the user whose email IS this text"
```

### The attack request
```json
{ "email": { "$regex": "^you" }, "password": "Test1234@#$" }
```
JSON can carry **objects**, not just text, and `express.json()` parses this too:
```js
// email = { $regex: "^you" }   ← an OBJECT, not a string
await User.findOne({ email });
// MongoDB receives: { email: { $regex: "^you" } }
//                   → "find the first user whose email STARTS WITH 'you'"
```
MongoDB sees `$regex` and reads it as an **operator** (a command), not as data. The code meant
"match this exact text"; the attacker turned it into "match a pattern". That's why it's called
**injection**: data gets treated as query syntax — the same idea as SQL injection.

**Real result:** `findOne` returned `you@test.com`, the password matched, and the server
**logged the attacker in**. They never typed the real email. With `{"$regex":"^a"}`, `"^b"`, …
they can walk through every account and run password guessing against each.

Same hole exists in `/forgotPassword` and `/resetPassword` (both do `User.findOne({ email })`
straight from `req.body`).

---

## 2. Option B — the `typeof` check ✅ (the fix to use)

```js
const { email, password } = req.body;

if (typeof email !== "string") {
    throw new Error("Invalid Credentials");
}
```
`typeof` tells you what kind of value something is:

| Request sends | `email` holds | `typeof email` | `!== "string"`? | Result |
|---|---|---|---|---|
| `"you@test.com"` | `"you@test.com"` | `"string"` | false | continues to `findOne` ✅ |
| `{"$regex": "^you"}` | `{ $regex: "^you" }` | `"object"` | **true** | throws → `catch` → 404 "Invalid Credentials" ❌ |
| `["you@test.com"]` | an array | `"object"` | **true** | rejected ❌ |
| `12345` | `12345` | `"number"` | **true** | rejected ❌ |
| nothing sent | `undefined` | `"undefined"` | **true** | rejected ❌ |

The attack never reaches the database — it's stopped at the edge of the code, before anything
is queried. **Principle: check the type of untrusted input as soon as it arrives.**

Where it goes: `/login`, `/forgotPassword`, `/resetPassword` — the three routes that query by
`email` from the body. `/resetPassword` also compares `OTP`, but that's a JS `===` against a
stored string, not a database query, so an object there just fails the comparison.

---

## 3. Option A — `mongoose.set('sanitizeFilter', true)` ❌ (not for this app as it stands)

> Originally recommended as "one line that protects every query in the app". **That was wrong
> for this codebase** — testing showed it breaks half the app. Kept here because *why* it
> breaks is the more valuable lesson.

### What it does
Whenever a filter contains a nested object with `$` keys, Mongoose wraps it in `$eq`
("equals exactly"):
```js
{ email: { $regex: "^you" } }
  → { email: { $eq: { $regex: "^you" } } }
  → "email must literally EQUAL the object {$regex:'^you'}"
  → email is a String field, so Mongoose throws CastError — the query never runs
```
So it **does** stop the attack. Real result:
`CastError: Cast to string failed for value "{ '$regex': '^you' }" (type Object) at path "email"`.

### Why it breaks the app
At the moment a query runs, Mongoose **can't tell the attacker's `$in` from your own `$in`** —
both are just objects with `$` keys — so it blocks both. Real results, running the app's actual
query shapes against the local DB with the setting off vs on:

| Your code | Off (today) | On |
|---|---|---|
| Feed: `_id` `$nin` / `$ne` | 11 users | ❌ CastError |
| Feed: gender `$in` + age `$gte`/`$lte` | 6 users | ❌ CastError |
| Feed: location `$near` | 1 user | ⚠️ **0, silently wrong** |
| Mutual connections: `_id` `$in` | 1 | ❌ CastError |
| Connections: `$or` + `$in` | 2 | ❌ CastError |
| Normal login `{ email: "you@test.com" }` | works | works |

One line would have broken the feed, mutual connections and connections — and the `$near` case
wouldn't even error; it would quietly return nobody.

### The way to use it anyway
Mark every operator *you* write as trusted:
```js
User.find({ _id: mongoose.trusted({ $nin: hiddenIds }) })
```
Tested: works. But every `$in`, `$nin`, `$ne`, `$gte`, `$lte`, `$near` in the codebase would need
wrapping, and each one forgotten becomes a broken feature. Big, error-prone change — skipped
for now.

---

## 4. Corrected plan

1. **Now:** Option B, the `typeof` check, in `/login`, `/forgotPassword`, `/resetPassword`.
   Small and complete for the holes found.
2. **Roadmap Phase 1:** `zod` validation at every route's entry point does Option B properly for
   *all* inputs, not just `email`. That's how real apps handle it.
3. **`sanitizeFilter`:** only if willing to wrap all your own operators with `mongoose.trusted()`.
   Skip for now.

---

## 5. Lessons

- **Everything in `req.body` / `req.query` is attacker-controlled — including its *type*.**
  Expecting a string doesn't mean you'll get one.
- **Validate at the boundary**, before data reaches anything that interprets it (a database, a
  shell, HTML).
- **Test a "global fix" against your own code, not just against the attack.** A switch that
  blocks the attack can also block legitimate behaviour — and sometimes silently (the `$near`
  case returned 0 with no error).

Interview line: "I found a NoSQL injection in my login — `{"$regex": "^you"}` logged me in
without the email. The obvious one-line fix, Mongoose `sanitizeFilter`, would have broken my
feed because it can't distinguish my operators from an attacker's, so I validated input types at
the route boundary instead, and planned `zod` for the full fix."

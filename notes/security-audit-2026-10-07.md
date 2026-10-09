# Security Audit — 2026-10-07

Question asked: "Is the project hacker proof?" Short answer: no project is. This audit lists what
an attacker could actually do, ranked by damage. The two critical issues were **proven** by
sending real requests to the running local server — not guessed from reading code.

Status: **all findings OPEN** as of this note (nothing fixed yet).

---

## 🔴 Critical — proven

### 1. Account takeover via the old `GET /user` route (`src/index.js`)

```js
app.get('/user', userAuth, async (req, res) => {
    const user = await User.find({ email: req.body.email });
    res.send(user);
});
```
Leftover from an early course episode. Any logged-in user can fetch **any other user's full
document** by email. `toJSON` strips `password`, but **not** `resetOtp` / `resetOtpExpiry`.

Attack chain (steps 1–3 were run for real; step 4 was deliberately not run):
```
1. Sign up any account, log in
2. POST /forgotPassword  { "email": "alice@test.com" }  → server generates Alice's OTP
3. GET  /user            { "email": "alice@test.com" }  → response contains resetOtp: "787490"
4. POST /resetPassword   { email, OTP: "787490", newPassword, confirmPassword } → attacker owns Alice
```
Real response from step 3:
```js
{ email: 'alice@test.com', resetOtp: '787490', resetOtpExpiry: '2026-10-07T10:41:12.674Z',
  location: { coordinates: [77.6, 12.98], type: 'Point' } }
```
It also leaks **exact GPS coordinates** — on a dating app that's a physical-safety (stalking) risk.

**Fix:** delete the route. Verified the frontend never calls bare `/user`.

Lesson: never return a raw user document to *another* user. Use a projection (`USER_SAFE_DATE`)
or a dedicated "public profile" shape. And `toJSON` only hiding `password` isn't enough — every
secret field (`resetOtp`, `resetOtpExpiry`) needs hiding too.

### 2. NoSQL injection in `/login` (and `/forgotPassword`, `/resetPassword`)

```js
const { email, password } = req.body;
const isUserExist = await User.findOne({ email });
```
`express.json()` happily parses objects, so `email` doesn't have to be a string:
```json
{ "email": { "$regex": "^you" }, "password": "Test1234@#$" }
```
MongoDB treats `$regex` as an operator → "first user whose email starts with `you`".
Result when tested: **200, logged in, without knowing the exact email.** With `{"$regex":"^a"}`
etc. an attacker can enumerate accounts and run password guessing against them.

**Fix (pick one, or both):**
- Reject non-strings: `if (typeof email !== "string") throw new Error("Invalid Credentials")`
- Mongoose global: `mongoose.set('sanitizeFilter', true)` — strips `$`-operators from query filters
  built from user input.

Lesson: anything from `req.body` / `req.query` is attacker-controlled *including its type*.
Same family as SQL injection — data being interpreted as query syntax.

---

## 🟠 High

### 3. No rate limiting anywhere
- `/login`: unlimited password guesses.
- `/resetPassword`: 6-digit OTP = 900,000 possibilities, **unlimited guesses**, 5-minute window →
  brute-forceable by a script.
- `/forgotPassword`: spam OTP generation for any email.
**Fix:** `express-rate-limit` on auth routes; count wrong OTP attempts per user and wipe the OTP
after ~5 failures.

### 4. OTP is predictable and stored in plaintext
`Math.random()` is not cryptographically secure. **Fix:** `crypto.randomInt(100000, 1000000)`.
The OTP sits unhashed in MongoDB (unlike passwords). **Fix:** store a hash, compare with
`bcrypt.compare` (or SHA-256, since it's short-lived).

### 5. Auth cookie has no protection flags
```js
res.cookie("token", token);
```
No `httpOnly` → any JavaScript on the site can read `document.cookie`, so one XSS bug anywhere =
stolen sessions. **Fix:** `res.cookie("token", token, { httpOnly: true, sameSite: "lax", secure: <true in production> })`.

---

## 🟡 Medium

6. **User enumeration.** `/login` returns `"Invalid Credentials"` for an unknown email but
   `"Please enter a valid password"` for a known one; `/forgotPassword` says `"Invalid email"`.
   Both reveal whether an email is registered. **Fix:** one generic message for both cases;
   `/forgotPassword` should always reply "If this email exists, an OTP was sent."
7. **Weak passwords accepted on reset.** The schema's `isStrongPassword` runs on the *bcrypt hash*,
   which always looks strong. **Fix:** check `validator.isStrongPassword(newPassword)` before hashing
   (signup already validates the plain password in `isSignupValidated`).
8. **Sessions survive logout / password reset.** JWT is valid for 1 day regardless. A stolen token
   keeps working even after the victim resets their password. **Fix:** store a `tokenVersion` /
   `passwordChangedAt` on the user and reject tokens issued before it.
9. **Account deletion leaves connection requests behind** — orphaned data referencing a deleted user.
   **Fix:** `connectionRequestModel.deleteMany({ $or: [{fromUserId: id}, {toUserId: id}] })` on delete.

## ⚪ Low

10. Error messages leak internals (`jwt` errors like "invalid signature", raw Mongoose validation).
11. **Unauthenticated `GET /feed` in `index.js`** returns every user. Currently harmless only because
    `userRouter`'s authed `/feed` is registered first (tested: 401). Reorder the `app.use` lines and
    it starts leaking everyone. **Delete it together with `/user`.**
12. No security headers (`helmet`), no HTTPS (fine locally, required in production).
13. A logged-in user can spam `/location/search` → Nominatim bans the server's IP.
14. Test credentials hardcoded in the public frontend repo (`Login.jsx`) — test account only.

---

## ✅ Already done well
- bcrypt password hashing; random JWT secret in `.env` (gitignored).
- `toJSON` override keeps password hashes off the wire.
- `Allowed_Edits` whitelists on every edit route → no mass-assignment of `email`/`gender`/etc.
- `/profile/edit` no longer accepts `password` (fixed 2026-10-06 — it was saving plaintext).
- CORS locked to the frontend origin; `userAuth` on every private route.
- React escapes text → a bio containing `<script>` renders as text. `photoUrl` must be http(s).
- Connection requests: status whitelist, duplicate check, self-request guard.

## Fix order
1. Delete old `GET /user` and `GET /feed` from `index.js` (closes the takeover).
2. Block non-string `email` / enable `sanitizeFilter`.
3. `httpOnly` + `sameSite` on the cookie.
4. Rate limiting + OTP attempt cap + `crypto.randomInt` (+ hash the OTP).
5. The medium items.

## Interview angle
These map directly to the OWASP Top 10: broken access control (#1), injection (#2),
identification & authentication failures (#3, #4, #6, #7, #8), security misconfiguration (#5,
#12). Being able to say "I found an account-takeover chain in my own app, here's how, here's the
fix" is a much stronger interview answer than listing OWASP from memory.

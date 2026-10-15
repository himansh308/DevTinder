# OTP Hardening — Line-by-Line Walkthrough

Built 2026-10-13 (merged to `main` in `f577b72`…`0a034c3`). Security audit item #4, plus part of #3.

One story throughout: on the Forgot Password page, `dev5@test.com` asks for an OTP, then enters it.

---

## The three problems being fixed

| Old code | Problem |
|---|---|
| `Math.random()` made the OTP | Not designed for security; can be predicted |
| `resetOtp: "482913"` saved as plain text | Anyone who could read the database could use the code |
| No limit on guesses | 900,000 possible codes; a script can try them all in 5 minutes |

The changes, file by file:
- **`src/utils/otp.js`** (new): generating, hashing and comparing OTPs.
- **`src/models/users.js`**: one new field, plus hiding the OTP fields from responses.
- **`src/routes/authRouter.js`**: both routes now use the helper, and `/resetPassword` counts attempts.

---

## Part 1 — `src/utils/otp.js`

```js
1  const crypto = require('crypto');
```
`crypto` is **built into Node**, so nothing to install. It has the secure-random and hashing tools.

```js
3  const OTP_EXPIRES_IN_MS = 5 * 60 * 1000;
4  const OTP_MAX_ATTEMPTS = 5;
```
Two settings, kept in one place so they're easy to change:
- `OTP_EXPIRES_IN_MS = 300000`: 5 min × 60 s × 1000 ms. (Renamed from `OTP_TTL_MS` — "TTL" = time to live.)
- `OTP_MAX_ATTEMPTS = 5`: guesses allowed per OTP.

```js
7  const generateOtp = () => String(crypto.randomInt(100000, 1000000));
```
- `crypto.randomInt(100000, 1000000)` gives a whole number from **100000 to 999999**. The upper number
  is *excluded*, so the result is always exactly 6 digits.
- Unlike `Math.random()`, it draws on the operating system's secure randomness, so it can't be predicted.
- `String(...)` turns `482913` into `"482913"`. The frontend sends the OTP as text, and `zod` requires 6
  digits *as a string*, so everything stays text.

**Example:** `generateOtp()` → `"482913"`.

```js
11 const hashOtp = (otp) => {
12     if (!process.env.OTP_SECRET) {
13         throw new Error("OTP_SECRET is not set in .env");
14     }
15     return crypto.createHmac('sha256', process.env.OTP_SECRET).update(String(otp)).digest('hex');
16 };
```
Lines 12–14: if the secret is missing from `.env`, stop with a clear message rather than hashing with
`undefined`. Same idea as the `MONGO_URI` check.

Line 15 is the core. Read it in parts:
- `createHmac('sha256', SECRET)`: start an **HMAC**, a hash calculation that includes a secret key.
- `.update("482913")`: feed in the OTP.
- `.digest('hex')`: finish, and give the result as a 64-character hex string.

**Example:** `hashOtp("482913")` → `"bfe3e67a8738d807b661a7556f62c599…"` (64 characters).

### Why HMAC and not a plain hash?
A plain hash, say SHA-256 of `"482913"`, gives the same result for anyone, anywhere. Suppose an attacker
gets your database and sees the stored hash:
```
for (code = 100000; code <= 999999; code++)
    if (sha256(code) === storedHash) → found it
```
900,000 hashes take well under a second, so a plain hash would protect nothing. With an HMAC, the result
also depends on `OTP_SECRET`. The attacker would have to guess the secret too: 64 random hex characters,
which is impossible. That's why the database alone isn't enough.

(Passwords use `bcrypt` instead. They don't need a secret, because a password has billions of
possibilities, and bcrypt is deliberately slow. A 6-digit code is too small for that to help.)

```js
19 const otpMatches = (otp, storedHash) => {
20     if (typeof storedHash !== 'string' || storedHash.length !== 64) return false;
```
A guard. A correct stored value is always a 64-character string. Anything else (`null`, or an **old
plain-text OTP** like `"482913"` left from before this change) can't be a valid HMAC, so return
"no match" immediately. That also stops line 23 from crashing, below.

```js
21     const given = Buffer.from(hashOtp(otp), 'hex');
22     const stored = Buffer.from(storedHash, 'hex');
```
- Line 21 hashes what the user typed, with the same secret.
- `Buffer.from(hex, 'hex')` turns the 64-character hex text into the **32 raw bytes** it represents.
  `timingSafeEqual` compares bytes, not text.

**Example:** user typed `"482913"` → `given` = the bytes of `bfe3e67a…`. `stored` = the bytes of
what's in the database.

```js
23     return given.length === stored.length && crypto.timingSafeEqual(given, stored);
24 };
```
- `timingSafeEqual` **throws** if the two lengths differ, so the length check runs first. Line 20 already
  makes this always true, but it's cheap insurance.
- **Why not `===`?** A normal comparison stops at the **first differing character**. A guess whose start
  matches takes a few nanoseconds longer to reject than one that's wrong from the start. With enough
  measurements, that difference can leak information. `timingSafeEqual` always compares every byte, so
  it takes the same time either way.

```js
26 module.exports = { OTP_EXPIRES_IN_MS, OTP_MAX_ATTEMPTS, generateOtp, hashOtp, otpMatches };
```
Exports everything so `authRouter.js` can import it.

---

## Part 2 — `src/models/users.js`

```js
resetOtpAttempts: {
    type: Number,
},
```
A new field counting wrong guesses for the current OTP. There's no `default`, so users who never request
an OTP don't get the field at all. MongoDB's `$inc` treats a missing field as `0`.

```js
userSchema.methods.toJSON = function(){
    const user = this.toObject();
    delete user.password;
    delete user.resetOtp;            // new
    delete user.resetOtpExpiry;      // new
    delete user.resetOtpAttempts;    // new
    return user;
}
```
`toJSON` runs every time a user document is turned into a response. It already removed `password`, and
now it also removes the three OTP fields. Even as a hash, none of it belongs in a response. That's the
lesson from the old `GET /user` hole: hide every secret field, not just the password.

---

## Part 3 — `/forgotPassword`, traced

**Frontend:** on the Forgot Password page you type `dev5@test.com` and click **Send OTP**.
`ForgotPassword.jsx` sends:
```
POST /forgotPassword   { "email": "dev5@test.com" }
```

```js
authRouter.post('/forgotPassword', validate({ body: forgotPasswordBody }), async (req, res) => {
```
`validate` runs first: `zod` checks it's a real email and lowercases it. A bad email gets a 400 here and
never reaches the code below.

```js
    const {email} = req.body;                       // "dev5@test.com"
    const isUserValid = await User.findOne({email}); // dev5's full document
    if(!isUserValid){ throw new Error("Invalid email"); }
```
Unchanged from before: look up the user, and reject unknown emails.

```js
            const otp = generateOtp();                       // "482913"
```
A secure 6-digit code. It lives **only in this variable**, in memory, for this one request.

```js
            isUserValid.resetOtp = hashOtp(otp);             // "bfe3e67a8738…" (64 chars)
```
Store the **HMAC**, not `"482913"`.

```js
            isUserValid.resetOtpExpiry = new Date(Date.now() + OTP_EXPIRES_IN_MS);
```
`Date.now()` = now in milliseconds, e.g. `1760340000000`. Plus `300000` = 5 minutes from now.

```js
            isUserValid.resetOtpAttempts = 0;
```
A new OTP gets a fresh count. If you'd been locked out of an earlier code, requesting a new one starts
you over at 0.

```js
            await isUserValid.save();
```
The database now holds:
```js
{ email: "dev5@test.com", ...,
  resetOtp: "bfe3e67a8738d807b661a7556f62c599…",   // hash only
  resetOtpExpiry: 2026-10-13T10:05:00Z,
  resetOtpAttempts: 0 }
```

```js
            console.log(`OTP for ${email}: ${otp}`);         // "OTP for dev5@test.com: 482913"
            res.send("OTP generated successfully");
```
The real code is printed to **your backend terminal**. That's the stand-in for email until Nodemailer.
Once this request ends, `"482913"` exists nowhere except that terminal line. Even you can't get it back
out of the database.

The frontend gets "OTP generated successfully" and switches to step 2.

---

## Part 4 — `/resetPassword`, traced

**Frontend:** you type the OTP from the terminal and a new password. `ForgotPassword.jsx` sends:
```
POST /resetPassword
{ "email": "dev5@test.com", "OTP": "482913", "newPassword": "Strong1234@#$", "confirmPassword": "Strong1234@#$" }
```

```js
authRouter.post('/resetPassword', validate({ body: resetPasswordBody }), async (req, res) => {
```
`zod` first: a valid email, `OTP` exactly 6 digits (as text), `newPassword` strong. A weak password stops
here with a 400.

```js
        const {email , OTP , newPassword , confirmPassword } = req.body;
```

### The atomic counter (the most important part)
```js
        const user = await User.findOneAndUpdate(
            { email, resetOtp: { $ne: null } },     // 1. FILTER
            { $inc: { resetOtpAttempts: 1 } },      // 2. UPDATE
            { returnDocument: 'after' }             // 3. OPTIONS
        );
```
This is **one** database operation with three parts:
1. **Filter:** find the user with this email **who has an active OTP**. `$ne: null` means "not null", so
   users with no OTP (never requested, or already wiped) don't match.
2. **Update:** add 1 to `resetOtpAttempts`.
3. **Options:** give back the document *after* adding 1, not before.

MongoDB does the find and the +1 **as one indivisible step** on that document. That's what "atomic" means.

**Example:** attempts was `0` → the database now has `1` → `user.resetOtpAttempts` is `1`.

**Why one step instead of "read the count, then save count+1"?** Two guesses arriving at the same
moment, under each approach:

*Read, then save (the obvious way):*
```
Guess A reads attempts = 4      Guess B reads attempts = 4     ← both see 4
Guess A: 4 < 5 → compare        Guess B: 4 < 5 → compare       ← both get to try
Guess A saves 5                 Guess B saves 5
```
Both got through, and attempts only went up by one. Send 50 at once and **all 50** get to try.

*Atomic `$inc` (what we do):*
```
Guess A: +1 → gets 5            Guess B: +1 → gets 6           ← MongoDB hands out unique numbers
Guess A: 5 → allowed to compare Guess B: 6 > 5 → rejected, never compares
```
MongoDB processes them one after the other, so each guess gets its **own** number. That's why the test
of 50 simultaneous guesses ended with the OTP wiped.

```js
        if(!user){
            throw new Error("OTP is Incorrect");
        }
```
`null` means one of two things: no user has that email, **or** the user has no active OTP. Both get the
same message. A separate "Invalid User" would tell an attacker which emails are registered.

```js
        const clearOtp = async () => {
            user.resetOtp = null;
            user.resetOtpExpiry = null;
            user.resetOtpAttempts = 0;
            await user.save();
        };
```
A small helper, defined here because it uses this request's `user`. It's called in four places below, so
it's written once. After it runs, the filter's `$ne: null` no longer matches, so **this OTP is dead**.

### The checks, in order
```js
        if(user.resetOtpAttempts > OTP_MAX_ATTEMPTS){       // 6 or more
            await clearOtp();
            throw new Error("Too many wrong attempts. Please request a new OTP");
        }
```
Only happens in a burst: a guess that got number 6, 7, … in the race above. It's rejected **before**
comparing, so it never gets a chance to be right.

```js
        if(user.resetOtpExpiry <= Date.now()){
            await clearOtp();
            throw new Error("Time Limit exceeded");
        }
```
More than 5 minutes since the OTP was created → wipe it and reject, even if the code is correct. This
check comes **before** the comparison, so an expired code tells nobody whether their guess was right.

```js
        if(!otpMatches(OTP, user.resetOtp)){
            if(user.resetOtpAttempts >= OTP_MAX_ATTEMPTS){  // this was guess number 5
                await clearOtp();
                throw new Error("Too many wrong attempts. Please request a new OTP");
            }
            throw new Error("OTP is Incorrect");            // guesses 1–4
        }
```
`otpMatches("482913", "bfe3e67a…")` HMACs what was typed and compares it with the stored hash.
- Wrong on guesses 1–4: "OTP is Incorrect", and the OTP stays alive.
- Wrong on guess 5: wipe it, "Too many wrong attempts".

```js
        if(newPassword !== confirmPassword){
            throw new Error("Password doesn't match");
        }
```
Checked only **after** the OTP is proven correct. The OTP isn't wiped here, so you can fix the typo and
try again. This attempt was still counted, though, so you'd have one fewer left.

```js
        user.password = await bcrypt.hash(newPassword,10);
        await clearOtp();
        res.send("Password Updated successfully");
```
Hash the new password with bcrypt, as at signup. Then `clearOtp()` saves **both** the new password and the
wiped OTP in one `save()`. The same code can never be used twice.

---

## Part 5 — How the attempt counter plays out

For one OTP, with the real code `482913`:

| Request | `$inc` gives | Check that decides | Response | OTP after |
|---|---|---|---|---|
| Wrong guess | 1 | doesn't match, 1 < 5 | OTP is Incorrect | alive |
| Wrong guess | 2 | doesn't match | OTP is Incorrect | alive |
| Wrong guess | 3 | doesn't match | OTP is Incorrect | alive |
| Wrong guess | 4 | doesn't match | OTP is Incorrect | alive |
| Wrong guess | 5 | doesn't match, 5 ≥ 5 | **Too many wrong attempts** | **wiped** |
| Correct `482913` | — (filter finds no active OTP) | `user` is `null` | OTP is Incorrect | — |

The good path: request the OTP → attempts 0 → type the right code on guess 1 → `$inc` gives 1 → matches →
passwords match → "Password Updated successfully" → OTP wiped.

---

## Part 6 — What the frontend shows

`ForgotPassword.jsx` **didn't change**. It already shows `err.response.data` in red:

| Situation | Message on screen |
|---|---|
| Wrong code | OTP is Incorrect |
| 5th wrong code | Too many wrong attempts. Please request a new OTP |
| After 5 minutes | Time Limit exceeded |
| Weak new password | Password must be at least 8 characters with… (from `zod`) |
| Passwords differ | Password doesn't match |
| Success | redirected to `/login` |

---

## Test results (2026-10-13, on `dev5@test.com`)

| Test | Result |
|---|---|
| What the DB stores after "Send OTP" | 64-character hash, not the 6 digits |
| Login response | no OTP fields, no password |
| 5 wrong guesses | 4 × "OTP is Incorrect", then "Too many…"; the right code is refused afterwards |
| 50 wrong guesses at the same moment | OTP wiped; the right code is refused afterwards |
| Expired code | "Time Limit exceeded" |
| Unknown email | "OTP is Incorrect" |
| Right code, passwords differ / match | "Password doesn't match" / updated, new password logs in |
| Same code used again | refused |

## Still open

After a lockout, someone can request a **new OTP** and get another 5 guesses, over and over. **Rate
limiting** on `/forgotPassword` (e.g. 3 requests per email per hour) and `/login` closes that.

## Interview line

"Password-reset OTPs were `Math.random()` codes stored in plain text with unlimited guesses. I switched to
`crypto.randomInt`, stored an HMAC keyed with a server secret — a plain hash of a 6-digit code is
reversible by brute force — compared with `timingSafeEqual`, and capped guesses at 5 using an atomic
`$inc` so concurrent requests can't race past the limit. I verified it by firing 50 simultaneous wrong
guesses."

# Express & HTTP Patterns

## `express.Router()` must be CALLED — a common typo

```js
const userRouter = express.Router;    // ❌ reference to the FUNCTION itself, not a usable router
const userRouter = express.Router();  // ✅ actually calls it, returns a router instance
```

Real symptom hit while building `userRouter.js`: it was written as `express.Router` (no
parentheses) with an *empty* file underneath — no crash yet, just a silently useless variable,
because nothing ever tried to call `.get()`/`.patch()` on it until routes got added. The bug
only became obvious once route registration was attempted on it and nothing worked.

## Mounting a router with `app.use(path, router)`

```js
app.use('/', authRouter);
app.use('/', profileRouter);
app.use('/', requestRouter);
app.use('/', userRouter);
```

Trace what actually happens when a request for `POST /signup` comes in, given this exact
mounting order from `index.js`:
1. Express checks `authRouter` first (mounted first): does `authRouter` have a route matching
   `POST /signup`? **Yes** — `authRouter.post('/signup', ...)` — so this handler runs, and
   Express never even looks at `profileRouter`/`requestRouter`/`userRouter` for this request.
2. If it had said `GET /feed` instead: `authRouter` has no match → check `profileRouter` → no
   match → check `requestRouter` → no match → check `userRouter` → **match** (`userRouter.get('/feed', ...)`)
   → runs.

`app.use(router)` with no path (or `'/'`) doesn't add any prefix — each router's own paths
(`'/signup'`, `'/feed'`, etc.) stay exactly as defined; mounting order only matters when two
routers happen to define the *same* path (none do here, but it's why order can matter in
general).

## `req.user` vs `res.user` — a middleware naming mismatch that breaks EVERYTHING downstream

```js
// userAuth middleware, as originally written:
res.user = user;   // ❌ sets it on the RESPONSE object
next();
```

Real symptom hit: calling `POST /profile` (before the fix) returned `"User : undefined"` every
single time, even with a perfectly valid login cookie — because every route read `req.user`
(e.g. `const user = req.user; res.send("User : " + user)`), but the middleware had only ever
set `res.user`. `req` and `res` are two *separate* objects; setting a property on one doesn't
make it show up on the other.

**Fix:** `req.user = user;` in the middleware, matching what every route already expected.
Convention reason: middleware attaches shared data to `req` specifically because `req` is the
one object that keeps flowing through every subsequent middleware/route handler in the chain —
`res` is for building the *outgoing* response, not for passing data *forward*.

## Middleware `next()` — Express needs an explicit "I'm done" signal

```js
const userAuth = async (req, res, next) => {
    const { token } = req.cookies;
    if (!token) throw new Error("Token is not valid");
    const decoded = await jwt.verify(token, "DevTinder@756@");
    const user = await User.findById(decoded._id);
    req.user = user;
    next();   // ← without this, the actual route handler NEVER runs — the request just hangs
}
```
Express has no way to automatically know when your middleware's async work (`jwt.verify`,
`User.findById`) has finished — you have to tell it explicitly by calling `next()`. Forget it,
and a request to any route using this middleware would just sit there with no response at all,
eventually timing out.

(Contrast: Mongoose's `.pre('save', ...)` hooks in mongoose 9.x DON'T need this anymore — see
`mongoose-schema-patterns.md`. Different libraries, different conventions for "how do I know
you're done.")

## PATCH vs PUT vs POST — traced through real routes in this project

- **PATCH** — partial update. `/profile/edit` with body `{"age": 30}` only changes `age`;
  `firstName`, `skills`, everything else on that same user document is left completely
  untouched. Confirmed by testing: after sending just `{"age":30}`, a follow-up `/profile/view`
  still showed the original `skills: ["TypeScript","JavaScript"]` — nothing else got wiped.
- **PUT** — full replacement (not actually used anywhere in this project, but the contrast
  matters): if `/profile/edit` had been built as `PUT` instead, sending `{"age":30}` alone would
  conceptually mean "this IS the complete new user now" — everything you didn't include is
  supposed to be treated as gone/reset. Wrong semantics for "just tweak one field."
- **POST** — create something new. `/signup` creates a brand-new `User` document;
  `/request/send/:status/:toUserId` creates a brand-new `ConnectionRequest` document. Neither
  modifies something that already exists — that's the tell for POST over PATCH/PUT.

## Three different places data can come from in one request — traced with a real call

Real request made during testing:
```bash
curl -X POST "http://localhost:7777/request/send/interested/6a8ad736a1d00de66c4efd5c?debug=1" \
  -b cookies.txt -H "Content-Type: application/json" -d '{"note":"hi"}'
```
matched against the route:
```js
requestRouter.post('/request/send/:status/:toUserId', userAuth, async (req, res) => { ... })
```

- `req.params.status` → `"interested"` — comes from the **URL path**, filled in by matching
  against the `:status` placeholder in the route pattern itself.
- `req.params.toUserId` → `"6a8ad736a1d00de66c4efd5c"` — same idea, from `:toUserId`.
- `req.query.debug` → `"1"` — comes from the **URL query string**, the `?debug=1` part after
  the path (this specific route never reads it, but it'd be available if it did).
- `req.body.note` → `"hi"` — comes from the **JSON body**, parsed by `express.json()`
  middleware from what `-d '{"note":"hi"}'` sent (again, unused by this route, but present).

Rule of thumb used throughout this project: **path params** identify *which specific thing*
you're acting on (a person's ID, a request's ID) when it's a required part of the URL's
meaning; **query params** are optional/tunable settings for a GET-style read (`page`/`limit` on
`/user/feed`); **body** carries actual data being submitted (signup fields, edit fields,
coordinates).

## Backend-as-proxy: calling a THIRD-PARTY API from your own server, with built-in `fetch`

Built for `GET /location/search?q=...` — lets the frontend search for a place by name (e.g.
"Nehru Place") and get back real coordinates, without the frontend ever talking to the outside
world directly.

**The shape of the whole conversation, three parties:**
```
Frontend  →  OUR backend (/location/search)  →  Nominatim (external geocoding service)
          ←                                   ←
```
The frontend only ever calls `localhost:7777` (same as every other route in this app) — it has
no idea Nominatim exists. Our backend is the one reaching out to a third party on the
frontend's behalf. This is the "backend proxy" pattern: useful whenever the frontend needs data
from an external API but shouldn't (or can't) call it directly — reasons include hiding
API keys/credentials server-side, setting headers browsers won't let JS override (see below),
or just keeping one consistent "frontend only talks to my backend" architecture.

**Why `fetch`, not `axios`, for this one call:** this project has no HTTP client library
installed (`axios` is a FRONTEND dependency only, used for calling OUR OWN backend from the
browser) — there was never a reason to add one server-side until now. Node has a built-in
global `fetch` (same API shape as the browser's `fetch`), so reaching an external API from the
backend needs zero new dependencies.

**`fetch` vs. `axios` — the two real differences that bite you:**
```js
const response = await fetch(url, { headers: {...} });   // step 1: get the response wrapper
const data = await response.json();                       // step 2: actually parse the body
```
1. `fetch`'s result isn't the data — it's a `Response` object (status code, headers, etc.).
   `axios`, by contrast, auto-unwraps the body into `.data` for you. With `fetch` you need a
   **second** `await` on `.json()` to actually get usable data out of it.
2. `fetch` does NOT throw/reject on HTTP error statuses (a 404, a 500) — only on genuine network
   failures (DNS failure, no connection). `axios` throws on bad status codes automatically. If a
   route needs to treat "Nominatim returned a 500" as an error, it would need an explicit
   `if (!response.ok) { ... }` check — not needed for this specific route since Nominatim
   returning an empty/weird array doesn't crash anything downstream, but worth knowing for next
   time.

**Why the `User-Agent` header is set HERE (server-side), not from the frontend directly:**
Nominatim's usage policy requires every request to identify the calling application (and a
contact method) via a `User-Agent` header. Browsers **block JavaScript from overriding
`User-Agent`** on `fetch`/`XMLHttpRequest` calls — it's one of a handful of "forbidden" headers
a browser won't let client-side code set, for security reasons. Server-side Node has no such
restriction, since there's no browser sandbox involved — this is one of the concrete reasons
"proxy through the backend" was chosen over "call Nominatim directly from the browser."

```js
"User-Agent": `DevTinder-learning-project (contact: ${process.env.NOMINATIM_CONTACT_EMAIL})`
```
Note this identifies the **app and its developer** — it's the same fixed string on every
request, regardless of which logged-in user is doing the searching. It is NOT meant to be
per-user/dynamic data; it answers "who built this app, and how can Nominatim's maintainers
reach them if something goes wrong" — a completely different question from "who is currently
using it." Stored in `.env` (`NOMINATIM_CONTACT_EMAIL`), same pattern as `JWT_SECRET`, instead
of hardcoded in source — config belongs in environment variables, not committed code.

**Why `encodeURIComponent` on the search text:**
```js
const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;
```
A raw search string like `"Nehru Place"` has a space in it, which isn't a valid character
inside a URL. `encodeURIComponent("Nehru Place")` → `"Nehru%20Place"`, safely escaping it (and
any other special characters — `&`, `?`, non-English characters, etc.) before it gets pasted
into the URL template literal. Skipping this would silently break or misinterpret the query for
anything other than a single plain word.

**Why `.map()` to trim the response down:**
Nominatim's raw response per result has many fields (bounding boxes, OSM type/IDs, importance
scores, etc.) — most irrelevant to this app. `.map()` walks the array and builds a brand-new one
containing only `display_name`/`lat`/`lon`, the three fields the frontend dropdown actually
needs. Same "project down to just what's needed" idea as `USER_SAFE_DATE` trimming a full
`User` document to a few safe fields elsewhere in this codebase — just applied to a third-party
API's response instead of our own database documents.

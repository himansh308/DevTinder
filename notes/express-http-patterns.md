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

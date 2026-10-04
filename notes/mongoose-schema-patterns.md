# Mongoose Schema Patterns

## `type` inside a field definition is a category, not a specific value

```js
gender: {
    type: String,     // "this holds TEXT" — a category, nothing about which text yet
    validate(value){
        if(!["male","female","others"].includes(value)) throw new Error(...)
    }
}
```

`"male"`, `"Point"`, `"TypeScript"` — these are all just strings, no different in *kind* from
each other. `type: String` says "this is text"; a separate rule (`validate`, or `enum`) narrows
down *which* text is actually allowed. Don't confuse "what data type" with "what specific value."

## `enum` — the built-in shortcut for "must be one of these values"

Instead of writing a custom `validate` function to check membership in a list, Mongoose has
`enum` built in:

```js
status: {
    type: String,
    enum: ["ignored", "interested", "accepted", "rejected"]
}
```

It also has a fuller object form, letting you customize the error message:

```js
genderPreference: {
    type: [String],                    // note: enum works on arrays too — checks EVERY element
    enum: {
        values: ["male", "female", "others"],
        message: "Gender is not valid"
    }
}
```

`enum` on an array type validates every element inside the array against the list — you don't
need a manual `.every()` loop for this specific case.

## Nested field shapes — when a field's value is itself an object with its own rules

GeoJSON `location` needs two sub-fields, each with its own type/rules:

```js
location: {
    type: {                      // this "type" is a GeoJSON field NAME, not Mongoose's keyword — coincidence
        type: String,
        enum: ["Point"],          // locked to exactly one value — there's only ever one shape for "a user's location"
        default: "Point"          // so callers don't have to type "Point" every single time they save a location
    },
    coordinates: {
        type: [Number]            // array where every element must be a number: [longitude, latitude]
    }
}
```

Why `enum: ["Point"]` with only one allowed value: it's not "restricting a choice," it's
*locking* the field so nothing else can accidentally sneak in (wrong casing, wrong shape name)
and silently break MongoDB's geospatial queries later, far from where the bad write happened.

### Gotcha hit in practice: `default` on a nested-path sub-field doesn't reliably fire when you replace the WHOLE parent object at once

Real error hit while testing `/user/location`:
```
Plan executor error during update :: caused by :: Can't extract geo keys: {...}
unknown GeoJSON type: { coordinates: [ 77.5946, 12.9716 ] }
```

The route did the generic copy-loop pattern:
```js
loggedInUser["location"] = req.body["location"];   // req.body.location = {coordinates: [...]}, no "type"
await loggedInUser.save();
```

Expectation: `location.type`'s `default: "Point"` fills in the missing `type` automatically,
same as it does for a brand-new document. **Reality:** it didn't. The document that actually
got sent to MongoDB was `location: { coordinates: [...] }` — `type` was never filled in at all.

Why: `location` here is a *nested path* built from plain object literals in the schema
definition, not a "real" Mongoose sub-schema (`new mongoose.Schema({...})`). Defaults on nested
sub-fields are reliable when Mongoose builds a document field-by-field from scratch, but they
don't consistently re-apply when you **wholesale-overwrite the entire parent object** with a
plain JS object that's missing some of its expected sub-fields — which is exactly what
`loggedInUser.location = req.body.location` does.

**Fix used (round 1):** stop relying on the schema default for this field entirely. In the
route, after the copy-loop runs (so `coordinates` is already set) but *before* `.save()`:
```js
loggedInUser.location.type = "Point";
```
This guarantees `type` is always present on the object actually being saved, independent of
whatever the client did or didn't send, and independent of whether Mongoose's nested-path
default decides to cooperate.

### Round 2: the SAME default, being unreliable in the OPPOSITE direction, broke `/signup` entirely

After round 1's fix, `/signup` (which never touches `location` at all) started crashing with:
```
MongoServerError: Can't extract geo keys: {..., location: { type: "Point" }, ...}
Point must be an array or object, instead got type missing
```

This is the flip side of the exact same root cause. `location.type` and `location.coordinates`
are each treated as **independent nested schema paths** — not one atomic unit — so Mongoose
applies each leaf path's OWN `default` separately, on every new document, regardless of whether
the parent (`location`) was ever conceptually touched by the calling code at all. So even a
brand-new signup, where the client sent nothing resembling `location`, ended up with a
half-formed `location: { type: "Point" }` — `type` present (fired from its own default),
`coordinates` completely absent (no default there, nothing set it). MongoDB's `2dsphere` index
then chokes trying to parse this as GeoJSON, since a valid `Point` needs BOTH pieces — hence
"Point must be an array or object, instead got type missing."

**The real fix:** remove `default: "Point"` from the schema entirely. It was never reliable in
either direction — didn't fire when genuinely needed (round 1, wholesale replace), and fired
when genuinely NOT wanted (round 2, completely untouched documents). The route already
explicitly sets `type` itself (round 1's fix), so the schema default was redundant on top of
being actively harmful. Once removed: brand-new signups leave `location` **fully, genuinely
absent** (not half-populated), which the (sparse-by-default) `2dsphere` index correctly skips
entirely — no phantom partial object to choke on.

**General lesson, sharpened from round 1's version:** for a *nested path* built from plain
object literals (not a real Mongoose sub-schema), don't put a `default` on ANY of its leaf
fields if that whole nested object is meant to be optional overall. A leaf-level `default` fires
independently of its siblings and independently of whether the parent was touched at all — it
can leave you with a document that's neither "fully set" nor "fully absent," which is exactly
the shape MongoDB's geospatial (and probably other) validators aren't expecting. If a nested
field needs a fixed constant value whenever it's actually used, set it explicitly in application
code at the one place that legitimately sets that field (as done here) — don't lean on the
schema `default` to paper over it.

**General lesson:** `default` is trustworthy for simple top-level fields (`age`, `photoUrl`,
etc.) set once on document creation. For nested paths that get **replaced wholesale** later
(not created fresh), don't assume the default will re-fire — either have the route
explicitly set the value, or require the caller to always send it.

## The generic `Object.keys(req.body).forEach(...)` copy-loop only sees TOP-LEVEL keys — nested objects move as one atomic unit

```js
Object.keys(req.body).forEach((key) => {
    loggedInUser[key] = req.body[key];
})
```

This loop iterates over the **top-level keys of `req.body` only**. It never looks *inside* a
nested object or array to iterate over what's in there too — whatever value sits behind a
top-level key (a number, a string, a whole nested object with several properties of its own)
gets copied across as **one atomic unit**, in a single iteration.

Dry run, for a `/profile/location`-style route, with body `{ "location": { "coordinates": [77.5946, 12.9716] } }`:

1. `Object.keys(req.body)` → `["location"]` — just **one** key. `coordinates` is never a
   top-level key at all; it's nested one level inside `location`.
2. Loop runs **once**: `key = "location"`.
3. `loggedInUser["location"] = req.body["location"]` → assigns the **entire** nested object
   `{ coordinates: [77.5946, 12.9716] }` in one shot.
4. At `.save()` time, the schema's `default: "Point"` fills in the missing `type`, and the
   custom bounds-check `validate` runs on `coordinates`.

**Same result even if the client also sends `type` explicitly** —
`{ "location": { "type": "Point", "coordinates": [...] } }` — because `type` and `coordinates`
are *still both* nested inside the one top-level `location` key. The loop still only runs
**once**, still assigns the whole nested object wholesale; it makes zero difference to the loop
whether that inner object has one property or five. The only thing that changes is whether
Mongoose's `default` needs to kick in at save-time, or whether the client already supplied
`type` itself (in which case it just gets checked against `enum: ["Point"]` instead of
defaulted).

This is the same underlying idea as the arrays-are-one-value point in `javascript-gotchas.md`
(`skills: [...]` being assigned wholesale in `/profile/edit`) — just one level deeper: a whole
*object*, not just an array, moves as one indivisible value through `=` assignment.

## `.methods` must be attached to the schema *before* `mongoose.model()` compiles it

```js
const User = mongoose.model("User", userSchema);   // ❌ compiled here — snapshot taken NOW

userSchema.methods.getJWT = async function(){ ... }        // added AFTER compile — never attached!
userSchema.methods.validatePassword = async function(){ ... }
```

`mongoose.model()` copies whatever is in `schema.methods` onto the model **at the moment it's
called** — it doesn't keep watching for later additions. Anything added to `.methods` afterward
never reaches actual documents (`isUserExist.validatePassword` throws "is not a function").

Fix: define every `.methods.*` (and `.pre()` hooks, same reasoning) **before** the
`mongoose.model(...)` line, not after.

## `.pre('save', ...)` — version-specific gotcha with `next()`

Older-style Mongoose tutorials teach:

```js
schema.pre("save", function(next){
    if (something) throw new Error("...");
    next();     // ❌ throws "next is not a function" on mongoose 9.x
})
```

The underlying hooks library (`kareem`) in mongoose `9.7.3` **dropped callback-style pre-hooks**.
It no longer automatically passes a `next` callback into the function at all — synchronous
hooks are expected to just run and return (or throw); async hooks return a Promise instead.

Fix: drop the `next` parameter and the `next()` call entirely:

```js
schema.pre("save", function(){
    if (something) throw new Error("...");
    // nothing else needed — returning normally means "done, continue"
})
```

Throwing still works exactly the same way to signal failure — Mongoose wraps the hook call in
its own try/catch internally.

## `res.json(document)` silently leaks every field, including hashed `password` — override `toJSON()` to fix it at the source

Real issue found 2026-10-04: `/login`, `/signup`, `/profile/view`, `/profile/edit`, and
`/profile/preferences` all fetch the user via `User.findById(...)`/`User.findOne(...)` with no
`.select()` narrowing the fields. That means the in-memory document has **every** field,
including the bcrypt-hashed `password`. Since nothing ever excluded it before sending the
response, the hash itself was going out over the wire on every one of those routes — not the
plaintext, but still something an attacker could try to crack offline, completely bypassing any
server-side rate limiting on login attempts.

**Why it happens:** `res.json(doc)` / `res.send(doc)` has to turn the Mongoose document into a
JSON string. Under the hood this calls `JSON.stringify(doc)`, which in turn calls
`doc.toJSON()` if the object defines one. Mongoose's *default* `toJSON()` just dumps every
field on the document — there's no built-in "hide this field" behavior unless you ask for it.

**Fix — override `toJSON()` on the schema itself, once:**
```js
userSchema.methods.toJSON = function(){
    const user = this.toObject();
    delete user.password;
    return user;
}
```

Why this is the right layer to fix it at, instead of the alternatives:
- Adding `.select("-password")` to every route works, but it's fragile — every *future* route
  that fetches a user has to remember to add it too, forever. One miss reopens the leak.
- Adding `select: false` directly on the `password` field in the schema changes default query
  behavior **everywhere**, including the one place that genuinely needs it
  (`validatePassword`, below) — would force adding `.select("+password")` wherever it's
  actually used. More invasive, more surface area to get wrong.
- Overriding `toJSON()` only changes the very last step — turning a document into outgoing
  JSON. It doesn't touch how documents are fetched or used internally at all.

**Why `validatePassword` still works, completely unaffected:**
```js
userSchema.methods.validatePassword = async function(passwordInputByUser){
    const user = this;
    const hashpassword = user.password;        // reads the IN-MEMORY field directly
    return await bcrypt.compare(passwordInputByUser, hashpassword);
}
```
This runs during `/login`, comparing `user.password` on the live document — **before** any
`res.json()` call, so before `toJSON()` is ever invoked. The override only fires at
serialization time, which is a separate, later step. Mutating what gets serialized doesn't
touch the object attributes still sitting in memory.

**Full flow for a `/login` call, concretely:**
1. `User.findOne({email})` → full document in memory, `password` included.
2. `validatePassword(...)` → `bcrypt.compare` against the in-memory hash → works, unaffected.
3. `res.json({data: isUserExist, message: "..."})` → Node needs to stringify `isUserExist`.
4. Stringify sees a custom `toJSON()` defined on it → calls ours instead of the default.
5. Our `toJSON()` converts to a plain object, deletes `password`, returns the rest.
6. *That* password-free object is what actually reaches the client.

**Doesn't affect `.lean()` queries** (e.g. `/feed`, `/user/connections`) — those already return
plain JS objects via `.select(USER_SAFE_DATE)`, which never included `password` to begin with,
and plain objects have no `.methods` at all (no Mongoose document wrapper), so this override
doesn't apply to them and isn't needed there.

**Same placement rule as the `.methods` gotcha just above applies here too** — this has to be
added *before* `mongoose.model("User", userSchema)` compiles the schema, same reasoning as
`getJWT`/`validatePassword`.

## Built-in range validators: `min`/`max` (numbers), `minLength`/`maxLength` (strings)

```js
age: {
    type: Number,
    min: 18,
    max: 70
}
```

No custom `validate` function needed for a simple numeric range — same idea as `minLength`/
`maxLength` on `firstName`, just for numbers.

# Session Log — 2026-09-05: Building Mutual Connections (every fail, in order)

This is a blow-by-blow record of today's build of the mutual-connections feature — every wrong
attempt, why it was wrong, the fix, and a dry run proving the fix. Written in the order things
actually happened, not cleaned up — the point is to see the *pattern* of mistakes, since several
repeat.

---

## 1. `getConnectionIds` first draft — using `res` in a function that has no `res`

**What I wrote:**
```js
const getConnectionIds = async(userId)=>{
    try{
        const AllConnectionRequests = await connectionRequestModel.find({...})
        res.status(200).send(AllConnectionRequests);
    }
    catch(err){
        res.status(400).send(err.message);
    }
}
```

**What was wrong:** this function's signature is `async(userId)` — only one parameter. There is
no `req`/`res` anywhere in scope. `res.status(...)` would throw `ReferenceError: res is not
defined` the instant it ran. The deeper confusion: this is a **plain utility function**, meant
to `return` a value to whoever calls it — not a route handler, which sends an HTTP response.
Utility functions and route handlers are different *kinds* of functions with different jobs.

**The fix:** delete every `res.*` line; use `return` instead.

---

## 2. "Why is nothing printing?" — three stacked reasons

**What I wrote (test attempt):**
```js
getConnectionIds("6a9aac0c3a06a50e44413576");
```
placed at the bottom of `connections.js`, with no file anywhere `require`-ing this module.

**What was wrong, all three at once:**
1. Nothing else in the project `require()`s `connections.js` yet — Node only executes a file's
   top-level code when something `require()`s it. This call never ran at all.
2. Even if it did run: `getConnectionIds(...)` is `async`, so it returns a Promise. The call
   above never does anything with that Promise (no `.then()`, no `await`) — the result just
   evaporates.
3. A `console.log(...)` originally sitting *after* a `return` statement inside the function
   itself was dead code — nothing after `return` in the same block ever executes.

**The fix:** stop trying to run this file standalone (it also has no DB connection of its own —
`connectionRequestModel` needs the same live Mongo connection the real server already has).
Instead, temporarily call `getConnectionIds` from inside an already-running, already-connected
route, and `console.log` the result there.

---

## 3. `dataSet.add(row.toUserId)` — adding raw `ObjectId`s instead of strings

**What I wrote:**
```js
AllConnectionRequests.forEach((row)=>{
    if(row.fromUserId.toString() === userId){
        dataSet.add(row.toUserId);        // ❌ raw ObjectId, not a string
    }
    else{
        dataSet.add(row.fromUserId);      // ❌ same issue
    }
})
```

**What was wrong:** two separate bugs in one block.
- `row.fromUserId.toString() === userId` compares a **string** against `userId`, which might
  itself be a raw `ObjectId` (depending on the caller) — `string === ObjectId` is always
  `false`.
- Adding the raw `ObjectId` (not `.toString()`'d) into the `Set` matters a lot here, because
  this `Set` gets **intersected** with another `Set` later. Two separate `ObjectId` objects
  representing the exact same ID are never `===` to each other, so `Set.has()` checks between
  two `Set`s full of raw `ObjectId`s would basically never find a real match.

**The fix:**
```js
AllConnectionRequests.forEach((row)=>{
    if(row.fromUserId.toString() === userId.toString()){
        dataSet.add(row.toUserId.toString());
    }
    else{
        dataSet.add(row.fromUserId.toString());
    }
})
```

**Dry run** — `userId = "YOU_ID"`, one row: `{fromUserId: ObjectId("YOU_ID"), toUserId: ObjectId("ALICE_ID")}`
- `row.fromUserId.toString()` → `"YOU_ID"`. `userId.toString()` → `"YOU_ID"`. Equal → `true`.
- `dataSet.add(row.toUserId.toString())` → adds the *string* `"ALICE_ID"`.
- Result: `dataSet = Set {"ALICE_ID"}` — every entry is now a plain string, safe for later
  `Set`-to-`Set` comparisons.

---

## 4. Inconsistent return type for "zero connections"

**What I wrote:**
```js
if(AllConnectionRequests.length === 0){
    return ("No Mutual friends");   // a STRING
}
...
return dataSet;                     // a Set
```

**What was wrong:** callers of this function would need to handle two completely different
types depending on the situation. Worse: the intersection logic that uses this function's result
calls `.has(...)` on it — a method that exists on `Set`s but not on strings. If a caller ever
got the string back, `.has(...)` would throw `TypeError`.

**The fix (found by restructuring, not by directly changing the return value):**
```js
const dataSet = new Set();          // declared BEFORE the check
if(AllConnectionRequests.length === 0){
    dataSet;                        // (this line is actually redundant/dead — see below)
}
AllConnectionRequests.forEach((row)=>{ ... })
return dataSet;
```
Turns out the `if` block isn't even needed — `.forEach()` on an empty array simply never runs
its callback, so `dataSet` naturally stays an empty `Set` without any special-casing at all.
Consistent type (`Set`) either way, no extra code required.

---

## 5. Detail endpoint (`/user/mutual-connections/:candidateId`) — missing `await`, missing `try/catch`

**What I wrote:**
```js
userRouter.get('/user/mutual-connections/:candidateId' , userAuth , async(req,res)=>{
    const loggedInUser = req.user;
    const candidateId = req.params.candidateId;
    const allConnectionsForUser1 = getConnectionIds(loggedInUser._id);   // ❌ no await
    const allConnectionForUser2 = getConnectionIds(candidateId)          // ❌ no await
})
```

**What was wrong:** `getConnectionIds` is `async`. Without `await`, both variables hold
**Promises**, not the actual `Set`s. Any later `.filter()`/`.has()` call on a Promise would
fail (Promises don't have those methods). Also: no `try/catch` wrapping any of this, unlike
every other route in the project.

**The fix:** add `await` to both calls, wrap the whole handler body in `try { ... } catch(err) { res.status(400).send(err.message) }`.

---

## 6. `[x]` vs `[...x]` — wrapping a Set instead of spreading it

**What I wrote:**
```js
const mutualIds = await [allConnectionsForUser1].filter((Id)=>{
    return allConnectionForUser2.has(Id);
})
```

**What was wrong, two things:**
- `[allConnectionsForUser1]` creates an array with **exactly one element** — the entire `Set`
  object itself, not its contents. `.filter()` on this array would only ever examine that one
  weird "element" (a whole Set), never the individual IDs inside it.
- `await` in front of a `.filter()` call does nothing useful — `.filter()` is synchronous, it
  never returns a Promise. Harmless, but pointless.

**The fix:**
```js
const mutualIds = [...allConnectionsForUser1].filter((Id)=>{
    return allConnectionForUser2.has(Id);
})
```

**Dry run** — `allConnectionsForUser1 = Set {"ALICE_ID", "CAROL_ID"}`
- `[allConnectionsForUser1]` → `[ Set(2){"ALICE_ID","CAROL_ID"} ]` — one item, the whole Set.
- `[...allConnectionsForUser1]` → `["ALICE_ID", "CAROL_ID"]` — two items, the actual IDs.
Only the second form lets `.filter()` examine each ID individually.

---

## 7. `User.find({_id: mutualIds})` instead of `User.find({_id: {$in: mutualIds}})`

**What I wrote:**
```js
const AllMutualConnectionsDetails = User.find({ _id : mutualIds});   // ❌ missing $in, missing await
res.status(200).send(AllMutualConnectionsDetails);
```

**What was wrong, three things:**
- No `$in` — MongoDB's default matching (no operator) means "exact equality." `{_id: mutualIds}`
  asks "does `_id` literally EQUAL this entire array?" — `_id` is never an array on a real
  document, so this matches nothing, ever.
- No `await` — sends a Promise object to the client instead of the resolved data.
- No `.select(USER_SAFE_DATE)` — would leak every field, including hashed passwords.

**The fix:**
```js
const AllMutualConnectionsDetails = await User.find({ _id : { $in : mutualIds } }).select(USER_SAFE_DATE);
```

---

## 8. `candidateId` never validated before use

**The gap noticed:** nothing checked that `candidateId` (from the URL) was even a
properly-formatted Mongo ID, let alone that it belonged to a real user. A malformed ID would
throw a raw, cryptic Mongoose `CastError`; a well-formed-but-nonexistent ID would silently
return an empty result, pretending success for a candidate that doesn't exist.

**First attempt at the fix, with two new bugs:**
```js
const { default: mongoose } = require('mongoose');   // ❌ wrong destructuring
...
const validateMutualConnectionCandidateId = async(candidateId)=>{
    if(!mongoose.Types.ObjectId.isValid(candidateId)){
        throw new Error("Invalid candidateID");
    }
    const isCandidateIdUserExists = await User.findById({candidateId});   // ❌ wrapped in object
    if(!isCandidateIdUserExists){
        throw new Error("Invalid User");
    }
}
```

**What was wrong:**
- `const { default: mongoose } = require('mongoose')` — this destructuring pattern is for a
  different kind of module system interop (ES Modules via certain bundlers). Plain CommonJS
  `require('mongoose')` returns the mongoose object **directly** — it has no `.default`
  property. So `mongoose` here was `undefined`, and `mongoose.Types.ObjectId.isValid(...)` would
  throw `Cannot read properties of undefined (reading 'Types')`.
- `User.findById({candidateId})` — `{candidateId}` is shorthand for `{candidateId: candidateId}`,
  an **object**, not the raw ID value `findById` expects directly.

**The fix:**
```js
const mongoose = require('mongoose');   // plain require, no destructuring
...
const isCandidateIdUserExists = await User.findById(candidateId);   // raw value, no wrapping
```

**Dry run, all three outcomes:**
- `candidateId = "banana"` → `mongoose.Types.ObjectId.isValid("banana")` → `false` → throws
  `"Invalid candidateID"` immediately, no DB call wasted.
- `candidateId = "000000000000000000000000"` (well-formed, but no real user has this ID) →
  passes the format check → `User.findById(...)` → `null` → throws `"Invalid User"`.
- `candidateId` = a real user's actual ID → passes both checks → proceeds normally.

---

## 9. The feed's batched version — `mutualConnectionsCount` computed wrong

**What I wrote:**
```js
const mutualConnectionsCount = 0;   // dead, unused variable

feedData.forEach((candidate)=>{
    const theirConnections = allConnectionsOfCandidateIdsMap.get(candidate._id.toString());
    candidate.mutualConnectionsCount = [...myConnectionsSet].filter((Id)=>{
        theirConnections.has(Id).length;   // ❌ two bugs in one line
    })
})
```

**What was wrong, two stacked bugs in the `.filter()` callback:**
- **Missing `return`** — same recurring pattern from way earlier in the project
  (`validateEditProfileDate`'s original bug). `theirConnections.has(Id)` computes a boolean but
  never returns it, so the callback implicitly returns `undefined` every time → `.filter()`
  always produces an empty array.
- **`.length` in the wrong place** — even with `return` added, `.length` was being called
  *inside* the callback, on `theirConnections.has(Id)` — a **boolean**. Booleans don't have a
  `.length` property (accessing it just silently gives `undefined`, not an error — a subtle,
  no-crash bug). `.length` needs to be chained onto the *result of the whole `.filter()` call*,
  not used anywhere inside the callback.

**The fix:**
```js
candidate.mutualConnectionsCount = [...myConnectionsSet].filter((Id)=>{
    return theirConnections.has(Id);
}).length
```

**Dry run** — `myConnectionsSet = Set{"ALICE_ID"}`, `theirConnections = Set{"ALICE_ID","ISLA_ID"}`
- `[...myConnectionsSet]` → `["ALICE_ID"]`
- `.filter(Id => theirConnections.has(Id))` → checks `"ALICE_ID"` → `theirConnections.has("ALICE_ID")` → `true` → kept → `["ALICE_ID"]`
- `.length` → `1`
- `candidate.mutualConnectionsCount = 1` ✅

---

## 10. The silent-serialization trap — `.lean()` — the last bug, and the sneakiest

**What happened:** after fixing #9, the logic was fully correct — but a live test (real Emma↔Alice↔You
triangle set up specifically to prove it) returned candidates with **no `mutualConnectionsCount`
field at all** in the JSON response. No error anywhere. The count was being computed correctly
in memory (confirmed: assigning `candidate.mutualConnectionsCount = 1` genuinely works as a plain
JS property assignment, no declaration needed first) — it just never made it into the final
JSON sent to the client.

**Why:** `feedData` came from `User.find(...).select(...)` — real **Mongoose documents**, not
plain JS objects. Mongoose documents have their own custom `toJSON()` logic, which by default
only serializes fields that exist in the **schema**. `mutualConnectionsCount` was never part of
`userSchema`, so even though it genuinely existed on the in-memory object, the JSON-conversion
step for a Mongoose document filtered it back out.

**The fix:** add `.lean()` to the original query:
```js
const feedData = await User.find({ $and: feedFilter })
    .select(USER_SAFE_DATE)
    .skip(noOfPageToBeSkiped)
    .limit(PageLimit)
    .lean();     // <-- returns plain JS objects instead of full Mongoose documents
```
Plain objects have no custom `toJSON()` filtering — whatever properties are on them (including
ones added after the query, like `mutualConnectionsCount`) get serialized as-is.

**Confirmed via live test:** Emma (genuinely sharing Alice as a mutual with "you") correctly
showed `"mutualConnectionsCount": 1` in the actual curl response; Frank and Isla (no shared
connections) correctly showed `0`.

---

## The pattern across all 10

Look back at how many of these are the **exact same underlying mistake**, just showing up in a
new spot each time:
- **Forgetting `return` inside a callback** (#3's precursor pattern, #9) — happened again even
  after being caught and explained the first time, earlier in the project.
- **String vs. non-string ID comparison** (#3, #6) — `.toString()` matters every time a `Set`,
  `Map`, or `===`/`.includes()` check touches a Mongo ID.
- **Confusing "the assignment worked" with "it survived the next step"** (#10) — the property
  genuinely existed in memory; the bug was entirely about what happens *after*, during
  serialization.

Recognizing "this is the same *shape* of mistake as before" is often faster than debugging each
one from scratch.

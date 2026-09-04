# MongoDB Query Operators & `.populate()`

## `$or` — match if ANY of these conditions is true

```js
connectionRequestModel.findOne({
    $or: [
        { fromUserId, toUserId },                    // shorthand for {fromUserId: fromUserId, toUserId: toUserId}
        { fromUserId: toUserId, toUserId: fromUserId } // same two values, fields SWAPPED
    ]
})
```

If A is sending a request to B (`fromUserId = A`, `toUserId = B`), this checks: "does a request
already exist **A → B**, OR does one exist **B → A**?" — catching a duplicate relationship
regardless of which direction it was originally created in. The second condition's trick is
just swapping which variable goes into which field — same two values, opposite assignment.

## `$and` — combine multiple required conditions, and can be built dynamically

Instead of a hardcoded literal:
```js
User.find({ $and: [condition1, condition2] })
```
build the array as a variable first, then conditionally `.push()` more conditions onto it
*before* the query runs — this is just plain JavaScript, nothing MongoDB-specific:

```js
const feedFilter = [condition1, condition2];
if (someCondition) {
    feedFilter.push(condition3);
}
User.find({ $and: feedFilter });
```

## `$nin` / `$ne` / `$in` — must be nested under a field, never floating alone

```js
{ $nin: [...] }              // ❌ meaningless — not attached to any field
{ _id: { $nin: [...] } }     // ✅ "match if _id is NOT in this list"
{ _id: { $ne: someId } }     // ✅ "match if _id is NOT EQUAL to this one value"
{ gender: { $in: [...] } }   // ✅ "match if gender IS one of these values" — opposite of $nin
```

## `$gte` / `$lte` — range checks, combinable on one field

```js
{ age: { $gte: 22, $lte: 30 } }   // "age is between 22 and 30, inclusive" — ONE condition object
```
Both operators go inside the *same* field's object — no `$and` needed for a single field's
range check.

## `.populate()` + `ref` — resolving a raw ID into the real document, AFTER the query runs

```js
fromUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"     // tells Mongoose WHICH model/collection this ID points to
}
```

**Before `.populate()`** (what's actually stored in the database, and what any `$or`/`$and`
filter compares against):
```json
{ "fromUserId": "6a8931782f74710715bf2978" }
```

**After `.populate("fromUserId", [...])`** (only happens on the *already-fetched* results,
client-side, never changes the database):
```json
{ "fromUserId": { "_id": "6a8931782f74710715bf2978", "firstName": "Test", "lastName": "User" } }
```

Critical consequence: **query filters (`$or`, `$and`, etc.) always see the BEFORE shape** (raw
IDs), because they run against the database directly. **Code in `.map()`/after the query sees
the AFTER shape** (nested objects), because `.populate()` already ran by then. This is why
comparing `row.fromUserId.toString() === loggedInUser._id.toString()` breaks once `fromUserId`
is populated — you need `row.fromUserId._id.toString()` instead, reaching one level deeper into
the now-nested object.

## GeoJSON `Point` + `2dsphere` index + `$near`

Storing a location:
```js
location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: [Number]   // [longitude, latitude] — longitude FIRST, a common mix-up
}
```

A geospatial index (needed before `$near` will even work — declared separately from the field,
via a schema-level call):
```js
userSchema.index({ location: "2dsphere" });
```

Querying by proximity:
```js
User.find({
    location: {
        $near: {
            $geometry: { type: "Point", coordinates: [lng, lat] },
            $maxDistance: 20000   // meters
        }
    }
})
```

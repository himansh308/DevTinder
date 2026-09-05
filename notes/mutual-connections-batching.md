# Mutual Connections Count — Batched Approach, Fully Explained

## The problem this solves

`/feed` returns a page of candidates (say 10 people). For each one, we want to show
`mutualConnectionsCount` — "how many of MY connections does THIS candidate also have?" — as a
badge (e.g. "🤝 2 mutual"), purely as **display information**, never as a filter (deliberate
product decision — mutuals are a plus point on someone's profile, not a gate that hides
people).

## Two ways to compute it — and why we picked the harder one

**Approach 1 (simple, but N+1 queries):** for each candidate, separately query the database for
*that one candidate's* connections, then intersect with your own. Simple to write, easy to
follow — but for a page of 10 candidates, that's **10 separate database round-trips**, all
asking the same *shape* of question, one at a time.

**Approach 2 (batched, 1 query total):** fetch *every* relevant connection in **one** query,
then group the results in plain JavaScript (in memory, no more DB calls) before computing each
candidate's count. More code, less intuitive at first, but the query count stays at **1**
regardless of whether the feed page has 3 candidates or 300.

We built Approach 2 for real — here's the full thing, in order.

## Step 1 — one query covering ALL candidates at once

```js
const candidateIds = feedData.map(c => c._id);   // e.g. ["EMMA_ID", "FRANK_ID", "ISLA_ID"]

const allRelevantConnections = await connectionRequestModel.find({
    status: "accepted",
    $or: [
        { fromUserId: { $in: candidateIds } },
        { toUserId: { $in: candidateIds } }
    ]
})
```
This is the exact same `$or` + `$in` combo you've used before (recall: `$or` = "match if EITHER
side," `$in` = "match if this field's value is one of these listed values") — just applied to a
whole *list* of candidates at once, instead of one person. One round-trip, regardless of how
many candidates you're checking.

Worked example — say this comes back with 2 documents:
```js
[
  { fromUserId: "EMMA_ID", toUserId: "ALICE_ID", status: "accepted" },
  { fromUserId: "ISLA_ID", toUserId: "EMMA_ID",  status: "accepted" }
]
```

## Step 2 — set up an empty "bucket" (Set) for every candidate

```js
const connectionsByCandidateId = new Map();
for (const id of candidateIds) connectionsByCandidateId.set(id, new Set());
```
A `Map` is like an object built specifically for key→value lookups. After this loop runs once
per candidate ID:
```
Map {
  "EMMA_ID"  -> Set {}
  "FRANK_ID" -> Set {}
  "ISLA_ID"  -> Set {}
}
```
Every candidate starts with an empty bucket, ready to be filled in from the batch of results.

## Step 3 — walk the ONE batch of results, filling in each candidate's bucket

```js
allRelevantConnections.forEach((row) => {
    if (candidateIds.includes(row.fromUserId.toString())) {
        connectionsByCandidateId.get(row.fromUserId.toString()).add(row.toUserId.toString());
    }
    if (candidateIds.includes(row.toUserId.toString())) {
        connectionsByCandidateId.get(row.toUserId.toString()).add(row.fromUserId.toString());
    }
})
```

**Why TWO separate `if`s, not one:** each row's "relevant candidate" could be sitting in EITHER
the `fromUserId` slot OR the `toUserId` slot — it depends entirely on who originally sent that
particular request. You don't know in advance which slot it'll be in for any given row, so you
have to check both slots, independently, every single row.

Trace both rows:

**Row 1** — `{ fromUserId: "EMMA_ID", toUserId: "ALICE_ID" }`
- 1st `if`: is `"EMMA_ID"` one of our candidates? **Yes** → `connectionsByCandidateId.get("EMMA_ID").add("ALICE_ID")` → Emma's bucket: `Set {"ALICE_ID"}`
- 2nd `if`: is `"ALICE_ID"` one of our candidates? **No** (Alice isn't in this feed page, she's just someone Emma knows) → skipped

**Row 2** — `{ fromUserId: "ISLA_ID", toUserId: "EMMA_ID" }`
- 1st `if`: is `"ISLA_ID"` a candidate? **Yes** → Isla's bucket: `Set {"EMMA_ID"}`
- 2nd `if`: is `"EMMA_ID"` a candidate? **Yes** (Emma is in BOTH slots across the two rows — she's a candidate, and she happens to be `toUserId` here) → Emma's bucket gets `"ISLA_ID"` ADDED to what's already there → Emma's bucket becomes: `Set {"ALICE_ID", "ISLA_ID"}`

After both rows are processed:
```
Map {
  "EMMA_ID"  -> Set {"ALICE_ID", "ISLA_ID"}
  "FRANK_ID" -> Set {}                        (never mentioned in any row — stays empty)
  "ISLA_ID"  -> Set {"EMMA_ID"}
}
```

## Step 4 — compute each candidate's mutual count, using the pre-built buckets (no more DB calls)

```js
const myConnections = await getConnectionIds(loggedInUser._id);   // fetched ONCE, before this whole process
// myConnections = Set {"ALICE_ID"}

feedData.forEach((candidate) => {
    const theirConnections = connectionsByCandidateId.get(candidate._id.toString());
    candidate.mutualConnectionsCount = [...myConnections].filter(id => theirConnections.has(id)).length;
})
```

**Emma:**
```js
theirConnections = Set {"ALICE_ID", "ISLA_ID"}
[...myConnections]                          // ["ALICE_ID"]
  .filter(id => theirConnections.has(id))   // "ALICE_ID" -> theirConnections.has("ALICE_ID") -> true -> kept
                                             // -> ["ALICE_ID"]
  .length                                   // 1
// Emma.mutualConnectionsCount = 1
```

**Frank:**
```js
theirConnections = Set {}
[...myConnections].filter(id => theirConnections.has(id))   // "ALICE_ID" -> has? false -> dropped -> []
  .length   // 0
// Frank.mutualConnectionsCount = 0
```

**Isla:**
```js
theirConnections = Set {"EMMA_ID"}
[...myConnections].filter(id => theirConnections.has(id))   // "ALICE_ID" -> has? false -> dropped -> []
  .length   // 0
// Isla.mutualConnectionsCount = 0
```

## The payoff

Same final answer as the naive per-candidate approach would have given (Emma → 1, Frank → 0,
Isla → 0) — but the entire computation touched the database **exactly once** (Step 1's single
batched query), no matter whether the feed page has 3 candidates or 300. Steps 2-4 are pure
in-memory JavaScript — `Map`/`Set` lookups, no network round-trips.

## Key ideas this leans on (see other notes for deeper background)

- `$in` for matching against a whole list at once — [mongodb-query-operators.md](./mongodb-query-operators.md)
- `Set` intersection via `[...setA].filter(id => setB.has(id))` — same pattern used in the
  simple, per-candidate `getConnectionIds`-based approach this batches on top of.
- Why IDs must be `.toString()`'d before going into any `Set`/`Map` key or membership check —
  raw `ObjectId`s from separate query results are never `===` to each other even when they
  represent the same underlying ID — [javascript-gotchas.md](./javascript-gotchas.md).

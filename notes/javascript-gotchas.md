# JavaScript Gotchas

## `!` binds tighter than comparison operators

`if(!AllConnectionRequests.length===0)` does NOT mean "if length is not 0."
`!` grabs `AllConnectionRequests.length` first, so it actually parses as:

```js
(!AllConnectionRequests.length) === 0
```

Trace it:
- `length` is `0` → `!0` → `true` → `true === 0` → `false`
- `length` is `3` → `!3` → `false` → `false === 0` → `false`

**Always false, no matter what.** If you want "length is not zero," write it directly:
`AllConnectionRequests.length !== 0` (or `.length === 0` and negate the whole `if`, not just one piece).

## `undefined` is not loosely equal to `0`

`loggedInUser?.genderPreference?.length != 0` looks like it should skip the block when the
field is unset — but when `genderPreference` doesn't exist, the whole optional-chain evaluates
to `undefined`, not `0`. And `undefined != 0` is **`true`** in JavaScript (`undefined` is only
loosely equal to `null`, nothing else). So this condition actually *runs* the block precisely
when you didn't want it to.

Fix: check for `undefined` explicitly, or check truthiness of the field before checking its
length:

```js
loggedInUser?.genderPreference != undefined && loggedInUser?.genderPreference?.length != 0
```

## `.every()` short-circuits on the first falsy return — don't use it for side effects

`.every()` is a **predicate** method: it's supposed to answer "do ALL elements pass this
test?" and it **stops looping the moment the callback returns something falsy**, since at that
point the answer is already "no."

```js
Object.keys(req.body).every((key) => {
    loggedInUser[key] = req.body[key];   // no return statement!
})
```

Since this callback never explicitly `return`s anything, it implicitly returns `undefined`
(falsy) on the **very first key** — so `.every()` stops immediately, and every field after the
first one silently never gets applied. This is a real, hard-to-notice bug, not just bad style.

If you just want to run something for every item and don't care about a true/false result, use
`.forEach()` instead — it always runs for every element, no early exit:

```js
Object.keys(req.body).forEach((key) => {
    loggedInUser[key] = req.body[key];
})
```

(The flip side: if you genuinely need a true/false "did every item pass," `.every()`'s callback
**must** explicitly `return` a boolean each time — e.g. `return Allowed_Edits.includes(key)`.)

## Bracket notation: `obj[key]` reads the variable's *value* as the property name

```js
const key = "age";
obj[key]        // same as obj.age — key holds the property NAME
```

The bug version, seen in an early draft of the OTP code:

```js
const { resetOtp, resetOtpExpiry } = isUserValid;   // pulls out CURRENT VALUES (e.g. undefined for a new user)
user[resetOtp] = "482913";                          // resetOtp here is a VALUE, not a field name!
// This sets a property literally named "undefined" on user, not the resetOtp FIELD.
```

Bracket notation only makes sense when the thing inside `[...]` is a **string holding the
field's name** — not the field's current value.

## `typeof` is an operator, not a method — and it returns lowercase strings

```js
req.body.minAge.typeOf(Number)      // ❌ not real JS — .typeOf() doesn't exist
req.body.minAge === Number          // ❌ compares the VALUE against the Number FUNCTION itself — never true
typeof req.body.minAge === "number" // ✅ correct — typeof goes BEFORE the value, compared against a lowercase string
```

`typeof` always returns lowercase category names: `"number"`, `"string"`, `"boolean"`,
`"undefined"`, `"object"`, `"function"`. Never capitalized.

## String comparison is lexicographic, not numeric — a real trap for raw `req.body` values

```js
"9" < "10"   // false! — compares character by character: '9' has a higher char code than '1'
9 < 10       // true — real numeric comparison
```

JSON request bodies can contain numeric-*looking* strings if the client sends them wrong. If you
compare `req.body.minAge < req.body.maxAge` without checking `typeof` first, and someone sends
`{"minAge": "9", "maxAge": "10"}` as strings, you get the *wrong* answer silently — no error,
just incorrect logic. This is why `validatePreferences` checks `typeof === "number"` for both
values *before* doing the `<` comparison.

## Truthiness (`!value`) catches "missing," but NOT "present but empty" — need `.length` too

Building `validateLocation`'s check for `req.body.location.coordinates`:

```js
if (!req.body.location.coordinates || !Array.isArray(req.body.location.coordinates) || req.body.location.coordinates.length !== 2) {
    throw new Error("Invalid Request");
}
```

Trace what each piece actually catches, with different bad inputs:

- `{"location": {}}` → `coordinates` is `undefined`. `!undefined` → `true` → **caught** by
  the first piece alone.
- `{"location": {"coordinates": []}}` → `coordinates` is `[]`, an empty array. **The trap:**
  any array — even an empty one — is a real object, and objects are always truthy in
  JavaScript. So `![]` → `false`. The first piece (`!coordinates`) does **NOT** catch this on
  its own! It's only caught because of the third piece, `.length !== 2` → `0 !== 2` → `true`.
- `{"location": {"coordinates": "77.5,12.9"}}` → a string, not an array. First piece:
  `!"77.5,12.9"` → `false` (non-empty strings are truthy too) — not caught there either. Caught
  by the second piece: `!Array.isArray("77.5,12.9")` → `true`.
- `{"location": {"coordinates": [77.5, 12.9]}}` → valid. All three pieces are `false` →
  nothing throws.

**Lesson:** "is this falsy" and "is this the right shape" are different questions. `!value`
alone only ever catches completely-missing values (`undefined`, `null`, `0`, `""`, `false`) —
it does NOT catch "present, but empty/wrong-shaped" (`[]`, `{}`, a string instead of an array).
Each condition in an `||` chain like this is responsible for catching one *specific* failure
mode — don't assume one check's `!` covers cases it structurally can't.

## Negating only PART of a combined condition — the coordinate-bounds saga

Building the longitude/latitude range check for `location.coordinates`, in order, across several
attempts:

**Attempt 1** — missing negation on one side entirely:
```js
if(!(value[0] >= -180 && value[0] <= 180) || (value[1] >= -90 && value[1] <= 90))
```
Trace with a fully VALID point (lng `77`, lat `12`): `!(true) → false`. `(true) → true`.
`false || true → true` — **throws on perfectly valid input**, because the right side was never
negated at all — it reads "longitude invalid OR latitude valid," not what was intended.

**Attempt 2** — negation moved outside, but paired with the wrong operator (`||` instead of `&&`
inside):
```js
if(!((value[0] >= -180 && value[0] <= 180) || (value[1] >= -90 && value[1] <= 90)))
```
By De Morgan's law, `!(A || B)` = `!A && !B` — this only throws when **BOTH** are invalid at
once. Trace with lng `200` (invalid) and lat `12` (valid): `(false || true) → true`.
`!(true) → false` — **doesn't throw**, even though longitude `200` is clearly out of range.

**The actual fix** — negate a single `&&` of both full checks:
```js
if(!((value[0] >= -180 && value[0] <= 180) && (value[1] >= -90 && value[1] <= 90)))
```
Plain-English target this matches: *"throw UNLESS (longitude is valid AND latitude is valid)"*.
Trace all four combinations:
- both valid → `(true && true) → true` → `!(true) → false` → no throw. ✅
- lng invalid, lat valid → `(false && true) → false` → `!(false) → true` → throws. ✅
- lng valid, lat invalid → `(true && false) → false` → `!(false) → true` → throws. ✅
- both invalid → `(false && false) → false` → `!(false) → true` → throws. ✅

**Lesson:** when the intent is "reject unless ALL sub-conditions individually hold," the
negation needs to wrap a single `&&` of the *entire* set of checks — `!(A && B)` — not `||`
inside the negation (De Morgan flips that into "reject unless ALL FAIL," the opposite), and not
a negation applied to only one side while leaving the other un-negated. When stuck, trace at
least one "should pass" case AND one "should fail" case through the actual expression by hand
before trusting it.

## Array destructuring vs. referencing the whole array

```js
const [preference] = req.body.genderPreference;   // pulls out ONLY the first element
const preference = req.body.genderPreference;     // the ENTIRE array, as one value
```

Square brackets on the left (`const [x] = arr`) mean "unpack this array positionally into
separate variables." If you want the whole array as-is, don't destructure at all — just assign
it directly.

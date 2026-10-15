#!/bin/bash
# Hits every route with valid and invalid input and prints: label | HTTP status | response (trimmed).
#
# Needs: backend running (npm run dev) and the seeded test data (npm run seed -- --fake 200).
# Changes data only in ways it undoes: re-saves your own profile values, and creates a throwaway
# signup (zodtest@test.com) that it deletes. Local test database only.
#
#   npm run test:routes                     # print results
#   npm run test:routes > before.txt        # save, change code, run again, compare the two files

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
B="${API_URL:-http://localhost:7777}"
MONGO_URI="${MONGO_URI:-$(grep '^MONGO_URI=' "$ROOT/.env" | cut -d= -f2-)}"
S="$(mktemp -d)"; trap 'rm -rf "$S"' EXIT
J="Content-Type: application/json"
C="$S/you.txt"; T="$S/tmp.txt"; X="$S/x.txt"; NONE="$S/none.txt"

r() { # label method path [body] [cookie]
  local label=$1 method=$2 path=$3 body=$4 cookie=${5:-$C} out code
  if [ -n "$body" ]; then out=$(curl -s -b "$cookie" -c "$cookie" -X "$method" "$B$path" -H "$J" -d "$body" -w $'\n%{http_code}')
  else out=$(curl -s -b "$cookie" -c "$cookie" -X "$method" "$B$path" -w $'\n%{http_code}'); fi
  code=${out##*$'\n'}; out=${out%$'\n'*}
  printf '%-34s | %s | %s\n' "$label" "$code" "$(echo "$out" | tr -d '\n' | cut -c1-95)"
}

curl -s -c "$C" -X POST "$B/login" -H "$J" -d '{"email":"you@test.com","password":"Test1234@#$"}' -o /dev/null
ME=$(curl -s -b "$C" -X POST "$B/profile/view")
ALICE=$(mongosh "$MONGO_URI" --quiet --eval 'print(db.users.findOne({email:"alice@test.com"})._id.toString())')
EDIT=$(echo "$ME" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(json.dumps({k:d[k] for k in ['firstName','lastName','age','photoUrl','skills','about'] if k in d}))")
EDIT_AGE_STR=$(echo "$EDIT" | python3 -c "import json,sys; d=json.load(sys.stdin); d['age']=str(d['age']); print(json.dumps(d))")
PREFS=$(echo "$ME" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(json.dumps({k:d[k] for k in ['genderPreference','minAge','maxAge','maxDistance']}))")
LOC=$(echo "$ME" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(json.dumps({'location':{'coordinates':d['location']['coordinates']},'locationLabel':d['locationLabel'],'locationAutoSync':d.get('locationAutoSync',True)}))")
LONG=$(python3 -c "print('a'*301)")
BADID=123abc; FAKEID=000000000000000000000000

echo "=== signup ==="
r "signup: name too short"       POST /signup '{"firstName":"Bo","lastName":"Smith","email":"zodtest@test.com","password":"Test1234@#$","gender":"male"}' "$T"
r "signup: weak password"         POST /signup '{"firstName":"Zodd","lastName":"Tester","email":"zodtest@test.com","password":"abc","gender":"male"}' "$T"
r "signup: bad gender"            POST /signup '{"firstName":"Zodd","lastName":"Tester","email":"zodtest@test.com","password":"Test1234@#$","gender":"robot"}' "$T"
r "signup: extra field (isAdmin)" POST /signup '{"firstName":"Zodd","lastName":"Tester","email":"zodtest@test.com","password":"Test1234@#$","gender":"male","isAdmin":true}' "$T"
r "signup: valid"                 POST /signup '{"firstName":"Zodd","lastName":"Tester","email":"zodtest@test.com","password":"Test1234@#$","gender":"male"}' "$T"
r "signup: duplicate email"       POST /signup '{"firstName":"Zodd","lastName":"Tester","email":"zodtest@test.com","password":"Test1234@#$","gender":"male"}' "$X"
r "delete throwaway account"      DELETE /delete "" "$T"

echo "=== login ==="
r "login: valid"                  POST /login '{"email":"you@test.com","password":"Test1234@#$"}' "$X"
r "login: uppercase email"        POST /login '{"email":"YOU@test.com","password":"Test1234@#$"}' "$X"
r "login: wrong password"         POST /login '{"email":"you@test.com","password":"Wrong1234@#$"}' "$X"
r "login: \$regex injection"      POST /login '{"email":{"$regex":"^you"},"password":"Test1234@#$"}' "$X"
r "login: missing email"          POST /login '{"password":"Test1234@#$"}' "$X"

echo "=== forgot / reset ==="
r "forgot: unknown email"         POST /forgotPassword '{"email":"nobody@test.com"}'
r "forgot: injection"             POST /forgotPassword '{"email":{"$ne":null}}'
r "forgot: not an email"          POST /forgotPassword '{"email":"hello"}'
r "reset: wrong OTP"              POST /resetPassword '{"email":"you@test.com","OTP":"000000","newPassword":"Strong1234@#$","confirmPassword":"Strong1234@#$"}'
r "reset: weak new password"      POST /resetPassword '{"email":"you@test.com","OTP":"000000","newPassword":"abc","confirmPassword":"abc"}'
r "reset: OTP as number"          POST /resetPassword '{"email":"you@test.com","OTP":123456,"newPassword":"Strong1234@#$","confirmPassword":"Strong1234@#$"}'
r "reset: injection"              POST /resetPassword '{"email":{"$regex":"^you"},"OTP":"000000","newPassword":"Strong1234@#$","confirmPassword":"Strong1234@#$"}'

echo "=== profile/edit ==="
r "edit: same values (frontend)"  PATCH /profile/edit "$EDIT"
r "edit: age as string \"53\""    PATCH /profile/edit "$EDIT_AGE_STR"
r "edit: age \"abc\""             PATCH /profile/edit '{"age":"abc"}'
r "edit: age 12"                  PATCH /profile/edit '{"age":12}'
r "edit: 11 skills"               PATCH /profile/edit '{"skills":["a","b","c","d","e","f","g","h","i","j","k"]}'
r "edit: skills as string"        PATCH /profile/edit '{"skills":"React"}'
r "edit: about 301 chars"         PATCH /profile/edit "{\"about\":\"$LONG\"}"
r "edit: about as object"         PATCH /profile/edit '{"about":{"x":1}}'
r "edit: photoUrl javascript:"    PATCH /profile/edit '{"photoUrl":"javascript:alert(1)"}'
r "edit: forbidden field email"   PATCH /profile/edit '{"email":"hacker@test.com"}'
r "edit: forbidden field password" PATCH /profile/edit '{"password":"Hacked1234@#$"}'
r "edit: restore same values"     PATCH /profile/edit "$EDIT"

echo "=== profile/preferences ==="
r "prefs: same values (frontend)" PATCH /profile/preferences "$PREFS"
r "prefs: minAge > maxAge"        PATCH /profile/preferences '{"minAge":40,"maxAge":30}'
r "prefs: minAge alone \"abc\""   PATCH /profile/preferences '{"minAge":"abc"}'
r "prefs: bad gender"             PATCH /profile/preferences '{"genderPreference":["alien"]}'
r "prefs: maxDistance -5"         PATCH /profile/preferences '{"maxDistance":-5}'
r "prefs: forbidden field"        PATCH /profile/preferences '{"gender":"female"}'
r "prefs: restore same values"    PATCH /profile/preferences "$PREFS"

echo "=== user/location ==="
r "location: same values"         PATCH /user/location "$LOC"
r "location: strings as coords"   PATCH /user/location '{"location":{"coordinates":["a","b"]}}'
r "location: out of range"        PATCH /user/location '{"location":{"coordinates":[500,0]}}'
r "location: autoSync \"yes\""    PATCH /user/location '{"location":{"coordinates":[76.85,30.72]},"locationAutoSync":"yes"}'
r "location: missing location"    PATCH /user/location '{"locationLabel":"x"}'
r "location: restore same values" PATCH /user/location "$LOC"

echo "=== location search / reverse (Nominatim: 1 req/sec) ==="
r "search: valid"                 GET "/location/search?q=Panchkula"; sleep 1.2
r "search: empty"                 GET "/location/search?q="
r "search: q twice (array)"       GET "/location/search?q=a&q=b"
r "reverse: valid"                GET "/location/reverse?lat=30.72&lon=76.85"; sleep 1.2
r "reverse: lat abc"              GET "/location/reverse?lat=abc&lon=76.85"
r "reverse: lat 999"              GET "/location/reverse?lat=999&lon=76.85"
r "reverse: lat missing"          GET "/location/reverse?lon=76.85"

echo "=== requests ==="
r "send: bad id"                  POST "/request/send/interested/$BADID"
r "send: bad status"              POST "/request/send/bogus/$ALICE"
r "send: unknown valid-format id" POST "/request/send/interested/$FAKEID"
r "send: duplicate (you→alice)"   POST "/request/send/interested/$ALICE"
r "review: bad id"                POST "/request/review/accepted/$BADID"
r "review: bad status"            POST "/request/review/bogus/$ALICE"
r "review: not found"             POST "/request/review/accepted/$FAKEID"

echo "=== read routes ==="
r "profile/view"                  POST /profile/view
r "feed"                          GET /feed
r "feed: page=0"                  GET "/feed?page=0"
r "feed: limit=abc"               GET "/feed?limit=abc"
r "connections"                   GET /user/connections
r "requests received"             GET /user/requests/received
r "mutual: bad id"                GET "/user/mutual-connections/$BADID"
r "mutual: alice"                 GET "/user/mutual-connections/$ALICE"
r "logged out → feed"             GET /feed "" "$NONE"

#!/bin/bash
# Tests the password-reset OTP hardening on dev5@test.com (your own account is never touched).
#
# Needs: backend running (npm run dev) and the seeded test data (npm run seed -- --fake 200).
# The database only stores an HMAC of the OTP, so the real code can't be read back out of it.
# setotp() writes the HMAC of a KNOWN code ("135790") using the same OTP_SECRET as the server.
# dev5's password is put back to Test1234@#$ at the end.
#
#   npm run test:otp

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
B="${API_URL:-http://localhost:7777}"
MONGO_URI="${MONGO_URI:-$(grep '^MONGO_URI=' .env | cut -d= -f2-)}"
J="Content-Type: application/json"; E=dev5@test.com
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

setotp() { # setotp CODE [expiryOffsetMs] → store HMAC of a known code for dev5, attempts 0
  node -e '
    require("dotenv").config({ quiet: true });
    const { hashOtp } = require("./src/utils/otp");
    const { MongoClient } = require("mongodb");
    (async () => { const c = await MongoClient.connect(process.env.MONGO_URI);
      await c.db().collection("users").updateOne({ email: process.argv[1] },
        { $set: { resetOtp: hashOtp(process.argv[2]), resetOtpExpiry: new Date(Date.now() + Number(process.argv[3])), resetOtpAttempts: 0 } });
      await c.close(); })();' "$E" "$1" "${2:-300000}"
}
db() { mongosh "$MONGO_URI" --quiet --eval "const u=db.users.findOne({email:'$E'}); print($1)"; }
reset() { curl -s -X POST "$B/resetPassword" -H "$J" -d "{\"email\":\"$E\",\"OTP\":\"$1\",\"newPassword\":\"$2\",\"confirmPassword\":\"${3:-$2}\"}"; }

echo "=== 1. /forgotPassword stores a hash, not the code ==="
curl -s -X POST "$B/forgotPassword" -H "$J" -d "{\"email\":\"$E\"}"; echo
db '"stored resetOtp: " + u.resetOtp + "  (length " + u.resetOtp.length + ", all digits? " + /^\\d+$/.test(u.resetOtp) + ") | attempts: " + u.resetOtpAttempts + " | expires in ~" + Math.round((u.resetOtpExpiry - new Date())/1000) + "s"'

echo "=== 2. OTP fields never appear in responses ==="
curl -s -X POST "$B/login" -H "$J" -d "{\"email\":\"$E\",\"password\":\"Test1234@#\$\"}" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print('secret fields in login response:', [k for k in ['resetOtp','resetOtpExpiry','resetOtpAttempts','password'] if k in d] or 'none')"

echo "=== 3. five wrong guesses, then the code is wiped ==="
setotp 135790
for i in 1 2 3 4 5; do echo -n "wrong guess $i → "; reset 000000 "Strong1234@#\$"; echo; done
echo -n "correct code after lockout → "; reset 135790 "Strong1234@#\$"; echo
db '"resetOtp after lockout: " + u.resetOtp + " | attempts: " + u.resetOtpAttempts'

echo "=== 4. 50 wrong guesses at the same moment (race test) ==="
setotp 135790
for i in $(seq 1 50); do (reset 000000 "Strong1234@#\$"; echo) > "$TMP/par_$i.txt" & done; wait
cat "$TMP"/par_*.txt | sort | uniq -c
echo -n "correct code after the burst → "; reset 135790 "Strong1234@#\$"; echo

echo "=== 5. expired code ==="
setotp 135790 -1000
echo -n "correct code, but expired → "; reset 135790 "Strong1234@#\$"; echo

echo "=== 6. unknown email / no OTP requested ==="
echo -n "unknown email → "; curl -s -X POST "$B/resetPassword" -H "$J" -d '{"email":"nobody@test.com","OTP":"135790","newPassword":"Strong1234@#$","confirmPassword":"Strong1234@#$"}'; echo
echo -n "no OTP requested (code wiped above) → "; reset 135790 "Strong1234@#\$"; echo

echo "=== 7. happy path + reuse ==="
setotp 135790
echo -n "right code, passwords differ → "; reset 135790 "Strong1234@#\$" "Other1234@#\$"; echo
echo -n "right code, passwords match → "; reset 135790 "Strong1234@#\$"; echo
echo -n "login with NEW password → "; curl -s -X POST "$B/login" -H "$J" -d "{\"email\":\"$E\",\"password\":\"Strong1234@#\$\"}" -o /dev/null -w "%{http_code}\n"
echo -n "same code used again → "; reset 135790 "Strong1234@#\$"; echo

echo "=== 8. restore dev5's password ==="
setotp 135790
echo -n "reset back → "; reset 135790 "Test1234@#\$"; echo
echo -n "login with Test1234@#\$ → "; curl -s -X POST "$B/login" -H "$J" -d "{\"email\":\"$E\",\"password\":\"Test1234@#\$\"}" -o /dev/null -w "%{http_code}\n"

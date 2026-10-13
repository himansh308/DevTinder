const crypto = require('crypto');

const OTP_EXPIRES_IN_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

// crypto.randomInt is a cryptographically secure generator; Math.random() is predictable.
const generateOtp = () => String(crypto.randomInt(100000, 1000000));

// A plain SHA-256 of a 6-digit code can be reversed by hashing all 900,000 codes.
// HMAC mixes in OTP_SECRET, so a leaked database alone isn't enough to recover the code.
const hashOtp = (otp) => {
    if (!process.env.OTP_SECRET) {
        throw new Error("OTP_SECRET is not set in .env");
    }
    return crypto.createHmac('sha256', process.env.OTP_SECRET).update(String(otp)).digest('hex');
};

// timingSafeEqual takes the same time whether the first or last character differs.
const otpMatches = (otp, storedHash) => {
    if (typeof storedHash !== 'string' || storedHash.length !== 64) return false;
    const given = Buffer.from(hashOtp(otp), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return given.length === stored.length && crypto.timingSafeEqual(given, stored);
};

module.exports = { OTP_EXPIRES_IN_MS, OTP_MAX_ATTEMPTS, generateOtp, hashOtp, otpMatches };

const crypto = require('crypto');

const OTP_EXPIRES_IN_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;


const generateOtp = () => String(crypto.randomInt(100000, 1000000));

const hashOtp = (otp) => {
    if (!process.env.OTP_SECRET) {
        throw new Error("OTP_SECRET is not set in .env");
    }
    return crypto.createHmac('sha256', process.env.OTP_SECRET).update(String(otp)).digest('hex');
};


const otpMatches = (otp, storedHash) => {
    if (typeof storedHash !== 'string' || storedHash.length !== 64) return false;
    const given = Buffer.from(hashOtp(otp), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return given.length === stored.length && crypto.timingSafeEqual(given, stored);
};

module.exports = { OTP_EXPIRES_IN_MS, OTP_MAX_ATTEMPTS, generateOtp, hashOtp, otpMatches };

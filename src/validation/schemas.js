const { z } = require('zod');
const validator = require('validator');


const GENDERS = ["male", "female", "others"];

const objectId = (message) => z.string().regex(/^[0-9a-fA-F]{24}$/, { error: message });

const email = (message) => z.string({ error: message }).trim().toLowerCase().pipe(z.email({ error: message }));

const strongPassword = z.string({ error: "Password is required" }).refine(
    (value) => validator.isStrongPassword(value),
    { error: "Password must be at least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol" }
);

const name = (label) => z.string({ error: `${label} is required` }).trim()
    .min(4, { error: `${label} must be at least 4 characters` })
    .max(30, { error: `${label} must be at most 30 characters` });

const ageField = z.preprocess(
    (value) => (value === "" || value === null ? null : typeof value === "string" ? Number(value) : value),
    z.number({ error: "Age must be a number" }).int({ error: "Age must be a whole number" })
        .min(18, { error: "Age must be between 18 and 70" }).max(70, { error: "Age must be between 18 and 70" })
        .nullable()
);

const numericString = (min, max, message) => z.string({ error: message }).trim().refine(
    (value) => value !== "" && !Number.isNaN(Number(value)) && Number(value) >= min && Number(value) <= max,
    { error: message }
);



const signupBody = z.strictObject({
    firstName: name("First name"),
    lastName: name("Last name"),
    email: email("Please enter a valid email"),
    password: strongPassword,
    gender: z.enum(GENDERS, { error: "Gender must be male, female or others" }),
});


const loginBody = z.strictObject({
    email: email("Invalid Credentials"),
    password: z.string({ error: "Invalid Credentials" }).min(1, { error: "Invalid Credentials" }),
}, { error: "Invalid Credentials" });

const forgotPasswordBody = z.strictObject({
    email: email("Invalid email"),
});

const resetPasswordBody = z.strictObject({
    email: email("Invalid User"),
    OTP: z.string({ error: "OTP is Incorrect" }).regex(/^\d{6}$/, { error: "OTP is Incorrect" }),
    newPassword: strongPassword,
    confirmPassword: z.string({ error: "Please confirm your password" }),
});



const editProfileBody = z.strictObject({
    firstName: name("First name").optional(),
    lastName: name("Last name").optional(),
    age: ageField.optional(),
    photoUrl: z.url({ protocol: /^https?$/, error: "Photo URL must be a valid http(s) link" }).optional(),
    skills: z.array(
        z.string({ error: "Each skill must be text" }).trim().min(1, { error: "Skills can't be empty" }).max(30, { error: "Each skill must be at most 30 characters" }),
        { error: "Skills must be a list" }
    ).max(10, { error: "Skills cannot be greater than 10" }).optional(),
    about: z.string({ error: "About must be text" }).trim().max(300, { error: "About must be at most 300 characters" }).optional(),
});

const preferenceAge = z.number({ error: "Age range must be numbers" }).int({ error: "Age range must be whole numbers" })
    .min(18, { error: "Age range must be between 18 and 70" }).max(70, { error: "Age range must be between 18 and 70" });

const preferencesBody = z.strictObject({
    genderPreference: z.array(z.enum(GENDERS, { error: "Gender must be male, female or others" }), { error: "Gender preference must be a list" }).optional(),
    minAge: preferenceAge.optional(),
    maxAge: preferenceAge.optional(),
    maxDistance: z.number({ error: "Max distance must be a number" })
        .positive({ error: "Max distance must be more than 0 km" }).max(1000, { error: "Max distance can be at most 1000 km" }).optional(),
}).refine(
    (body) => body.minAge === undefined || body.maxAge === undefined || body.minAge <= body.maxAge,
    { error: "MinAge cannot be greater then MaxAge" }
);



const locationBody = z.strictObject({
    location: z.strictObject({
        type: z.literal("Point").optional(),
        coordinates: z.tuple([
            z.number({ error: "Longitude must be a number" }).min(-180, { error: "Longitude must be between -180 and 180" }).max(180, { error: "Longitude must be between -180 and 180" }),
            z.number({ error: "Latitude must be a number" }).min(-90, { error: "Latitude must be between -90 and 90" }).max(90, { error: "Latitude must be between -90 and 90" }),
        ], { error: "Coordinates must be [longitude, latitude]" }),
    }, { error: "Location is required" }),
    locationLabel: z.string({ error: "Location label must be text" }).trim().max(200, { error: "Location label is too long" }).optional(),
    locationAutoSync: z.boolean({ error: "locationAutoSync must be true or false" }).optional(),
});

const locationSearchQuery = z.object({
    q: z.string({ error: "Search query is required" }).trim()
        .min(1, { error: "Search query is required" }).max(200, { error: "Search query is too long" }),
});

const locationReverseQuery = z.object({
    lat: numericString(-90, 90, "lat and lon are required (lat between -90 and 90)"),
    lon: numericString(-180, 180, "lat and lon are required (lon between -180 and 180)"),
});


const sendRequestParams = z.object({
    status: z.enum(["interested", "ignored"], { error: "Invalid request" }),
    toUserId: objectId("Requested user is invalid"),
});

const reviewRequestParams = z.object({
    status: z.enum(["accepted", "rejected"], { error: "Invalid request" }),
    requestId: objectId("Connection Request not found"),
});

const mutualConnectionsParams = z.object({
    candidateId: objectId("Invalid candidateID"),
});

const feedQuery = z.object({
    page: numericString(1, 100000, "page must be a number of at least 1").optional(),
    limit: numericString(1, 50, "limit must be a number between 1 and 50").optional(),
});

module.exports = {
    signupBody,
    loginBody,
    forgotPasswordBody,
    resetPasswordBody,
    editProfileBody,
    preferencesBody,
    locationBody,
    locationSearchQuery,
    locationReverseQuery,
    sendRequestParams,
    reviewRequestParams,
    mutualConnectionsParams,
    feedQuery,
};

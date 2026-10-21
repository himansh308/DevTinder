require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { faker } = require('@faker-js/faker');
const User = require('../src/models/users');
const { connectionRequestModel } = require('../src/models/connectionRequest');

const TEST_PASSWORD = "Test1234@#$";
const DEFAULT_PHOTO = "https://cdn-icons-png.flaticon.com/512/6522/6522516.png";
const DEFAULT_SKILLS = ["TypeScript", "JavaScript"];

const point = (lon, lat) => ({ type: "Point", coordinates: [lon, lat] });

const FIXED_USERS = [
    {
        firstName: "elon", lastName: "musk", email: "you@test.com", gender: "male", age: 53,
        skills: DEFAULT_SKILLS,
        photoUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/Elon_Musk_-_54820081119_%28cropped%29.jpg/1280px-Elon_Musk_-_54820081119_%28cropped%29.jpg",
        about: "Backend dev who loves Node and long drives.",
        genderPreference: ["female", "others"], minAge: 18, maxAge: 50, maxDistance: 50,
        location: point(76.85221839916835, 30.7235527444648), locationLabel: "Panchkula, Haryana",
        locationAutoSync: true,
    },
    { firstName: "Alice",  lastName: "Sharma",   email: "alice@test.com", gender: "female", age: 24, location: point(77.6, 12.98) },
    { firstName: "Carol",  lastName: "Mehta",    email: "carol@test.com", gender: "female", age: 26, location: point(77.62, 12.99) },
    { firstName: "Emma",   lastName: "Nair",     email: "emma@test.com",  gender: "female", age: 22, location: point(77.59, 12.97) },
    { firstName: "Frank",  lastName: "Iyer",     email: "frank@test.com", gender: "others", age: 30, location: point(77.61, 12.98) },
    { firstName: "Grace",  lastName: "Kapoor",   email: "grace@test.com", gender: "female", age: 45, location: point(77.6, 12.96) },
    { firstName: "Henry",  lastName: "Singh",    email: "henry@test.com", gender: "male",   age: 27, location: point(77.1, 28.7) },
    { firstName: "Isla",   lastName: "Reddy",    email: "isla@test.com",  gender: "female", age: 25, location: point(77.57, 12.95) },
    { firstName: "Jack",   lastName: "Malhotra", email: "jack@test.com",  gender: "male",   age: 29, location: point(80.27, 13.08) },
    { firstName: "Robert", lastName: "Verma",    email: "bob@test.com",   gender: "male",   age: 28, location: point(77.58, 12.96) },
    { firstName: "David",  lastName: "Raoul",    email: "david@test.com", gender: "male",   age: 35, location: point(72.8777, 19.076) },
    { firstName: "spider", lastName: "mann",     email: "spider@gmail.com", gender: "male" },
];


const FIXED_CONNECTIONS = [
    { from: "you@test.com",   to: "alice@test.com", status: "accepted" },
    { from: "carol@test.com", to: "you@test.com",   status: "accepted" },
    { from: "alice@test.com", to: "carol@test.com", status: "accepted" },
    { from: "emma@test.com",  to: "alice@test.com", status: "accepted" },
    { from: "grace@test.com", to: "alice@test.com", status: "accepted" },
    { from: "you@test.com",   to: "emma@test.com",  status: "interested" },
    { from: "you@test.com",   to: "frank@test.com", status: "ignored" },
    { from: "you@test.com",   to: "isla@test.com",  status: "interested" },
];


const SKILL_POOL = ["React", "Node.js", "MongoDB", "Express", "TypeScript", "JavaScript", "Python",
    "Go", "Java", "AWS", "Docker", "Kubernetes", "Redis", "GraphQL", "Next.js", "PostgreSQL", "Rust", "Flutter"];
const INTERESTS = ["long drives", "chai", "hackathons", "trekking", "board games", "open source",
    "cricket", "photography", "cooking", "late-night debugging", "music", "reading"];


function nameWithMinLength(generate) {
    let name = generate();
    while (name.length < 4 || name.length > 30) name = generate();
    return name;
}

function randomPointNear(lon, lat, radiusKm) {
    const distance = radiusKm * Math.sqrt(faker.number.float({ min: 0, max: 1 }));
    const angle = faker.number.float({ min: 0, max: 2 * Math.PI });
    const dLat = (distance * Math.cos(angle)) / 111;
    const dLon = (distance * Math.sin(angle)) / (111 * Math.cos((lat * Math.PI) / 180));
    return point(+(lon + dLon).toFixed(6), +(lat + dLat).toFixed(6));
}

function generateUsers(count, centre) {
    const users = [];
    for (let i = 1; i <= count; i++) {
        const gender = faker.helpers.weightedArrayElement([
            { weight: 45, value: "female" }, { weight: 45, value: "male" }, { weight: 10, value: "others" },
        ]);
        const sex = gender === "others" ? undefined : gender;
        const skills = faker.helpers.arrayElements(SKILL_POOL, { min: 2, max: 5 });
        const email = `dev${i}@test.com`;
        users.push({
            firstName: nameWithMinLength(() => faker.person.firstName(sex)),
            lastName: nameWithMinLength(() => faker.person.lastName()),
            email,
            gender,
            age: faker.number.int({ min: 18, max: 45 }),
            skills,
            about: `${skills[0]} developer who loves ${faker.helpers.arrayElements(INTERESTS, 2).join(" and ")}.`,
            photoUrl: `https://api.dicebear.com/9.x/avataaars/png?seed=${encodeURIComponent(email)}`,
            location: randomPointNear(centre[0], centre[1], 30),
            locationLabel: "Chandigarh Tricity",
        });
    }
    return users;
}


function generateConnections(fakeEmails) {
    const pairs = new Set();
    const result = [];
    const add = (from, to, status) => {
        if (from === to) return;
        const key = [from, to].sort().join("|");     // one request per pair, either direction
        if (pairs.has(key)) return;
        pairs.add(key);
        result.push({ from, to, status });
    };

    for (const email of fakeEmails) {
        const others = faker.helpers.arrayElements(fakeEmails, faker.number.int({ min: 0, max: 4 }));
        for (const other of others) {
            add(email, other, faker.helpers.weightedArrayElement([
                { weight: 60, value: "accepted" }, { weight: 25, value: "interested" }, { weight: 15, value: "ignored" },
            ]));
        }
    }
   
    for (const email of faker.helpers.arrayElements(fakeEmails, Math.min(15, fakeEmails.length))) {
        add(email, faker.helpers.arrayElement(["alice@test.com", "carol@test.com"]), "accepted");
    }
   
    for (const email of faker.helpers.arrayElements(fakeEmails, Math.min(5, fakeEmails.length))) {
        add(email, "you@test.com", "interested");
    }
    return result;
}

function parseFakeCount(argv) {
    const i = argv.indexOf("--fake");
    if (i === -1) return 0;
    const n = Number(argv[i + 1]);
    if (!Number.isInteger(n) || n < 1 || n > 10000) {
        throw new Error("--fake needs a whole number between 1 and 10000, e.g. --fake 200");
    }
    return n;
}

function assertLocalDatabase(uri) {
    if (!uri) throw new Error("MONGO_URI is not set in .env");
    const host = new URL(uri).hostname;
    if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
        throw new Error(`Refusing to seed "${host}" — this script wipes data and only runs on a local database`);
    }
}

function assertAtlasDatabase(uri) {
    if (!uri) throw new Error("MONGO_URI is not set in .env");
    const parsed = new URL(uri);
    if (parsed.protocol !== "mongodb+srv:" || ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
        throw new Error("--atlas requires a remote MongoDB Atlas URI using mongodb+srv");
    }
}

async function seedAtlasPreserving(fakeCount) {
    await Promise.all([User.init(), connectionRequestModel.init()]);

    const password = await bcrypt.hash(TEST_PASSWORD, 10);
    const youLocation = FIXED_USERS[0].location.coordinates;
    const fixed = FIXED_USERS.map((u) => ({
        skills: DEFAULT_SKILLS, photoUrl: DEFAULT_PHOTO, ...u, password,
    }));
    const fake = generateUsers(fakeCount, youLocation).map((u) => ({ ...u, password }));
    const seedUsers = [...fixed, ...fake];
    const emails = seedUsers.map((user) => user.email);

    const existingUsers = await User.find({ email: { $in: emails } }).select("email").lean();
    const existingEmails = new Set(existingUsers.map((user) => user.email));
    const missingUsers = seedUsers.filter((user) => !existingEmails.has(user.email));
    if (missingUsers.length) await User.insertMany(missingUsers);

    const users = await User.find({ email: { $in: emails } }).select("_id email").lean();
    const idByEmail = Object.fromEntries(users.map((user) => [user.email, user._id]));
    const connections = [...FIXED_CONNECTIONS, ...generateConnections(fake.map((user) => user.email))];
    const userIds = users.map((user) => user._id);
    const existingConnections = await connectionRequestModel.find({
        fromUserId: { $in: userIds },
        toUserId: { $in: userIds },
    }).select("fromUserId toUserId").lean();
    const pairKey = (from, to) => [String(from), String(to)].sort().join("|");
    const existingPairs = new Set(existingConnections.map((connection) =>
        pairKey(connection.fromUserId, connection.toUserId)));
    const missingConnections = connections
        .map((connection) => ({
            fromUserId: idByEmail[connection.from],
            toUserId: idByEmail[connection.to],
            status: connection.status,
        }))
        .filter((connection) => {
            const key = pairKey(connection.fromUserId, connection.toUserId);
            if (existingPairs.has(key)) return false;
            existingPairs.add(key);
            return true;
        });

    if (missingConnections.length) await connectionRequestModel.insertMany(missingConnections);
    console.log(
        `Seeded "${mongoose.connection.name}" without deleting data: ` +
        `${missingUsers.length} users added, ${existingUsers.length} existing users preserved; ` +
        `${missingConnections.length} connection requests added, ` +
        `${existingConnections.length} existing requests preserved.`,
    );
    console.log(`New accounts' password: ${TEST_PASSWORD}`);
}

async function seed() {
    const fakeCount = parseFakeCount(process.argv);
    const atlasMode = process.argv.includes("--atlas");
    if (atlasMode) assertAtlasDatabase(process.env.MONGO_URI);
    else assertLocalDatabase(process.env.MONGO_URI);
    faker.seed(42);                                     // same "random" developers on every run

    await mongoose.connect(process.env.MONGO_URI);
    if (atlasMode) {
        await seedAtlasPreserving(fakeCount);
        await mongoose.disconnect();
        return;
    }

    await Promise.all([User.init(), connectionRequestModel.init()]);   // build indexes on a fresh DB
    await connectionRequestModel.deleteMany({});
    await User.deleteMany({});

    const password = await bcrypt.hash(TEST_PASSWORD, 10);   // hash once, reuse for everyone
    const youLocation = FIXED_USERS[0].location.coordinates;

    const fixed = FIXED_USERS.map((u) => ({
        skills: DEFAULT_SKILLS, photoUrl: DEFAULT_PHOTO, ...u, password,
    }));
    const fake = generateUsers(fakeCount, youLocation).map((u) => ({ ...u, password }));
    const created = await User.insertMany([...fixed, ...fake]);   // insertMany still runs schema validation

    const idByEmail = Object.fromEntries(created.map((u) => [u.email, u._id]));
    const connections = [...FIXED_CONNECTIONS, ...generateConnections(fake.map((u) => u.email))];
    await connectionRequestModel.insertMany(connections.map((c) => ({
        fromUserId: idByEmail[c.from], toUserId: idByEmail[c.to], status: c.status,
    })));

    const dbName = mongoose.connection.name;
    console.log(`Seeded "${dbName}": ${fixed.length} fixed + ${fake.length} generated users, ${connections.length} connection requests.`);
    console.log(`Every account's password: ${TEST_PASSWORD}`);
    await mongoose.disconnect();
}

seed().catch(async (err) => {
    console.error("Seed failed:", err.message);
    await mongoose.disconnect();
    process.exit(1);
});

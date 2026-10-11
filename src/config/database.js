
const mongoose = require('mongoose');

const connectDB = async() =>{
    const mongoUri = process.env.MONGO_URI;

    if(!mongoUri){
        throw new Error("MONGO_URI is not set in .env");
    }

    try{
        await mongoose.connect(mongoUri);
        console.log('mongoDb connected');
    }
    catch(err){
        console.log(err);
        // rethrow so index.js doesn't start the server without a database
        throw err;
    }
}

module.exports = connectDB;

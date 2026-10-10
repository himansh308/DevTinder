require('dotenv').config();
const express = require('express');
const connectDB = require('./config/database');
const app = express();
const cookieParser =require('cookie-parser');
const {authRouter} = require('./routes/authRouter.js');
const {profileRouter} = require('./routes/profile.js');
const {requestRouter} = require('./routes/request.js');
const {userRouter} = require('./routes/userRouter.js');
const cors = require('cors');

app.use(cors({
    origin:"http://localhost:5173",
    credentials:true
}))
app.use(express.json());
app.use(cookieParser());
app.use('/' , authRouter);
app.use('/' , profileRouter);
app.use('/' , requestRouter);
app.use('/' , userRouter);






connectDB()
.then(()=>{
    console.log("database connected successfully")
    app.listen(7777, ()=>{
    console.log("Server is running on port 7777");})  
})
.catch((err)=>{
    console.log("cannot connect to database");
    // console.log(err);
})


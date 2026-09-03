const express = require('express');
const connectDB = require('./config/database');
const User = require('./models/users');
const app = express();
const bcrypt = require('bcrypt');
const cookieParser =require('cookie-parser');
const jwt = require('jsonwebtoken');
const {userAuth} = require('./middlewares/auth.js');
const {authRouter} = require('./routes/authRouter.js');
const {isSignupValidated} = require('./utils/validation');
const {profileRouter} = require('./routes/profile.js');
const {requestRouter} = require('./routes/request.js');
const {userRouter} = require('./routes/userRouter.js');

app.use(express.json());
app.use(cookieParser());
app.use('/' , authRouter);
app.use('/' , profileRouter);
app.use('/' , requestRouter);
app.use('/' , userRouter);






app.get('/user', userAuth, async(req,res)=>{
    const userEmail = req.body.email;

    try{
        const user = await User.find({email:userEmail});

        if(user.length===0){
            res.status(404).send("User not Found");
        }
        else{
             res.send(user);
        }
        
       
    }
    catch(err){
        res.status(400).send("Something went wrong");
    }
})

app.get('/feed',async(req,res)=>{
    try{
        const user = await User.find({});
        res.send(user);
    }
    catch(err){
        res.status(404).send("something went wrong");
    }
})







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


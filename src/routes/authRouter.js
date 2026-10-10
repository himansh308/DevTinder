const express = require('express');
const authRouter = express.Router();
const bcrypt = require("bcrypt");
const JWT = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const {isSignupValidated} = require('../utils/validation.js');
const User = require('../models/users.js');



authRouter.post('/signup', async(req,res)=>{
    try{
        isSignupValidated(req);

        const {firstName,lastName, email , password, gender} = req.body;
        const hashpassword = await bcrypt.hash(password,10);
        const user = new User({firstName,lastName, email , password:hashpassword ,gender});


        const signedUpUser = await user.save();
        
        const token = await signedUpUser.getJWT();
        res.cookie("token" , token);

        res.status(200).json({
            data:signedUpUser,
            message: "User signed up  successfully"
        })


        
    }
    catch(err){
        console.log(err);
        res.status(400).send("User addition failed");
    }
   
})

authRouter.post('/login', async(req,res)=>{

    try{const {email, password} = req.body;

        // req.body can hold objects like {"$regex": "..."} — only plain strings may reach the query
        if(typeof email !== "string" || typeof password !== "string"){
            throw new Error("Invalid Credentials");
        }

        const isUserExist = await User.findOne({email});

        if(!isUserExist){
            throw new Error("Invalid Credentials");
        }
        else{
            // const hashpassword = isUserExist.password;
            const isUserCredentialValid = await isUserExist.validatePassword(password);
            
            if(!isUserCredentialValid){
                throw new Error("Please enter a valid password");
            }
            else{
                const token = await isUserExist.getJWT();
                res.cookie("token",token);
                res.status(200).json({
                    data:isUserExist,
                    message:"User Logged In Successfully"
                });
            }
        }
    }
    catch(err){
        res.status(404).send(err.message);
    }
   
})

authRouter.post('/logout' , async(req,res)=>{
    res.cookie("token",null , { expires: new Date(Date.now())});
    res.send("User logout successfully");

})

authRouter.post('/forgotPassword' , async(req,res)=>{
    const {email} = req.body;
    
    try{
        if(typeof email !== "string"){
            throw new Error("Invalid email");
        }

        const isUserValid = await User.findOne({email});
        if(!isUserValid){
            throw new Error("Invalid email");
        }
        else{
            isUserValid.resetOtp = String(Math.floor(Math.random() * 900000)+100000);
            isUserValid.resetOtpExpiry = new Date(Date.now() + 5 * 60 * 1000);
    
            await isUserValid.save();
            console.log(`OTP for ${email}: ${isUserValid.resetOtp}`);
            res.send("OTP generated successfully");
        }
    }
    catch(err){
        res.status(404).send(err.message);
    }
})

authRouter.post('/resetPassword' , async(req,res)=>{
    try{
        const {email , OTP , newPassword , confirmPassword } = req.body;

        if(typeof email !== "string"){
            throw new Error("Invalid User");
        }

        const isUserValid = await User.findOne({email});
        if(!isUserValid){
            throw new Error("Invalid User");

        }
        else{
            if(isUserValid.resetOtp === OTP){

                if(isUserValid.resetOtpExpiry > Date.now()){
                    
                    if(newPassword === confirmPassword){
                        const passwordHash  = await bcrypt.hash(confirmPassword,10);
                        isUserValid.password=passwordHash;

                        isUserValid.resetOtp = null;
                        isUserValid.resetOtpExpiry = null;
                        await isUserValid.save();

                        res.send("Password Updated successfully");
                    }
                    else{
                        throw new Error("Password doesn't match");
                    }
                }
                else{
                    throw new Error("Time Limit exceeded");
                }
            }
            else{
                throw new Error("OTP is Incorrect");
            }
        }
    }
    catch(err){
        res.status(404).send(err.message);
    }
})

module.exports ={
    authRouter,
}
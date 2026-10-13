const express = require('express');
const authRouter = express.Router();
const bcrypt = require("bcrypt");
const User = require('../models/users.js');
const { validate } = require('../middlewares/validate');
const { signupBody, loginBody, forgotPasswordBody, resetPasswordBody } = require('../validation/schemas');
const { OTP_EXPIRES_IN_MS, OTP_MAX_ATTEMPTS, generateOtp, hashOtp, otpMatches } = require('../utils/otp');



authRouter.post('/signup', validate({ body: signupBody }), async(req,res)=>{
    try{
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

authRouter.post('/login', validate({ body: loginBody }), async(req,res)=>{

    try{const {email, password} = req.body;

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

authRouter.post('/forgotPassword' , validate({ body: forgotPasswordBody }), async(req,res)=>{
    const {email} = req.body;

    try{
        const isUserValid = await User.findOne({email});
        if(!isUserValid){
            throw new Error("Invalid email");
        }
        else{
            const otp = generateOtp();
            isUserValid.resetOtp = hashOtp(otp);         
            isUserValid.resetOtpExpiry = new Date(Date.now() + OTP_EXPIRES_IN_MS);
            isUserValid.resetOtpAttempts = 0;

            await isUserValid.save();
            console.log(`OTP for ${email}: ${otp}`);      
            res.send("OTP generated successfully");
        }
    }
    catch(err){
        res.status(404).send(err.message);
    }
})

authRouter.post('/resetPassword' , validate({ body: resetPasswordBody }), async(req,res)=>{
    try{
        const {email , OTP , newPassword , confirmPassword } = req.body;

        const user = await User.findOneAndUpdate(
            { email, resetOtp: { $ne: null } },
            { $inc: { resetOtpAttempts: 1 } },
            { returnDocument: 'after' }
        );

        if(!user){
            throw new Error("OTP is Incorrect");
        }

        const clearOtp = async () => {
            user.resetOtp = null;
            user.resetOtpExpiry = null;
            user.resetOtpAttempts = 0;
            await user.save();
        };

        if(user.resetOtpAttempts > OTP_MAX_ATTEMPTS){
            await clearOtp();
            throw new Error("Too many wrong attempts. Please request a new OTP");
        }

        if(user.resetOtpExpiry <= Date.now()){
            await clearOtp();
            throw new Error("Time Limit exceeded");
        }

        if(!otpMatches(OTP, user.resetOtp)){
            if(user.resetOtpAttempts >= OTP_MAX_ATTEMPTS){
                await clearOtp();
                throw new Error("Too many wrong attempts. Please request a new OTP");
            }
            throw new Error("OTP is Incorrect");
        }

        if(newPassword !== confirmPassword){
            throw new Error("Password doesn't match");
        }

        user.password = await bcrypt.hash(newPassword,10);
        await clearOtp();

        res.send("Password Updated successfully");
    }
    catch(err){
        res.status(404).send(err.message);
    }
})

module.exports ={
    authRouter,
}
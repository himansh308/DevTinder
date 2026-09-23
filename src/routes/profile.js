const express = require('express');
const profileRouter = express.Router();
const {userAuth} = require('../middlewares/auth');
const User = require('../models/users');
const{validateEditProfileDate, validateProfilePreference} = require('../utils/validation');


profileRouter.post('/profile/view' ,userAuth, async(req,res)=>{

    try{
        const user = req.user;
        res.status(200).json({
            data:user,
            message:"User fetch Successfully"
        });
            
    }
    catch(err){
        res.status(404).send("Error : "+err.message);
    }



})

profileRouter.patch('/profile/edit', userAuth , async(req,res)=>{
    
    try{
       
        validateEditProfileDate(req);
        const loggedInUser = req.user;
        Object.keys(req.body).forEach((key)=>{
            loggedInUser[key] = req.body[key];
        })
        // console.log(user);
        await loggedInUser.save();
        res.status(200).json({
            data:loggedInUser,
            message:"User updated successfully"
        });
    }
    catch(err){
        console.log(err);
        res.status(404).send( err.message);
    }
})

// profileRouter.patch('/update', userAuth, async(req,res)=>{
//     const userId = req.user._id;
//     const data = req.body;
//     try{
//         const Allowed_Updates = ["skills","photoUrl","age","password"];

//         const isUpdatesAllowed = Object.keys(data).every((k)=>{
//             return Allowed_Updates.includes(k);
//         })

//         if(!isUpdatesAllowed){
//             throw new Error("Update not allowed");
//         }
//         if(data?.skills?.length>10){
//             throw new Error("Skills cannot be greater than 10");
//         }

//         const user = await User.findByIdAndUpdate(userId, data, {runValidators:true});
//         console.log(user);
//         res.send("User updated successfully");
//     }
//     catch(err){
//         console.log(err);
//         res.status(404).send(err.message);
//     }
// })
profileRouter.patch('/profile/preferences' , userAuth , async(req , res) =>{
    try{
        validateProfilePreference(req);

        const loggedInUser = req.user;
        Object.keys(req.body).forEach((key)=>{
            loggedInUser[key] = req.body[key];
        })

        await loggedInUser.save();
        res.status(200).send(loggedInUser);
    }
    catch(err){
        res.status(400).send(err.message);
    }
})
profileRouter.delete('/delete', userAuth, async(req,res)=>{
    const userId = req.user._id;

    try{
        const user = await User.findByIdAndDelete({_id:userId});
        res.send("User delete successFully");
    }
    catch(err){
        console.log(err);
        res.status(404).send("User doesn't Exist");
    }
    



})





module.exports={
    profileRouter
}
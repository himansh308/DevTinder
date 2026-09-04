const express = require('express');

const userRouter = express.Router();
const {userAuth} = require('../middlewares/auth');
const {connectionRequestModel} = require('../models/connectionRequest');
const User = require('../models/users');
const { validateLocation } = require('../utils/validation');
const USER_SAFE_DATE =["firstName" ,"lastName" ,"skills" ,"photoUrl"]

userRouter.get('/user/requests/received' , userAuth , async(req,res)=>{
   

    try{
        const loggedInUser = req.user;
        const AllConnectionRequests = await connectionRequestModel.find({
            toUserId:loggedInUser._id,
            status:"interested"
        }).populate("fromUserId" ,USER_SAFE_DATE )

        if(AllConnectionRequests.length===0){
            throw new Error("No Pending Request");
        }

        res.status(200).json({
            message:"Data fetched sucessfully",
            data:AllConnectionRequests
        })
    }
    catch(err){
        res.status(400).send(err.message);
    }
})

userRouter.get('/user/connections' , userAuth, async(req,res)=>{

    try{
        const loggedInUser = req.user;

        const AllConnectionRequests = await connectionRequestModel.find({

            $or:[
                {fromUserId:loggedInUser._id , status:"accepted"},
                {toUserId:loggedInUser._id, status:"accepted"}
            ]
        }).populate("fromUserId" , USER_SAFE_DATE)
        .populate("toUserId" , USER_SAFE_DATE)

        if(AllConnectionRequests.length === 0){
            throw new Error ("No pending request")
        }

        const data = AllConnectionRequests.map((row)=>{
            if(row.fromUserId._id.toString() === loggedInUser._id.toString()){
                return row.toUserId;
            }
            return row.fromUserId;
        })

        res.status(200).json({
            message:"these are your all connections",
            data:data
        })
    }
    catch(err){
        res.status(400).send(err.message);
    }
})

userRouter.patch('/user/location' , userAuth , async(req,res)=>{
    try{
        const loggedInUser = req.user;

        validateLocation(req);
        
        Object.keys(req.body).forEach((key)=>{
            loggedInUser[key] = req.body[key];
        })

        loggedInUser.location.type = "Point";

        await loggedInUser.save();

        res.status(200).send(loggedInUser);
    }
    catch(err){
        res.status(400).send(err.message);
    }
})

userRouter.get('/feed' , userAuth, async(req,res)=>{

    try{
        
        const loggedInUser = req.user;
        const page = parseInt(req.query.page) || 1;
        let PageLimit = parseInt(req.query.limit) || 10;
        

        if(PageLimit>50){
            PageLimit=50;
        }

        const noOfPageToBeSkiped = (page-1)*PageLimit;

        const existingConnectionRequests = await connectionRequestModel.find({
            $or:[
                {fromUserId:loggedInUser._id},
                {toUserId:loggedInUser._id}
            ]
        }).select("fromUserId toUserId")

        const hideExistingData = new Set();

        existingConnectionRequests.forEach((reqt)=>{
            hideExistingData.add(reqt.fromUserId.toString());
            hideExistingData.add(reqt.toUserId.toString());
        })

        // const feedData = await User.find({
        //     $and:[
        //         {_id:{$nin:Array.from(hideExistingData)}},
        //         {_id:{$ne:loggedInUser._id}}
        //     ]
        // })

        const feedFilter = [
            {_id:{$nin:Array.from(hideExistingData)}},
            {_id:{$ne:loggedInUser._id}}
        ]

        if(loggedInUser?.genderPreference != undefined && loggedInUser?.genderPreference?.length !=0){
            feedFilter.push(
                {gender:{$in:loggedInUser.genderPreference}},
            )
        }
        if(loggedInUser.minAge && loggedInUser.maxAge){
            feedFilter.push(
                {age:{$gte:loggedInUser.minAge , $lte:loggedInUser.maxAge}},
                
            )
        }

       if(loggedInUser.location && loggedInUser.maxDistance){
        const loggedInUserLocationCoordinates = loggedInUser.location.coordinates;
        const loggedInUserMaxPreferencedDistance = loggedInUser.maxDistance *1000;
            feedFilter.push({
                location: {
                    $near: {
                        $geometry: { type: "Point", coordinates:loggedInUserLocationCoordinates},
                        $maxDistance: loggedInUserMaxPreferencedDistance
                    }
                }
            })
        }

        const feedData = await User.find({
            $and:feedFilter
        })
        .select(USER_SAFE_DATE)
        .skip(noOfPageToBeSkiped)
        .limit(PageLimit)

        res.status(200).json({
            message:"Your Feed",
            data:feedData
        });
    }
    catch(err){
        res.status(400).send(err.message);
    }
})


















module.exports ={
    userRouter,
}
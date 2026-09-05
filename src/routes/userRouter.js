const express = require('express');

const userRouter = express.Router();
const {userAuth} = require('../middlewares/auth');
const {connectionRequestModel} = require('../models/connectionRequest');
const User = require('../models/users');
const { validateLocation, validateMutualConnectionCandidateId } = require('../utils/validation');
const { getConnectionIds } = require('../utils/connections');
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

userRouter.get('/user/mutual-connections/:candidateId' , userAuth , async(req,res)=>{
    try{
        const loggedInUser = req.user;
        const candidateId = req.params.candidateId;
        await validateMutualConnectionCandidateId(candidateId);
        
        const allConnectionsForUser1 = await getConnectionIds(loggedInUser._id);
        const allConnectionForUser2 =  await getConnectionIds(candidateId);

        const mutualIds =[...allConnectionsForUser1].filter((Id)=>{
            return allConnectionForUser2.has(Id);
        })

        const AllMutualConnectionsDetails = await User.find({ 
            _id : { $in : mutualIds}
        }).select(USER_SAFE_DATE);

        res.status(200).send(AllMutualConnectionsDetails);
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
        .lean()
        /* --------><-------mutual connectionsCount logic below----------><---------- */

        const myConnectionsSet = await getConnectionIds(loggedInUser._id); /*[ayush,Up] */

        const allCandidateIds = feedData.map((candidate)=>{
            return candidate._id.toString();    // [Alice, emmaa, pooja, nehaa, Himanshu] feed data eg 
        })


        const allRelevantCandidatesIdsConnections = await connectionRequestModel.find({
            status:"accepted",
            $or:[
                {fromUserId:{$in:allCandidateIds}},
                {toUserId:{$in:allCandidateIds}}
            ]
        })


        // [
        // { _id: "R1", fromUserId: "ALICE_ID", toUserId: "EMMA_ID",  status: "accepted" },
        // { _id: "R2", fromUserId: "ALICE_ID", toUserId: "CAROL_ID", status: "accepted" },
        // { _id: "R3", fromUserId: "EMMA_ID",  toUserId: "ISLA_ID",  status: "accepted" },
        // { _id: "R4", fromUserId: "POOJA_ID", toUserId: "NEHA_ID",  status: "accepted" },
        // { _id: "R5", fromUserId: "POOJA_ID", toUserId: "FRANK_ID", status: "accepted" },
        // { _id: "R6", fromUserId: "NEHA_ID",  toUserId: "Himanshu_ID",   status: "accepted" },
        // { _id: "R7", fromUserId: "Himanshu_ID",  toUserId: "FRANK_ID",   status: "accepted" }
        // ]


       

        const allConnectionsOfCandidateIdsMap = new Map();
        
        for(const Id of allCandidateIds){
            allConnectionsOfCandidateIdsMap.set(Id , new Set());
        }


        allRelevantCandidatesIdsConnections.forEach((row)=>{
            if(allCandidateIds.includes(row.fromUserId.toString())){
                allConnectionsOfCandidateIdsMap.get(row.fromUserId.toString()).add(row.toUserId.toString())
            }

            if(allCandidateIds.includes(row.toUserId.toString())){
                allConnectionsOfCandidateIdsMap.get(row.toUserId.toString()).add(row.fromUserId.toString())
            }
        })

        // Alice---> emmaa , carol, himanshu
        // emma -->>alice ,islaa
        // pooja--> neha, frank
        // neha-->pooja , himanshu
        // himanshu --> neha, frank, alice. --> myConnectionsSet <---
        

        feedData.forEach((candidate)=>{
            const theirConnections = allConnectionsOfCandidateIdsMap.get(candidate._id.toString());

            candidate.mutualConnectionsCount = [...myConnectionsSet].filter((Id)=>{
                return theirConnections.has(Id);
            }).length
        })
        

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
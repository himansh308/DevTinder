const express = require('express');
const { userAuth } = require('../middlewares/auth');
const requestRouter = express.Router();
const {connectionRequestModel} = require('../models/connectionRequest');
const User = require('../models/users');
const { validate } = require('../middlewares/validate');
const { sendRequestParams, reviewRequestParams } = require('../validation/schemas');



requestRouter.post('/request/send/:status/:toUserId',userAuth , validate({ params: sendRequestParams }), async(req,res)=>{

    try{
        const fromUserId = req.user._id;
        const status = req.params.status;
        const toUserId = req.params.toUserId;

        const isToUserExists = await User.findById(toUserId);

        if(!isToUserExists){
            throw new Error("Requested user is invalid");
        }

        const isConnectionAlreadyExisted = await connectionRequestModel.findOne({
            $or:[
                // { fromUserId: fromUserId, toUserId: toUserId }
                { fromUserId , toUserId},   /* --- work same as above */
                {fromUserId:toUserId , toUserId:fromUserId}

                // First condition: { fromUserId: A, toUserId: B } — "does a request already exist going this exact direction — from A to B?"
                // - Second condition: { fromUserId: toUserId, toUserId: fromUserId } — this is the clever bit. It's using the values of your variables, 
                // but swapping which field they go into: fromUserId: B, toUserId: A. That's asking "does a request already exist going the opposite direction — from B to A?"
            ]
        })

        if(isConnectionAlreadyExisted){
            throw new Error("connection request already existed");
        }


        const connectionRequest = new connectionRequestModel({
            fromUserId,
            toUserId,
            status
        })

        const connectionRequestData = await connectionRequest.save();

        res.status(200).send({
            message: `${req.user.firstName} has showed ${status} in ${isToUserExists.firstName}`,
            connectionRequestData
        })

    }
    catch(err){
        res.status(404).send(err.message);
    }
})

requestRouter.post('/request/review/:status/:requestId' , userAuth , validate({ params: reviewRequestParams }), async(req, res)=>{

    try{
        const loggedInUser = req.user;
        const{status , requestId } = req.params;

        const connectionRequest = await connectionRequestModel.findOne({
            _id:requestId,
            toUserId:loggedInUser._id,
            status:"interested"
        })

        if(!connectionRequest){
            throw new Error("Connection Request not found");
        }

        connectionRequest.status = status;

        const data = await connectionRequest.save();

        res.status(200).send({
            message: `${loggedInUser.firstName} has ${status} the request.`,
        })
    }
    catch(err){
        res.status(400).send(err.message);
    }
})

module.exports ={
    requestRouter,
}
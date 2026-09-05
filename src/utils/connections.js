
const { connectionRequestModel } = require('../models/connectionRequest');



const getConnectionIds = async(userId)=>{

    try{

        const AllConnectionRequests = await connectionRequestModel.find({
            $or:[
                {fromUserId:userId, status:"accepted"},
                {toUserId:userId, status:"accepted"}
            ]
        })

        const dataSet = new Set();

        AllConnectionRequests.forEach((row)=>{
            if(row.fromUserId.toString() === userId.toString()){
                dataSet.add(row.toUserId.toString());
            }
            else{
                dataSet.add(row.fromUserId.toString());
            }
        })
        
        return dataSet;
        

    }
    catch(err){
        throw new Error(err.message);
    }
}



module.exports={
    getConnectionIds
}
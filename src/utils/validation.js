const mongoose = require('mongoose');
const User = require('../models/users');

const validateMutualConnectionCandidateId = async(candidateId)=>{
    if(!mongoose.Types.ObjectId.isValid(candidateId)){
        throw new Error("Invalid candidateID");
    }

    const isCandidateIdUserExists = await User.findById(candidateId);
    if(!isCandidateIdUserExists){
        throw new Error("Invalid User");
    }
}


module.exports={
    validateMutualConnectionCandidateId
}

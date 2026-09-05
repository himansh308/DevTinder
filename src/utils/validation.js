const mongoose = require('mongoose');
const validator = require('validator');
const User = require('../models/users');


const isSignupValidated = (req)=>{

    const {firstName, lastName, email , password } = req.body;

    if(!firstName || !lastName){
        throw new Error("Please enter a valid name");
    }
    if(!email || !validator.isEmail(email)){
        throw new Error("Error :" + email);
    }
    if(!password || !validator.isStrongPassword(password)){
        throw new Error("Please enter a Strong password" );
    }
}

const validateEditProfileDate =(req)=>{
    const Allowed_Edits =["skills","photoUrl","age","password"];

    const isEditAllowed = Object.keys(req.body).every((feild)=>{
        return Allowed_Edits.includes(feild);
    })

    if(!isEditAllowed){
        throw new Error("Invalid edit request")
    }

    if(req.body?.skills?.length>10){
        throw new Error("Skills cannot be greater than 10");
    }

    return isEditAllowed;

}

const validateProfilePreference = (req)=>{
    const Allowed_Edits = ["minAge" ,"maxAge" , "genderPreference","maxDistance"];

    const isEditAllowed = Object.keys(req.body).every((value)=>{
        return Allowed_Edits.includes(value);
    });

    if(!isEditAllowed){
        throw new Error("Invalid profile Preference edit Request")
    }


    if(req.body?.minAge != undefined && req.body?.maxAge != undefined){
        if(!(typeof req.body.minAge === "number" && typeof req.body.maxAge === "number")){
            throw new Error("Invalid Change Request");
        }
        if(req.body.minAge > req.body.maxAge)
            {
            throw new Error ("MinAge cannot be greater then MaxAge");
        }

    }
    
}

const validateLocation= (req) =>{
    const Allowed_Edits = ["location"];

    const isEditAllowed =Object.keys(req.body).every((key)=>{
        return Allowed_Edits.includes(key);
    })

    if(!isEditAllowed){
        throw new Error("Invalid request");
    }

    if(!req.body.location.coordinates || !Array.isArray(req.body.location.coordinates) || req.body.location.coordinates.length!==2){
        throw new Error("Invalid Request");
    }

}

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
    isSignupValidated,
    validateEditProfileDate,
    validateProfilePreference,
    validateLocation,
    validateMutualConnectionCandidateId
}
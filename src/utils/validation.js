const validator = require('validator');


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

module.exports={
    isSignupValidated,
    validateEditProfileDate
}
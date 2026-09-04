const jwt = require('jsonwebtoken');
const User = require('../models/users.js');

const userAuth = async (req,res,next)=>{
    try{
        const cookies = req.cookies;

        const {token} = cookies;
        if(!token){
            throw new Error("Token is not valid");
        }
        else{
            const decodedMessageObj = await jwt.verify(token,process.env.JWT_SECRET);

            const {_id} = decodedMessageObj;

            const user = await User.findById(_id);
            if(!user){
                throw new Error("User doesn't exist");
            }
            else{
                req.user = user;
                next();
            }
        }
    }
    catch(err){
        res.status(400).send(err.message);
    }
    
}

module.exports ={
    userAuth,
}
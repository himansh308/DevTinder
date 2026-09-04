const { type } = require("express/lib/response");
const mongoose = require("mongoose");
const validator = require('validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    firstName: {
        type:String,
        required:true,
        minLength: 4,
        maxLength: 30,
    },
    lastName: {
        type:String,
        required:true,
        minLength: 4,
        maxLength: 30,
    },
    email:{
        type:String,
        required:true,
        unique:true,
        lowercase:true,
        trim:true,
        validate(value){
            if(!validator.isEmail(value)){
                throw new Error("Invalid Email address" + value);
            }
        }

    },
    password:{
        type:String,
        required:true,
        validate(value){
            if(!validator.isStrongPassword(value)){
                throw new Error("Please enter a Strong password");
            }
        }
    },
    age:{
        type:Number,
        min:18,
        max:70
    },
    gender:{
        type:String,
        required:true,
        validate(value){
            if(!["male", "female", "others"].includes(value)){
                throw new Error("Gender is not valid" + value);
            }
        },
    },
    skills:{
        type:[String],
        default:["TypeScript","JavaScript"],
    },
    photoUrl:{
        type:String,
        validate(value){
            if(!validator.isURL(value)){
                throw new Error("PhotoUrl is not valid" + value);
            }
        },
        default:"https://www.google.com/imgres?q=profile%20photo%20icon&imgurl=https%3A%2F%2Fcdn-icons-png.flaticon.com%2F512%2F6522%2F6522516.png&imgrefurl=https%3A%2F%2Fwww.flaticon.com%2Ffree-icon%2Fprofile_6522516&docid=q5rFxFfbzJ30GM&tbnid=NXIkVC8YMssN9M&vet=12ahUKEwj93pX7nsyVAxWxd2wGHeTQL74QnPAOegUIwwEQAA..i&w=512&h=512&hcb=2&ved=2ahUKEwj93pX7nsyVAxWxd2wGHeTQL74QnPAOegUIwwEQAA",
    },
    resetOtp: {
        type: String,
    },
    resetOtpExpiry: {
        type: Date,
    },
    genderPreference:{
        type:[String],
        enum:{
            values:["male", "female", "others"],
            message:"Gender is not valid"
            
        }
    },
    minAge:{
        type:Number
    },
    maxAge:{
        type:Number
    },
    location:{
        type:{
            type:String,
            enum:["Point"],
        },
        coordinates:{
            type:[Number],
            validate(value){
                if(!((value[0] >= -180 && value[0] <= 180) && (value[1] >= -90 && value[1] <= 90))){
                    throw new Error("Invalid coordinates");
                }
            }
        }
    },
    maxDistance:{
        type:Number
    }
},
{
    timestamps:true,
},

);

userSchema.methods.getJWT = async function(){

    const user = this;

    const token = await jwt.sign({_id:user._id},"DevTinder@756@",{expiresIn:"1d"})
    return token;
}

userSchema.methods.validatePassword = async function(passwordInputByUser){
    const user = this;
    const hashpassword = user.password;

    const isPasswordValid = await bcrypt.compare(passwordInputByUser,hashpassword);

    return isPasswordValid;

}

userSchema.index({ location : "2dsphere" });

const User = mongoose.model("User", userSchema);


module.exports = User;
const mongoose = require('mongoose');



const connectionRequestSchema = new mongoose.Schema({

    fromUserId:{
        type: mongoose.Schema.Types.ObjectId,
        required:true,
        ref:"User"
    },
    toUserId:{
        type:mongoose.Schema.Types.ObjectId,
        required:true,
        ref:"User"
    },
    status:{
        type:String,
        enum:{
            values: ["ignored" , "accepted" , "interested" , "rejected"],
            message: `{VALUE} is incorrect status type`

        }
    }
},
{
    timestamps:true
}
);

connectionRequestSchema.pre("save" , function(){

    if(this.fromUserId.equals(this.toUserId)){
        throw new Error("You cannot sent the request to yourself");
    }

//     So there are two cases now:
// - If your .pre('save', ...) function is a plain synchronous function (like yours — just an if check, no await inside), it runs top-to-bottom and returns instantly. The moment it returns without throwing, Mongoose considers it "done" and moves on — no signal needed, because there was nothing to wait for.
// - If your function were async (or returned a Promise), Mongoose would await that promise, and only proceed once it resolved.
// Either way, throwing an error still works to stop things, because Mongoose wraps the call in a try/catch — if your function throws, Mongoose catches it and treats it as "this hook failed," rejecting the .save() call, same as before.
// So the old next() pattern existed because, historically, Mongoose (and Node callback conventions generally, predating widespread async/await) needed an explicit signal for "this async thing finished." Now that async functions and Promises are the standard way to represent "this will finish later," Mongoose can just check the return value itself instead of relying on you to call something.

    
})

const connectionRequestModel = mongoose.model("ConnectionRequest" , connectionRequestSchema);

module.exports={
    connectionRequestModel
}


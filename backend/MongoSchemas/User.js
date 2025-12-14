import mongoose from 'mongoose'; 


const UserSchema = new mongoose.Schema({

	name: {
		type: String, 
		required: true
	},
	age:  {
		type: Number, 
		max: 100,
		min: 10,
		required: true
	},
	foods : {
		type: String, 
		enum: ["nonveg", "egg", "veg"]
	}
});

export const UserModel = new mongoose.model('UserSchema', UserSchema); 
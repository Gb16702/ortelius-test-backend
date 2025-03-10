import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  credits: { type: Number, default: 100 },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.model("User", userSchema);

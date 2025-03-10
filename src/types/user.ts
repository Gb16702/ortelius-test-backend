import { Document } from "mongoose";

export interface User {
  _id: Document["_id"];
  username: string;
  email: string;
  password: string;
  credits: number;
  createdAt: Date;
}

export type UserDocument = User & Document;

export interface UserResponse {
  _id: string;
  username: string;
  credits: number;
  createdAt: Date;
}

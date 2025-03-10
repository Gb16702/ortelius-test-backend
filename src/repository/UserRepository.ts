import { User as UserModel } from "@models/userSchema";
import { User } from "@t/user";
import assert from "assert";

export class UserRepository {
  async findById(id: string): Promise<User> {
    const user = await UserModel.findById(id).select("-password");
    assert(user !== null, "User not found");
    return user;
  }

  async deductCredits(id: string, amount: number): Promise<User> {
    const user = await UserModel.findByIdAndUpdate(
      id,
      {
        $inc: {
          credits: -amount,
        },
      },
      { new: true }
    ).select("-password");

    assert(user !== null, `User with ID ${id} not found`);
    return user;
  }
}

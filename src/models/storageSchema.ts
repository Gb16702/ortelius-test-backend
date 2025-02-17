import mongoose, { Schema } from "mongoose";

const LocationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
      index: "2dsphere",
    },
    address: { type: String, required: true },
  },
  { _id: false }
);

const SpaceSchema = new Schema({
  name: {
    type: String,
    required: false,
    index: "text",
    trim: true,
  },
  space_in_square_m: {
    type: Number,
    required: false,
    default: 0,
    min: 0,
  },
  space_type: {
    type: String,
    required: true,
  },
  location: {
    type: LocationSchema,
    required: false,
  },
  certificates: {
    type: [String],
    default: [],
  },
  services: {
    type: [String],
    index: "text",
    default: [],
  },
});

export const Space = mongoose.model<any>("spaces", SpaceSchema);

export const StorageSpace = Space.discriminator<any>(
  "storage",
  new Schema({
    categories: {
      type: [String],
      index: "text",
      default: [],
    },
  })
);

const mongoose = require("mongoose");

const RestaurantUserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    name: String,
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    phone: String,
    role: {
      type: String,
      enum: ["owner", "manager", "staff"],
      default: "staff",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RestaurantUser", RestaurantUserSchema);

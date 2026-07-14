const mongoose = require("mongoose");

const CustomerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phone: String,
    address: String,
    passwordHash: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    favoriteRestaurants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Restaurant",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Customer", CustomerSchema);
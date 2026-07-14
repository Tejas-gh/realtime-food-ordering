const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      unique: true,
      default: () => "ORD-" + Date.now(),
    },
    customer: {
      name: String,
      phone: String,
      email: String,
      address: String,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    items: [
      {
        menuItem: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MenuItem",
        },
        quantity: Number,
        price: Number,
      },
    ],
    totalPrice: Number,
    status: {
      type: String,
      enum: ["pending", "confirmed", "preparing", "ready", "on-the-way", "delivered", "cancelled"],
      default: "pending",
    },
    deliveryTime: Date,
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", OrderSchema);

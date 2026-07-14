const mongoose = require("mongoose");

const ScheduledOrderSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
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
    scheduledFor: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "placed", "failed", "cancelled"],
      default: "pending",
    },
    placedOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    failureReason: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("ScheduledOrder", ScheduledOrderSchema);

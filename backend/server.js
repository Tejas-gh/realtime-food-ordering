const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const menuItems = require("./menu-data");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }, // tighten this to your real frontend URL in production
});

// ---------- Menu items ----------

// GET all menu items - the dashboard uses this to render the picker list
app.get("/api/menu/items", (req, res) => {
  res.json(menuItems);
});

// GET the item currently flagged as displayed - the customer app calls this
app.get("/api/menu/displayed", (req, res) => {
  const displayed = menuItems.find((item) => item.isDisplayed);
  res.json(displayed || null);
});

// POST mark one item as displayed, unmark all others, then broadcast the change
app.post("/api/menu/items/:id/display", (req, res) => {
  const id = Number(req.params.id);
  const item = menuItems.find((i) => i.id === id);

  if (!item) {
    return res.status(404).json({ error: "Menu item not found" });
  }

  menuItems.forEach((i) => {
    i.isDisplayed = false;
  });
  item.isDisplayed = true;

  io.emit("menu:updated", item);

  res.json(item);
});

// ---------- Orders ----------
// Orders live in memory for now. Each order always orders the *currently
// displayed* item, so we don't need an itemId from the customer - the
// server just looks up whatever's live right now.

let orders = [];
let nextOrderId = 1;

// Customer app calls this when "Place order" is tapped
app.post("/api/orders", (req, res) => {
  const { customerName } = req.body;

  if (!customerName || !customerName.trim()) {
    return res.status(400).json({ error: "customerName is required" });
  }

  const displayedItem = menuItems.find((item) => item.isDisplayed);
  if (!displayedItem) {
    return res.status(400).json({ error: "No item is currently displayed" });
  }

  const order = {
    id: nextOrderId++,
    customerName: customerName.trim(),
    itemName: displayedItem.name,
    itemPrice: displayedItem.price,
    status: "pending", // pending -> accepted
    riderName: null,
    createdAt: new Date().toISOString(),
  };

  orders.push(order);

  // Restaurant dashboard and rider app are both listening for this event
  io.emit("order:new", order);

  res.status(201).json(order);
});

// Restaurant dashboard loads the full order history when the page opens
app.get("/api/orders", (req, res) => {
  res.json(orders);
});

// Rider app only wants the ones nobody has accepted yet
app.get("/api/orders/available", (req, res) => {
  res.json(orders.filter((o) => o.status === "pending"));
});

// Rider app calls this when a rider taps "Accept delivery"
app.post("/api/orders/:id/accept", (req, res) => {
  const id = Number(req.params.id);
  const { riderName } = req.body;
  const order = orders.find((o) => o.id === id);

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }
  if (order.status !== "pending") {
    return res.status(409).json({ error: "This order has already been accepted" });
  }

  order.status = "accepted";
  order.riderName = riderName && riderName.trim() ? riderName.trim() : "A rider";

  // Customer app + restaurant dashboard update the order's status.
  // Other riders use this same event to remove it from their available list.
  io.emit("order:updated", order);

  res.json(order);
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

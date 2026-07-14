require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const Restaurant = require("./models/Restaurant");
const MenuItem = require("./models/MenuItem");
const Order = require("./models/Order");
const RestaurantUser = require("./models/RestaurantUser");
const Rider = require("./models/Rider");
const Customer = require("./models/Customer");
const { hashPassword, verifyPassword } = require("./utils/password");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Connect to MongoDB
connectDB();

// ---------- Authentication Middleware ----------

const authenticateRestaurantUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.substring(7); // Remove "Bearer "
  // For now, token is just the restaurantId:email (simple auth without JWT)
  // In production, use proper JWT tokens
  const [restaurantId, email] = Buffer.from(token, "base64").toString().split(":");
  
  if (!restaurantId || !email) {
    return res.status(401).json({ error: "Invalid token" });
  }

  req.restaurantId = restaurantId;
  req.userEmail = email;
  next();
};

// ---------- Authentication Endpoints ----------

// POST restaurant staff login
app.post("/api/auth/restaurant-login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const user = await RestaurantUser.findOne({ email }).populate("restaurant");

    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: "Account is inactive" });
    }

    // Create simple token (restaurantId:email in base64)
    const token = Buffer.from(`${user.restaurant._id}:${user.email}`).toString("base64");

    res.json({
      success: true,
      token,
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        restaurant: user.restaurant,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const authenticateRider = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.substring(7);
  // Same lightweight scheme as restaurant auth: riderId:phone in base64.
  const [riderId, phone] = Buffer.from(token, "base64").toString().split(":");

  if (!riderId || !phone) {
    return res.status(401).json({ error: "Invalid token" });
  }

  const rider = await Rider.findById(riderId);
  if (!rider || rider.phone !== phone || !rider.isActive) {
    return res.status(401).json({ error: "Invalid token" });
  }

  req.riderId = riderId;
  next();
};

// POST rider sign up
app.post("/api/auth/rider-signup", async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: "phone is required" });
    }
    if (!password) {
      return res.status(400).json({ error: "password is required" });
    }

    const existing = await Rider.findOne({ phone: phone.trim() });
    if (existing) {
      return res.status(409).json({ error: "An account with this phone number already exists" });
    }

    const rider = await Rider.create({
      name: name.trim(),
      phone: phone.trim(),
      password: hashPassword(password),
    });

    const token = Buffer.from(`${rider._id}:${rider.phone}`).toString("base64");

    res.status(201).json({
      success: true,
      token,
      rider: { _id: rider._id, name: rider.name, phone: rider.phone },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST rider login
app.post("/api/auth/rider-login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: "phone and password required" });
    }

    const rider = await Rider.findOne({ phone: phone.trim() });
    if (!rider || !verifyPassword(password, rider.password)) {
      return res.status(401).json({ error: "Invalid phone number or password" });
    }
    if (!rider.isActive) {
      return res.status(401).json({ error: "Account is inactive" });
    }

    const token = Buffer.from(`${rider._id}:${rider.phone}`).toString("base64");

    res.json({
      success: true,
      token,
      rider: { _id: rider._id, name: rider.name, phone: rider.phone },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const authenticateCustomer = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.substring(7);
  // Same lightweight scheme as rider/restaurant auth: customerId:email in base64.
  const [customerId, email] = Buffer.from(token, "base64").toString().split(":");

  if (!customerId || !email) {
    return res.status(401).json({ error: "Invalid token" });
  }

  const customer = await Customer.findById(customerId);
  if (!customer || customer.email !== email || !customer.isActive) {
    return res.status(401).json({ error: "Invalid token" });
  }

  req.customerId = customer._id;
  req.customer = customer;
  next();
};

// POST customer sign up
app.post("/api/auth/customer-signup", async (req, res) => {
  try {
    const { name, email, phone, address, password } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: "email is required" });
    }
    if (!password) {
      return res.status(400).json({ error: "password is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await Customer.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const customer = await Customer.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: phone ? phone.trim() : "",
      address: address ? address.trim() : "",
      password: hashPassword(password),
    });

    const token = Buffer.from(`${customer._id}:${customer.email}`).toString("base64");

    res.status(201).json({
      success: true,
      token,
      user: {
        _id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        role: "customer",
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST customer login
app.post("/api/auth/customer-login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const customer = await Customer.findOne({ email: normalizedEmail });
    if (!customer || !verifyPassword(password, customer.password)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    if (!customer.isActive) {
      return res.status(401).json({ error: "Account is inactive" });
    }

    const token = Buffer.from(`${customer._id}:${customer.email}`).toString("base64");

    res.json({
      success: true,
      token,
      user: {
        _id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        role: "customer",
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Restaurant Endpoints ----------

// GET all restaurants
app.get("/api/restaurants", async (req, res) => {
  try {
    const restaurants = await Restaurant.find();
    res.json(restaurants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET catalog (all restaurants with their menu) - for frontend browse
app.get("/api/catalog", async (req, res) => {
  try {
    const restaurants = await Restaurant.find().lean();
    const menuItems = await MenuItem.find().lean().populate("restaurant");
    
    // Add menu items to restaurants
    const catalog = restaurants.map((restaurant) => ({
      ...restaurant,
      menuItems: menuItems.filter((item) => item.restaurant._id.toString() === restaurant._id.toString()),
    }));

    res.json(catalog);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single restaurant with menu items
app.get("/api/restaurants/:id", async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }
    const menuItems = await MenuItem.find({ restaurant: req.params.id });
    res.json({ ...restaurant.toObject(), menuItems });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Menu Items Endpoints ----------

// GET menu items for authenticated restaurant staff
app.get("/api/menu/items/dashboard", authenticateRestaurantUser, async (req, res) => {
  try {
    const items = await MenuItem.find({ restaurant: req.restaurantId });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create a new menu item for the authenticated restaurant
app.post("/api/menu/items", authenticateRestaurantUser, async (req, res) => {
  try {
    const { name, price, emoji, category, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    if (price === undefined || price === null || Number.isNaN(Number(price)) || Number(price) < 0) {
      return res.status(400).json({ error: "a valid price is required" });
    }

    const item = await MenuItem.create({
      name: name.trim(),
      price: Number(price),
      emoji: emoji ? emoji.trim() : "",
      category: category ? category.trim() : "Main",
      description: description ? description.trim() : "",
      restaurant: req.restaurantId,
    });

    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all menu items (with restaurant info) - for customer app
app.get("/api/menu/items", async (req, res) => {
  try {
    const items = await MenuItem.find().populate("restaurant");
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET menu items by restaurant
app.get("/api/restaurants/:restaurantId/menu", async (req, res) => {
  try {
    const items = await MenuItem.find({ restaurant: req.params.restaurantId });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET currently displayed item for customer app
app.get("/api/menu/displayed", async (req, res) => {
  try {
    const displayed = await MenuItem.findOne({ isDisplayed: true }).populate("restaurant");
    res.json(displayed || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET currently displayed item for authenticated restaurant
app.get("/api/dashboard/current-item", authenticateRestaurantUser, async (req, res) => {
  try {
    const displayed = await MenuItem.findOne({
      restaurant: req.restaurantId,
      isDisplayed: true,
    });
    res.json(displayed || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST mark one item as displayed for authenticated restaurant (unmark others in same restaurant)
app.post("/api/dashboard/items/:id/display", authenticateRestaurantUser, async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Menu item not found" });
    }

    // Check if item belongs to the authenticated restaurant
    if (item.restaurant.toString() !== req.restaurantId) {
      return res.status(403).json({ error: "This item does not belong to your restaurant" });
    }

    // Unmark all items from this restaurant only
    await MenuItem.updateMany({ restaurant: req.restaurantId }, { isDisplayed: false });

    // Mark this one as displayed
    item.isDisplayed = true;
    await item.save();

    const displayedItem = await item.populate("restaurant");
    io.emit("menu:updated", displayedItem);

    res.json(displayedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST mark one item as displayed, unmark all others (legacy - for non-auth endpoints)
app.post("/api/menu/items/:id/display", async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Menu item not found" });
    }

    // Unmark all items
    await MenuItem.updateMany({}, { isDisplayed: false });

    // Mark this one as displayed
    item.isDisplayed = true;
    await item.save();

    const displayedItem = await item.populate("restaurant");
    io.emit("menu:updated", displayedItem);

    res.json(displayedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Orders Endpoints ----------

// POST create new order
app.post("/api/orders", authenticateCustomer, async (req, res) => {
  try {
    const { restaurantId, items } = req.body;

    if (!restaurantId) {
      return res.status(400).json({ error: "restaurantId is required" });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "items array is required" });
    }

    const order = new Order({
      customer: {
        name: req.customer.name,
        phone: req.customer.phone,
        email: req.customer.email,
        address: req.customer.address,
      },
      customerId: req.customer._id,
      restaurant: restaurantId,
      items: items,
      totalPrice: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      status: "pending",
    });

    await order.save();
    const populatedOrder = await order.populate(["restaurant", "items.menuItem"]);

    io.emit("order:new", populatedOrder);
    res.status(201).json(populatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET order history for the authenticated customer
app.get("/api/orders/mine", authenticateCustomer, async (req, res) => {
  try {
    const orders = await Order.find({ customerId: req.customerId })
      .populate("restaurant")
      .populate("items.menuItem")
      .populate({ path: "rider", select: "-password" })
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all orders
app.get("/api/orders", async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("restaurant")
      .populate("items.menuItem")
      .populate({ path: "rider", select: "-password" })
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET available orders (pending)
app.get("/api/orders/available", async (req, res) => {
  try {
    const orders = await Order.find({ status: "pending" })
      .populate("restaurant")
      .populate("items.menuItem")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST accept order (rider accepts delivery)
app.post("/api/orders/:id/accept", authenticateRider, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "pending") {
      return res.status(409).json({ error: "This order has already been accepted" });
    }

    order.status = "confirmed";
    order.rider = req.riderId;
    await order.save();
    const updatedOrder = await order.populate([
      "restaurant",
      "items.menuItem",
      { path: "rider", select: "-password" },
    ]);

    io.emit("order:updated", updatedOrder);
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH update order status
app.patch("/api/orders/:id/status", authenticateRider, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending", "confirmed", "preparing", "on-the-way", "delivered", "cancelled"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.rider && order.rider.toString() !== req.riderId) {
      return res.status(403).json({ error: "This order belongs to a different rider" });
    }

    order.status = status;
    await order.save();
    const updatedOrder = await order.populate([
      "restaurant",
      "items.menuItem",
      { path: "rider", select: "-password" },
    ]);

    io.emit("order:updated", updatedOrder);
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.io connection
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📍 MongoDB: ${process.env.MONGODB_URI || "mongodb://localhost:27017/food_delivery"}`);
});

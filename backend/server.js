require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const connectDB = require("./config/db");
const Restaurant = require("./models/Restaurant");
const MenuItem = require("./models/MenuItem");
const Order = require("./models/Order");
const RestaurantUser = require("./models/RestaurantUser");
const Customer = require("./models/Customer");
const Rider = require("./models/Rider");
const ScheduledOrder = require("./models/ScheduledOrder");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const JWT_SECRET = process.env.JWT_SECRET || "foodexpress-dev-secret";

const signAuthToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, {
    expiresIn: "7d",
  });

const verifyPassword = async (record, password) => {
  if (record.passwordHash) {
    return bcrypt.compare(password, record.passwordHash);
  }

  return record.password === password;
};

const authenticateJwt = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    req.auth = jwt.verify(authHeader.substring(7), JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.auth || !roles.includes(req.auth.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  next();
};

const authenticateRestaurantUser = [
  authenticateJwt,
  requireRole("restaurant"),
  (req, res, next) => {
    req.restaurantId = req.auth.restaurantId;
    req.userEmail = req.auth.email;
    next();
  },
];

// Connect to MongoDB
connectDB();

// ---------- Authentication Endpoints ----------

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  address: user.address,
  role: user.role,
  restaurant: user.restaurant,
});

const riderPublic = (rider) => ({
  id: rider._id,
  name: rider.name,
  phone: rider.phone,
  email: rider.email,
  isOnline: rider.isOnline,
});

// Flat payout per completed delivery. No real payments/pricing model exists
// yet, so this is a placeholder rate for the earnings summary.
const EARNINGS_PER_DELIVERY = 30;

app.post("/api/auth/customer-signup", async (req, res) => {
  try {
    const { name, email, phone, address, password } = req.body;

    if (!name || !name.trim() || !email || !password) {
      return res.status(400).json({ error: "name, email and password are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await Customer.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: "An account already exists with that email" });
    }

    const customer = await Customer.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: phone?.trim() || undefined,
      address: address?.trim() || undefined,
      passwordHash: await bcrypt.hash(password, 10),
      isActive: true,
    });

    const token = signAuthToken({
      sub: customer._id.toString(),
      role: "customer",
      email: customer.email,
      name: customer.name,
    });

    res.status(201).json({
      success: true,
      token,
      user: publicUser({ ...customer.toObject(), role: "customer" }),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/customer-login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const customer = await Customer.findOne({ email: email.trim().toLowerCase() });
    if (!customer || !customer.isActive) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const validPassword = await verifyPassword(customer, password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signAuthToken({
      sub: customer._id.toString(),
      role: "customer",
      email: customer.email,
      name: customer.name,
    });

    res.json({
      success: true,
      token,
      user: publicUser({ ...customer.toObject(), role: "customer" }),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/rider-login", async (req, res) => {
  try {
    // App sends phone; also accept email for backwards compatibility
    const { phone, email, password } = req.body;
    const identifier = phone || email;

    if (!identifier || !password) {
      return res.status(400).json({ error: "Phone and password required" });
    }

    // Look up by phone first, then fall back to email
    const rider = await Rider.findOne(
      phone
        ? { phone: identifier.trim() }
        : { email: identifier.trim().toLowerCase() }
    );
    if (!rider || !rider.isActive) {
      return res.status(401).json({ error: "Invalid phone or password" });
    }

    const validPassword = await verifyPassword(rider, password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid phone or password" });
    }

    const token = signAuthToken({
      sub: rider._id.toString(),
      role: "rider",
      email: rider.email,
      name: rider.name,
    });

    res.json({
      success: true,
      token,
      rider: riderPublic(rider),
      user: publicUser({ ...rider.toObject(), role: "rider" }),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST rider signup — phone-based (used by the Expo rider app)
app.post("/api/auth/rider-signup", async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    if (!name || !name.trim() || !phone || !phone.trim() || !password) {
      return res.status(400).json({ error: "name, phone and password are required" });
    }

    const existing = await Rider.findOne({ phone: phone.trim() });
    if (existing) {
      return res.status(409).json({ error: "An account already exists with that phone number" });
    }

    const rider = await Rider.create({
      name: name.trim(),
      phone: phone.trim(),
      email: `rider_${Date.now()}@foodexpress.local`,
      passwordHash: await bcrypt.hash(password, 10),
      isActive: true,
    });

    const token = signAuthToken({
      sub: rider._id.toString(),
      role: "rider",
      email: rider.email,
      name: rider.name,
    });

    res.status(201).json({
      success: true,
      token,
      rider: riderPublic(rider),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH rider's own profile (name/phone)
app.patch("/api/riders/me", authenticateJwt, requireRole("rider"), async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: "phone is required" });
    }

    const existing = await Rider.findOne({ phone: phone.trim(), _id: { $ne: req.auth.sub } });
    if (existing) {
      return res.status(409).json({ error: "An account already exists with that phone number" });
    }

    const rider = await Rider.findByIdAndUpdate(
      req.auth.sub,
      { name: name.trim(), phone: phone.trim() },
      { new: true }
    );
    if (!rider) {
      return res.status(404).json({ error: "Rider not found" });
    }

    res.json({ success: true, rider: riderPublic(rider) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH rider's own online/offline status
app.patch("/api/riders/me/online", authenticateJwt, requireRole("rider"), async (req, res) => {
  try {
    if (typeof req.body?.isOnline !== "boolean") {
      return res.status(400).json({ error: "isOnline boolean is required" });
    }

    const rider = await Rider.findByIdAndUpdate(
      req.auth.sub,
      { isOnline: req.body.isOnline },
      { new: true }
    );
    if (!rider) {
      return res.status(404).json({ error: "Rider not found" });
    }

    res.json({ success: true, rider: riderPublic(rider) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET rider's own delivery stats (count + placeholder flat-rate earnings)
app.get("/api/riders/me/stats", authenticateJwt, requireRole("rider"), async (req, res) => {
  try {
    const totalDeliveries = await Order.countDocuments({
      rider: req.auth.sub,
      status: "delivered",
    });

    res.json({
      totalDeliveries,
      totalEarnings: totalDeliveries * EARNINGS_PER_DELIVERY,
      earningsPerDelivery: EARNINGS_PER_DELIVERY,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST restaurant owner signup — creates new restaurant + owner account
app.post("/api/auth/restaurant-owner-signup", async (req, res) => {
  try {
    const {
      ownerName,
      email,
      password,
      phone,
      restaurantName,
      cuisine,
      address,
      restaurantPhone,
      deliveryTime,
    } = req.body;

    if (!ownerName || !ownerName.trim()) {
      return res.status(400).json({ error: "Owner name is required" });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: "Email is required" });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    if (!restaurantName || !restaurantName.trim()) {
      return res.status(400).json({ error: "Restaurant name is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email already in use
    const existingUser = await RestaurantUser.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ error: "An account already exists with that email" });
    }

    // Check if restaurant name already taken
    const existingRestaurant = await Restaurant.findOne({
      name: { $regex: new RegExp(`^${restaurantName.trim()}$`, "i") },
    });
    if (existingRestaurant) {
      return res.status(409).json({ error: "A restaurant with that name already exists" });
    }

    // Create the restaurant
    const restaurant = await Restaurant.create({
      name: restaurantName.trim(),
      cuisine: cuisine?.trim() || undefined,
      address: address?.trim() || undefined,
      phone: restaurantPhone?.trim() || undefined,
      deliveryTime: deliveryTime?.trim() || undefined,
      isOpen: true,
    });

    // Create the owner user
    const ownerUser = await RestaurantUser.create({
      name: ownerName.trim(),
      email: normalizedEmail,
      phone: phone?.trim() || undefined,
      passwordHash: await bcrypt.hash(password, 10),
      restaurant: restaurant._id,
      role: "owner",
      isActive: true,
    });

    const populatedUser = await ownerUser.populate("restaurant");

    const token = signAuthToken({
      sub: ownerUser._id.toString(),
      role: "restaurant",
      email: ownerUser.email,
      name: ownerUser.name,
      restaurantId: restaurant._id.toString(),
      restaurantRole: "owner",
    });

    res.status(201).json({
      success: true,
      token,
      user: {
        name: populatedUser.name,
        email: populatedUser.email,
        phone: populatedUser.phone,
        role: populatedUser.role,
        restaurant: populatedUser.restaurant,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Keep legacy staff signup endpoint (but it's no longer linked from frontend)
app.post("/api/auth/restaurant-signup", async (req, res) => {
  try {
    const { name, email, password, restaurantId, role } = req.body;

    if (!name || !name.trim() || !email || !password || !restaurantId) {
      return res.status(400).json({ error: "name, email, password and restaurantId are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await RestaurantUser.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: "An account already exists with that email" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const staffUser = await RestaurantUser.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 10),
      restaurant: restaurant._id,
      role: role === "manager" ? "manager" : "staff",
      isActive: true,
    });

    const populatedUser = await staffUser.populate("restaurant");
    const token = signAuthToken({
      sub: staffUser._id.toString(),
      role: "restaurant",
      email: staffUser.email,
      name: staffUser.name,
      restaurantId: restaurant._id.toString(),
    });

    res.status(201).json({
      success: true,
      token,
      user: {
        name: populatedUser.name,
        email: populatedUser.email,
        role: populatedUser.role,
        restaurant: populatedUser.restaurant,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST restaurant staff login
app.post("/api/auth/restaurant-login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const user = await RestaurantUser.findOne({ email: email.trim().toLowerCase() }).populate("restaurant");

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const validPassword = await verifyPassword(user, password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: "Account is inactive" });
    }

    const token = signAuthToken({
      sub: user._id.toString(),
      role: "restaurant",
      email: user.email,
      name: user.name,
      restaurantId: user.restaurant._id.toString(),
    });

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

// ---------- Customer Endpoints ----------

// GET the authenticated customer's favorite restaurants
app.get("/api/customers/favorites", authenticateJwt, requireRole("customer"), async (req, res) => {
  try {
    const customer = await Customer.findById(req.auth.sub).populate("favoriteRestaurants");
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.json(customer.favoriteRestaurants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST add a restaurant to the authenticated customer's favorites
app.post("/api/customers/favorites/:restaurantId", authenticateJwt, requireRole("customer"), async (req, res) => {
  try {
    const customer = await Customer.findById(req.auth.sub);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    const { restaurantId } = req.params;
    const alreadyFavorited = customer.favoriteRestaurants.some(
      (id) => id.toString() === restaurantId
    );
    if (!alreadyFavorited) {
      customer.favoriteRestaurants.push(restaurantId);
      await customer.save();
    }
    res.json({ success: true, favoriteRestaurantIds: customer.favoriteRestaurants });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE remove a restaurant from the authenticated customer's favorites
app.delete("/api/customers/favorites/:restaurantId", authenticateJwt, requireRole("customer"), async (req, res) => {
  try {
    const customer = await Customer.findById(req.auth.sub);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    const { restaurantId } = req.params;
    customer.favoriteRestaurants = customer.favoriteRestaurants.filter(
      (id) => id.toString() !== restaurantId
    );
    await customer.save();
    res.json({ success: true, favoriteRestaurantIds: customer.favoriteRestaurants });
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

// GET currently displayed items for customer app
app.get("/api/menu/displayed", async (req, res) => {
  try {
    const displayedItems = await MenuItem.find({ isDisplayed: true, isAvailable: true })
      .populate("restaurant")
      .sort({ updatedAt: -1 });
    res.json(displayedItems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET currently displayed items for authenticated restaurant
app.get("/api/dashboard/current-item", authenticateRestaurantUser, async (req, res) => {
  try {
    const displayedItems = await MenuItem.find({
      restaurant: req.restaurantId,
      isDisplayed: true,
    });
    res.json(displayedItems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST/PATCH set displayed flag for authenticated restaurant menu item
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

    // Backward compatible default keeps existing clients working.
    const nextDisplayed =
      typeof req.body?.isDisplayed === "boolean" ? req.body.isDisplayed : true;

    item.isDisplayed = nextDisplayed;
    await item.save();

    const updatedItem = await item.populate("restaurant");
    io.emit("menu:updated", {
      type: "item",
      item: updatedItem,
    });

    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/dashboard/items/:id/display", authenticateRestaurantUser, async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Menu item not found" });
    }

    if (item.restaurant.toString() !== req.restaurantId) {
      return res.status(403).json({ error: "This item does not belong to your restaurant" });
    }

    if (typeof req.body?.isDisplayed !== "boolean") {
      return res.status(400).json({ error: "isDisplayed boolean is required" });
    }

    item.isDisplayed = req.body.isDisplayed;
    await item.save();

    const updatedItem = await item.populate("restaurant");
    io.emit("menu:updated", {
      type: "item",
      item: updatedItem,
    });

    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST mark one item as displayed (legacy - non-auth endpoint)
app.post("/api/menu/items/:id/display", async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Menu item not found" });
    }

    const nextDisplayed =
      typeof req.body?.isDisplayed === "boolean" ? req.body.isDisplayed : true;

    item.isDisplayed = nextDisplayed;
    await item.save();

    const updatedItem = await item.populate("restaurant");
    io.emit("menu:updated", {
      type: "item",
      item: updatedItem,
    });

    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Orders Endpoints ----------

// POST create new order
app.post("/api/orders", authenticateJwt, requireRole("customer"), async (req, res) => {
  try {
    const { restaurantId, items } = req.body;

    if (!restaurantId) {
      return res.status(400).json({ error: "restaurantId is required" });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "items array is required" });
    }

    const customer = await Customer.findById(req.auth.sub);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }
    if (!restaurant.isOpen) {
      return res.status(409).json({ error: "This restaurant is currently closed" });
    }

    const order = new Order({
      customer: {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
      },
      customerId: customer._id,
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

// ---------- Scheduled Orders ("Order Ahead") ----------
// A ScheduledOrder is just an intent - the real Order isn't created until
// processDueScheduledOrders() (below) finds it due, so nothing here touches
// the normal order/restaurant-dashboard/rider flows.

const MIN_SCHEDULE_LEAD_MS = 60 * 1000;
const MAX_SCHEDULE_LEAD_MS = 3 * 60 * 60 * 1000;

// POST schedule an order for a future time
app.post("/api/scheduled-orders", authenticateJwt, requireRole("customer"), async (req, res) => {
  try {
    const { restaurantId, items, scheduledFor } = req.body;

    if (!restaurantId) {
      return res.status(400).json({ error: "restaurantId is required" });
    }
    if (!items || items.length === 0) {
      return res.status(400).json({ error: "items array is required" });
    }

    const scheduledDate = new Date(scheduledFor);
    if (Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: "scheduledFor must be a valid date" });
    }
    if (scheduledDate.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
      return res.status(400).json({ error: "scheduledFor must be at least a minute in the future" });
    }
    if (scheduledDate.getTime() > Date.now() + MAX_SCHEDULE_LEAD_MS) {
      return res.status(400).json({ error: "scheduledFor can be at most 3 hours in the future" });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const scheduled = await ScheduledOrder.create({
      customerId: req.auth.sub,
      restaurant: restaurantId,
      items,
      scheduledFor: scheduledDate,
      status: "pending",
    });

    const populated = await scheduled.populate(["restaurant", "items.menuItem"]);
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET the authenticated customer's upcoming scheduled orders
app.get("/api/scheduled-orders/mine", authenticateJwt, requireRole("customer"), async (req, res) => {
  try {
    const scheduled = await ScheduledOrder.find({ customerId: req.auth.sub, status: "pending" })
      .populate("restaurant")
      .populate("items.menuItem")
      .sort({ scheduledFor: 1 });
    res.json(scheduled);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE cancel a scheduled order before it fires
app.delete("/api/scheduled-orders/:id", authenticateJwt, requireRole("customer"), async (req, res) => {
  try {
    const scheduled = await ScheduledOrder.findById(req.params.id);
    if (!scheduled) {
      return res.status(404).json({ error: "Scheduled order not found" });
    }
    if (scheduled.customerId.toString() !== req.auth.sub) {
      return res.status(403).json({ error: "This scheduled order does not belong to you" });
    }
    if (scheduled.status !== "pending") {
      return res.status(409).json({ error: "This scheduled order can no longer be cancelled" });
    }

    await ScheduledOrder.deleteOne({ _id: scheduled._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET order history for the authenticated customer
app.get("/api/orders/mine", authenticateJwt, requireRole("customer"), async (req, res) => {
  try {
    const orders = await Order.find({ customerId: req.auth.sub })
      .populate("restaurant")
      .populate("items.menuItem")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH cancel an order — customer can only cancel before the kitchen has it ready
app.patch("/api/orders/:id/cancel", authenticateJwt, requireRole("customer"), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (!order.customerId || order.customerId.toString() !== req.auth.sub) {
      return res.status(403).json({ error: "This order does not belong to you" });
    }

    const cancellableStatuses = ["pending", "confirmed", "preparing"];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(409).json({ error: "This order can no longer be cancelled" });
    }

    order.status = "cancelled";
    await order.save();
    const updatedOrder = await order.populate(["restaurant", "items.menuItem"]);

    io.emit("order:updated", updatedOrder);
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH rate a delivered order (1-5) — once only
app.patch("/api/orders/:id/rate", authenticateJwt, requireRole("customer"), async (req, res) => {
  try {
    const { rating } = req.body;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "rating must be an integer between 1 and 5" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (!order.customerId || order.customerId.toString() !== req.auth.sub) {
      return res.status(403).json({ error: "This order does not belong to you" });
    }
    if (order.status !== "delivered") {
      return res.status(409).json({ error: "You can only rate a delivered order" });
    }
    if (order.rating) {
      return res.status(409).json({ error: "This order has already been rated" });
    }

    order.rating = rating;
    await order.save();
    const updatedOrder = await order.populate(["restaurant", "items.menuItem"]);
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all orders
app.get("/api/orders", authenticateJwt, requireRole("restaurant", "rider"), async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("restaurant")
      .populate("items.menuItem")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET orders for the authenticated restaurant only
app.get("/api/orders/restaurant", authenticateRestaurantUser, async (req, res) => {
  try {
    const orders = await Order.find({ restaurant: req.restaurantId })
      .populate("restaurant")
      .populate("items.menuItem")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET available orders for rider — only 'ready' orders (food packed, waiting for pickup)
app.get("/api/orders/available", authenticateJwt, requireRole("rider"), async (req, res) => {
  try {
    const rider = await Rider.findById(req.auth.sub);
    if (!rider || !rider.isOnline) {
      return res.json([]);
    }

    const orders = await Order.find({ status: "ready" })
      .populate("restaurant")
      .populate("items.menuItem")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST rider picks up a ready order → on-the-way
app.post("/api/orders/:id/accept", authenticateJwt, requireRole("rider"), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "ready") {
      return res.status(409).json({ error: "This order is not ready for pickup yet" });
    }

    order.status = "on-the-way";
    order.rider = req.auth.sub;
    await order.save();
    const updatedOrder = await order.populate([
      "restaurant",
      "items.menuItem",
      { path: "rider", select: "-passwordHash" },
    ]);

    io.emit("order:updated", updatedOrder);
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH update order status (rider)
app.patch("/api/orders/:id/status", authenticateJwt, requireRole("rider"), async (req, res) => {
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

    if (order.rider && order.rider.toString() !== req.auth.sub) {
      return res.status(403).json({ error: "This order belongs to a different rider" });
    }

    order.status = status;
    await order.save();
    const updatedOrder = await order.populate([
      "restaurant",
      "items.menuItem",
      { path: "rider", select: "-passwordHash" },
    ]);

    io.emit("order:updated", updatedOrder);
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH update order status (restaurant — can mark preparing or ready)
app.patch("/api/orders/:id/restaurant-status", authenticateRestaurantUser, async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ["preparing", "ready"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: `Restaurant can only set status to: ${allowedStatuses.join(", ")}` });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Ensure this order belongs to the authenticated restaurant
    if (order.restaurant.toString() !== req.restaurantId) {
      return res.status(403).json({ error: "This order does not belong to your restaurant" });
    }

    order.status = status;
    await order.save();
    const updatedOrder = await order.populate(["restaurant", "items.menuItem"]);

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

// Turns due ScheduledOrders into real Orders, exactly like POST /api/orders
// would. Runs on an interval rather than a per-order timer so it survives
// server restarts - anything due gets picked up on the next tick.
const SCHEDULED_ORDER_CHECK_INTERVAL_MS = 30 * 1000;

async function processDueScheduledOrders() {
  try {
    const due = await ScheduledOrder.find({
      status: "pending",
      scheduledFor: { $lte: new Date() },
    });

    for (const scheduled of due) {
      try {
        const [customer, restaurant] = await Promise.all([
          Customer.findById(scheduled.customerId),
          Restaurant.findById(scheduled.restaurant),
        ]);

        if (!customer) {
          scheduled.status = "failed";
          scheduled.failureReason = "Customer account no longer exists";
          await scheduled.save();
          continue;
        }
        if (!restaurant) {
          scheduled.status = "failed";
          scheduled.failureReason = "Restaurant no longer exists";
          await scheduled.save();
          continue;
        }
        if (!restaurant.isOpen) {
          scheduled.status = "failed";
          scheduled.failureReason = "Restaurant is closed";
          await scheduled.save();
          continue;
        }

        const order = new Order({
          customer: {
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
          },
          customerId: customer._id,
          restaurant: restaurant._id,
          items: scheduled.items,
          totalPrice: scheduled.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
          status: "pending",
        });

        await order.save();
        const populatedOrder = await order.populate(["restaurant", "items.menuItem"]);
        io.emit("order:new", populatedOrder);

        scheduled.status = "placed";
        scheduled.placedOrderId = order._id;
        await scheduled.save();
      } catch (innerError) {
        scheduled.status = "failed";
        scheduled.failureReason = innerError.message;
        await scheduled.save().catch(() => {});
      }
    }
  } catch (error) {
    console.error("Error processing scheduled orders:", error.message);
  }
}

setInterval(processDueScheduledOrders, SCHEDULED_ORDER_CHECK_INTERVAL_MS);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📍 MongoDB: ${process.env.MONGODB_URI || "mongodb://localhost:27017/food_delivery"}`);
});

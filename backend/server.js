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
app.post("/api/orders", async (req, res) => {
  try {
    const { customerName, restaurantId, items } = req.body;

    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ error: "customerName is required" });
    }

    if (!restaurantId) {
      return res.status(400).json({ error: "restaurantId is required" });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "items array is required" });
    }

    const order = new Order({
      customer: {
        name: customerName.trim(),
      },
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

// GET all orders
app.get("/api/orders", async (req, res) => {
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
app.post("/api/orders/:id/accept", async (req, res) => {
  try {
    const { riderName } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "pending") {
      return res.status(409).json({ error: "This order has already been accepted" });
    }

    order.status = "accepted";
    await order.save();
    const updatedOrder = await order.populate(["restaurant", "items.menuItem"]);

    io.emit("order:updated", updatedOrder);
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH update order status
app.patch("/api/orders/:id/status", async (req, res) => {
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

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📍 MongoDB: ${process.env.MONGODB_URI || "mongodb://localhost:27017/food_delivery"}`);
});

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const connectDB = require("./config/db");
const Restaurant = require("./models/Restaurant");
const MenuItem = require("./models/MenuItem");
const RestaurantUser = require("./models/RestaurantUser");
const Customer = require("./models/Customer");
const Rider = require("./models/Rider");

const seedDatabase = async () => {
  try {
    await connectDB();

    const shouldReset = process.env.RESET_DB === "true";

    if (shouldReset) {
      // Explicit reset only when requested.
      await Restaurant.deleteMany({});
      await MenuItem.deleteMany({});
      await RestaurantUser.deleteMany({});
      await Customer.deleteMany({});
      await Rider.deleteMany({});
    } else {
      const restaurantCount = await Restaurant.countDocuments();
      const customerCount = await Customer.countDocuments();
      if (restaurantCount > 0 || customerCount > 0) {
        console.log("Seed skipped: database already has data. Use RESET_DB=true npm run seed to rebuild demo records.");
        mongoose.connection.close();
        return;
      }
    }

    const hashedPassword = await bcrypt.hash("password123", 10);

    // Create restaurants based on frontend mockData
    const restaurants = await Restaurant.create([
      {
        name: "Tasty Bites",
        cuisine: "Multi-cuisine • Home-style cooking",
        address: "123 Food Street, Flavor Town",
        phone: "555-0001",
        email: "info@tastybites.com",
        rating: 4.5,
        deliveryTime: "25-30 min",
        costForTwo: 350,
        emoji: "🍽️",
        isOpen: true,
      },
      {
        name: "Spice Route",
        cuisine: "North Indian • Mughlai",
        address: "45 Curry Lane, Flavor Town",
        phone: "555-0002",
        email: "info@spiceroute.com",
        rating: 4.7,
        deliveryTime: "30-35 min",
        costForTwo: 550,
        emoji: "🍛",
        isOpen: true,
      },
      {
        name: "Pizza Planet",
        cuisine: "Italian • Pizza & Pasta",
        address: "9 Cheese Avenue, Flavor Town",
        phone: "555-0003",
        email: "info@pizzaplanet.com",
        rating: 4.3,
        deliveryTime: "20-25 min",
        costForTwo: 450,
        emoji: "🍕",
        isOpen: true,
      },
      {
        name: "Dragon Wok",
        cuisine: "Chinese • Asian Fusion",
        address: "78 Noodle Road, Flavor Town",
        phone: "555-0004",
        email: "info@dragonwok.com",
        rating: 4.6,
        deliveryTime: "25-30 min",
        costForTwo: 400,
        emoji: "🥡",
        isOpen: true,
      },
      {
        name: "Burger Barn",
        cuisine: "American • Burgers & Fries",
        address: "12 Grill Street, Flavor Town",
        phone: "555-0005",
        email: "info@burgerbarn.com",
        rating: 4.2,
        deliveryTime: "15-20 min",
        costForTwo: 300,
        emoji: "🍔",
        isOpen: true,
      },
      {
        name: "Sweet Tooth",
        cuisine: "Desserts • Bakery",
        address: "3 Sugar Boulevard, Flavor Town",
        phone: "555-0006",
        email: "info@sweetooth.com",
        rating: 4.8,
        deliveryTime: "20-25 min",
        costForTwo: 250,
        emoji: "🍰",
        isOpen: true,
      },
    ]);

    // Create menu items based on frontend mockData
    const menuItems = await MenuItem.create([
      // Tasty Bites
      {
        name: "Margherita Pizza",
        price: 249,
        emoji: "🍕",
        restaurant: restaurants[0]._id,
        category: "Pizza",
        isAvailable: true,
        isDisplayed: false,
      },
      {
        name: "Chocolate Brownie",
        price: 149,
        emoji: "🍫",
        restaurant: restaurants[0]._id,
        category: "Dessert",
        isAvailable: true,
        isDisplayed: false,
      },
      // Spice Route
      {
        name: "Butter Chicken",
        price: 299,
        emoji: "🍗",
        restaurant: restaurants[1]._id,
        category: "Curry",
        isAvailable: true,
        isDisplayed: false,
      },
      {
        name: "Paneer Tikka",
        price: 199,
        emoji: "🧀",
        restaurant: restaurants[1]._id,
        category: "Appetizer",
        isAvailable: true,
        isDisplayed: true,
      },
      // Pizza Planet
      {
        name: "Margherita Pizza",
        price: 279,
        emoji: "🍕",
        restaurant: restaurants[2]._id,
        category: "Pizza",
        isAvailable: true,
        isDisplayed: false,
      },
      {
        name: "Tiramisu",
        price: 199,
        emoji: "🍰",
        restaurant: restaurants[2]._id,
        category: "Dessert",
        isAvailable: true,
        isDisplayed: false,
      },
      // Dragon Wok
      {
        name: "Veg Hakka Noodles",
        price: 249,
        emoji: "🍜",
        restaurant: restaurants[3]._id,
        category: "Noodles",
        isAvailable: true,
        isDisplayed: false,
      },
      {
        name: "Classic Cheeseburger",
        price: 269,
        emoji: "🍔",
        restaurant: restaurants[3]._id,
        category: "Fusion",
        isAvailable: true,
        isDisplayed: false,
      },
      // Burger Barn
      {
        name: "Classic Cheeseburger",
        price: 199,
        emoji: "🍔",
        restaurant: restaurants[4]._id,
        category: "Burger",
        isAvailable: true,
        isDisplayed: false,
      },
      {
        name: "Crispy Fries",
        price: 99,
        emoji: "🍟",
        restaurant: restaurants[4]._id,
        category: "Sides",
        isAvailable: true,
        isDisplayed: false,
      },
      // Sweet Tooth
      {
        name: "Chocolate Brownie",
        price: 129,
        emoji: "🍫",
        restaurant: restaurants[5]._id,
        category: "Dessert",
        isAvailable: true,
        isDisplayed: false,
      },
      {
        name: "Cupcake Trio",
        price: 179,
        emoji: "🧁",
        restaurant: restaurants[5]._id,
        category: "Dessert",
        isAvailable: true,
        isDisplayed: false,
      },
    ]);

    // Create restaurant staff users (login credentials for each restaurant)
    const restaurantUsers = await RestaurantUser.create([
      {
        email: "manager@tastybites.com",
        passwordHash: hashedPassword,
        name: "Tasty Bites Manager",
        restaurant: restaurants[0]._id,
        role: "manager",
        isActive: true,
      },
      {
        email: "manager@spiceroute.com",
        passwordHash: hashedPassword,
        name: "Spice Route Manager",
        restaurant: restaurants[1]._id,
        role: "manager",
        isActive: true,
      },
      {
        email: "manager@pizzaplanet.com",
        passwordHash: hashedPassword,
        name: "Pizza Planet Manager",
        restaurant: restaurants[2]._id,
        role: "manager",
        isActive: true,
      },
      {
        email: "manager@dragonwok.com",
        passwordHash: hashedPassword,
        name: "Dragon Wok Manager",
        restaurant: restaurants[3]._id,
        role: "manager",
        isActive: true,
      },
      {
        email: "manager@burgerbarn.com",
        passwordHash: hashedPassword,
        name: "Burger Barn Manager",
        restaurant: restaurants[4]._id,
        role: "manager",
        isActive: true,
      },
      {
        email: "manager@sweetooth.com",
        passwordHash: hashedPassword,
        name: "Sweet Tooth Manager",
        restaurant: restaurants[5]._id,
        role: "manager",
        isActive: true,
      },
    ]);

    const customers = await Customer.create([
      {
        name: "Demo Customer",
        email: "customer@foodexpress.com",
        phone: "555-1000",
        address: "1 Demo Street, Flavor Town",
        passwordHash: hashedPassword,
        isActive: true,
      },
    ]);

    const riders = await Rider.create([
      {
        name: "Rider One",
        email: "rider1@foodexpress.com",
        phone: "555-2001",
        passwordHash: hashedPassword,
        isActive: true,
      },
      {
        name: "Rider Two",
        email: "rider2@foodexpress.com",
        phone: "555-2002",
        passwordHash: hashedPassword,
        isActive: true,
      },
    ]);

    console.log("✅ Database seeded successfully!");
    console.log(`📍 Created ${restaurants.length} restaurants`);
    console.log(`🍽️  Created ${menuItems.length} menu items`);
    console.log(`👤 Created ${restaurantUsers.length} restaurant staff users`);
    console.log(`🧑‍🍳 Created ${riders.length} rider users`);
    console.log(`🛍️  Created ${customers.length} customer users`);
    console.log("\n📋 Restaurant Staff Login Credentials:");
    restaurantUsers.forEach((user) => {
      console.log(`   ${user.email} / password123`);
    });
    console.log("\n📋 Customer Login Credentials:");
    customers.forEach((customer) => {
      console.log(`   ${customer.email} / password123`);
    });
    console.log("\n📋 Rider Login Credentials:");
    riders.forEach((rider) => {
      console.log(`   ${rider.email} / password123`);
    });

    mongoose.connection.close();
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
};

// Run seed if this file is executed directly
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;

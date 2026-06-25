# MongoDB Database Setup Guide

## Installation Steps

### 1. Install MongoDB Community Edition (Mac)

Using Homebrew:
```bash
brew tap mongodb/brew
brew install mongodb-community
```

### 2. Start MongoDB Service

```bash
# Start MongoDB in the background
brew services start mongodb-community

# Verify it's running
brew services list
```

You should see: `mongodb-community started` ✅

### 3. Install Backend Dependencies

Navigate to your backend folder and run:
```bash
cd Backend_food_delivery/backend
npm install
```

This will install:
- `mongoose` - MongoDB driver
- `dotenv` - Environment variables management

### 4. Seed the Database with Sample Data

Run this command to populate your database with 3 restaurants and 9 sample menu items:

```bash
npm run seed
```

Add this script to your `package.json`:
```json
"scripts": {
  "start": "node server.js",
  "dev": "node server.js",
  "seed": "node seed.js"
}
```

You should see output like:
```
✅ Database seeded successfully!
📍 Created 3 restaurants
🍽️  Created 9 menu items
```

### 5. Start Your Server

```bash
npm start
```

You should see:
```
✅ Server running on http://localhost:4000
📍 MongoDB: mongodb://localhost:27017/food_delivery
```

## Database Structure

### Collections (Tables):

1. **Restaurants** - Multiple restaurant entries
   - name, description, address, phone, email, rating, image, isOpen

2. **MenuItems** - Food items linked to restaurants
   - name, description, price, emoji, restaurant (ID), category, isAvailable, isDisplayed

3. **Orders** - Customer orders
   - orderId, customer, restaurant (ID), items, totalPrice, status, createdAt

## API Endpoints

### Restaurants
```
GET /api/restaurants              - Get all restaurants
GET /api/restaurants/:id          - Get restaurant with menu items
```

### Menu Items
```
GET /api/menu/items               - Get all menu items
GET /api/restaurants/:id/menu     - Get menu items for specific restaurant
GET /api/menu/displayed           - Get currently displayed item
POST /api/menu/items/:id/display  - Display specific menu item
```

### Orders
```
POST /api/orders                  - Create new order
GET /api/orders                   - Get all orders
GET /api/orders/available         - Get pending orders
POST /api/orders/:id/accept       - Accept order (rider)
PATCH /api/orders/:id/status      - Update order status
```

## Troubleshooting

### MongoDB not starting
```bash
# Check logs
brew services log mongodb-community

# Try manual start
mongod --dbpath /opt/homebrew/var/mongodb
```

### Connection refused
- Ensure MongoDB is running: `brew services list`
- Check port 27017 is available

### Need to reset database
```bash
mongo
# In mongo shell:
use food_delivery
db.dropDatabase()
exit
# Then run seed again
npm run seed
```

## Stop MongoDB
```bash
brew services stop mongodb-community
```

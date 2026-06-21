// In-memory menu data. Swap this for a real database table later -
// the API and socket logic in server.js won't need to change much.

let menuItems = [
  { id: 1, name: "Margherita Pizza", price: 249, isDisplayed: false },
  { id: 2, name: "Veg Biryani", price: 199, isDisplayed: true },
  { id: 3, name: "Paneer Butter Masala", price: 229, isDisplayed: false },
  { id: 4, name: "Masala Dosa", price: 99, isDisplayed: false },
];

module.exports = menuItems;

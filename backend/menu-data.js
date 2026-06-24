// In-memory menu data. Swap this for a real database table later -
// the API and socket logic in server.js won't need to change much.

let menuItems = [
  {
    id: 1,
    name: "Margherita Pizza",
    price: 249,
    emoji: "🍕",
    description: "Classic delight with fresh mozzarella, basil, and a tangy tomato base.",
    isDisplayed: false,
  },
  {
    id: 2,
    name: "Veg Biryani",
    price: 199,
    emoji: "🍛",
    description: "Fragrant basmati rice layered with spiced vegetables and saffron.",
    isDisplayed: true,
  },
  {
    id: 3,
    name: "Paneer Butter Masala",
    price: 229,
    emoji: "🧈",
    description: "Soft paneer cubes simmered in a rich, creamy tomato-butter gravy.",
    isDisplayed: false,
  },
  {
    id: 4,
    name: "Masala Dosa",
    price: 99,
    emoji: "🥞",
    description: "Crispy rice crepe filled with spiced potato filling, served with chutney.",
    isDisplayed: false,
  },
];

module.exports = menuItems;

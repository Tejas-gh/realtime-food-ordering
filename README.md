# Food delivery backend - full order flow

Four files now work together:

- `backend/server.js` — Express + Socket.io server (everyone talks to this)
- `dashboard.html` — restaurant staff: pick the displayed item, see incoming orders
- `customer-app.html` — customer: see the live item, place an order, track its status
- `rider-app.html` — rider: see orders waiting to be picked up, accept one

## Run it

1. `cd backend && npm install` (only needed once)
2. `npm start` — leave this terminal running
3. Open `dashboard.html`, `customer-app.html`, and `rider-app.html` all in
   separate browser tabs/windows

## Try the full flow

1. In **dashboard.html**, pick an item to display.
2. In **customer-app.html**, type a name and click "Place order".
   - The card switches to "ORDER PLACED — waiting for a rider".
3. Switch to **dashboard.html** — a new row appears under "Incoming orders"
   with "Pending" status, no refresh needed.
4. Switch to **rider-app.html** — the same order appears as an available
   delivery. Type a rider name and click "Accept delivery".
5. Watch all three update at once:
   - **rider-app.html**: the order disappears from the available list
   - **dashboard.html**: the order's status flips to "Accepted · [rider name]"
   - **customer-app.html**: the card updates to "RIDER ON THE WAY — Accepted by [rider name]"

That's the realtime loop working end to end.

## How the events flow

```
Customer places order  --POST /api/orders-->  Backend
Backend  --io.emit('order:new')-->  Dashboard + Rider app

Rider accepts  --POST /api/orders/:id/accept-->  Backend
Backend  --io.emit('order:updated')-->  Customer + Dashboard + other Riders
```

## What's deliberately left out (for next steps)

- **Status beyond "accepted"** — e.g. picked up, out for delivery, delivered.
  Same pattern: add a status, add an endpoint, emit an event.
- **A real database** — orders and menu items currently live in memory and
  reset every time you restart the server.
- **Auth** — anyone can currently call any endpoint. You'll want to check
  who's making each request before this goes anywhere near production.
- **Picking which rider gets notified** — right now every rider sees every
  order. A real app would filter by the rider's location/zone.

## Files

- `backend/server.js` — Express + Socket.io server, all API endpoints
- `backend/menu-data.js` — in-memory menu items (swap for a real DB later)
- `dashboard.html` — staff-facing menu picker + incoming orders list
- `customer-app.html` — customer-facing item view + order tracker
- `rider-app.html` — rider-facing available deliveries list

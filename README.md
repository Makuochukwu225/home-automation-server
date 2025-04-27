# 🌟 Device Manager Server

This is a Node.js server using **Express** and **WebSocket** to manage devices, handle their pin states, receive sensor data, and issue commands in real-time.

---

## 🚀 Features

- Real-time device communication with WebSockets.
- REST API to interact with devices (list devices, send commands).
- Track device connection status and last seen time.
- Broadcast updates (pin states, sensor data) to all clients.
- Handle pin toggling and receive sensor updates dynamically.

---

## 📦 Technologies Used

- [Express](https://expressjs.com/) — for creating the REST API server.
- [ws (WebSocket)](https://www.npmjs.com/package/ws) — for real-time WebSocket connections.
- [Node.js](https://nodejs.org/) — JavaScript runtime.

---

## 🛠️ Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/device-manager-server.git
cd device-manager-server

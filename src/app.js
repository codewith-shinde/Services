const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("./config");

// Initialize DB (runs schema creation)
require("./models/database");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// API Routes
app.use("/api/auth", require("./modules/auth/routes"));
app.use("/api/user", require("./modules/user/routes"));
app.use("/api/punch", require("./modules/punch/routes"));
app.use("/api/emails", require("./modules/email/routes"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Serve frontend for all other routes (Express 5 syntax)
app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(config.PORT, () => {
  console.log("=".repeat(50));
  console.log("  WorkHub — Punch Tracker & Email Assistant");
  console.log(`  http://localhost:${config.PORT}`);
  console.log("=".repeat(50));
});

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuid } = require("uuid");
const db = require("../../models/database");
const config = require("../../config");

const router = express.Router();

// POST /api/auth/register
router.post("/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, and password are required" });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const id = uuid();
  const hashed = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)"
  ).run(id, name, email, hashed);

  const token = jwt.sign({ id }, config.JWT_SECRET, { expiresIn: "30d" });
  res.status(201).json({
    token,
    user: { id, name, email, email_service_enabled: 0, punch_service_enabled: 1 },
  });
});

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ id: user.id }, config.JWT_SECRET, { expiresIn: "30d" });
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      email_service_enabled: user.email_service_enabled,
      punch_service_enabled: user.punch_service_enabled,
      shift_hours: user.shift_hours,
    },
  });
});

module.exports = router;

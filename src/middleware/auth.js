const jwt = require("jsonwebtoken");
const config = require("../config");
const db = require("../models/database");

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.JWT_SECRET);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.id);
    if (!user) return res.status(401).json({ error: "User not found" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { authenticate };

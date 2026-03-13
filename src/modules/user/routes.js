const express = require("express");
const { authenticate } = require("../../middleware/auth");
const db = require("../../models/database");

const router = express.Router();
router.use(authenticate);

// GET /api/user/profile
router.get("/profile", (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    name: u.name,
    email: u.email,
    email_service_enabled: !!u.email_service_enabled,
    punch_service_enabled: !!u.punch_service_enabled,
    gmail_configured: !!(u.gmail_email && u.gmail_app_password),
    shift_hours: u.shift_hours,
    created_at: u.created_at,
  });
});

// PUT /api/user/settings
router.put("/settings", (req, res) => {
  const { email_service_enabled, punch_service_enabled, shift_hours } = req.body;

  const updates = [];
  const values = [];

  if (email_service_enabled !== undefined) {
    updates.push("email_service_enabled = ?");
    values.push(email_service_enabled ? 1 : 0);
  }
  if (punch_service_enabled !== undefined) {
    updates.push("punch_service_enabled = ?");
    values.push(punch_service_enabled ? 1 : 0);
  }
  if (shift_hours !== undefined) {
    updates.push("shift_hours = ?");
    values.push(parseFloat(shift_hours));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No settings to update" });
  }

  updates.push("updated_at = datetime('now')");
  values.push(req.user.id);

  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  res.json({
    message: "Settings updated",
    settings: {
      email_service_enabled: !!user.email_service_enabled,
      punch_service_enabled: !!user.punch_service_enabled,
      shift_hours: user.shift_hours,
    },
  });
});

// PUT /api/user/gmail — configure Gmail credentials
router.put("/gmail", (req, res) => {
  const { gmail_email, gmail_app_password } = req.body;
  if (!gmail_email || !gmail_app_password) {
    return res.status(400).json({ error: "gmail_email and gmail_app_password are required" });
  }

  db.prepare(
    "UPDATE users SET gmail_email = ?, gmail_app_password = ?, email_service_enabled = 1, updated_at = datetime('now') WHERE id = ?"
  ).run(gmail_email, gmail_app_password, req.user.id);

  res.json({ message: "Gmail configured and email service enabled" });
});

module.exports = router;

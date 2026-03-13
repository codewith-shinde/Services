const express = require("express");
const { authenticate } = require("../../middleware/auth");
const { fetchEmails } = require("./service");
const db = require("../../models/database");

const router = express.Router();
router.use(authenticate);

// GET /api/emails — fetch & return emails
router.get("/", async (req, res) => {
  if (!req.user.email_service_enabled) {
    return res.status(403).json({ error: "Email service not enabled. Enable it in settings." });
  }

  if (!req.user.gmail_email || !req.user.gmail_app_password) {
    return res.status(400).json({ error: "Gmail credentials not configured. Update in settings." });
  }

  try {
    const max = parseInt(req.query.max) || 15;
    const emails = await fetchEmails(req.user.gmail_email, req.user.gmail_app_password, max);

    // Cache in DB
    const upsert = db.prepare(`
      INSERT OR REPLACE INTO emails_cache (id, user_id, message_id, subject, sender, date, snippet, body, is_unread, importance, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      for (const e of emails) {
        const id = `${req.user.id}-${e.message_id}`;
        upsert.run(id, req.user.id, e.message_id, e.subject, e.sender, e.date, e.snippet, e.body, e.is_unread ? 1 : 0, e.importance, e.category);
      }
    });
    tx();

    res.json({ emails, count: emails.length });
  } catch (err) {
    console.error("Email fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch emails: " + err.message });
  }
});

// GET /api/emails/cached — from local DB
router.get("/cached", (req, res) => {
  const emails = db
    .prepare("SELECT * FROM emails_cache WHERE user_id = ? ORDER BY date DESC LIMIT 50")
    .all(req.user.id);
  res.json({ emails, count: emails.length });
});

module.exports = router;

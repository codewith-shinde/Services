const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../../models/database");
const { authenticate } = require("../../middleware/auth");

const router = express.Router();
router.use(authenticate);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function calcExpectedOut(punchInISO, shiftHours) {
  const d = new Date(punchInISO);
  d.setMinutes(d.getMinutes() + shiftHours * 60);
  return d.toISOString();
}

function minutesBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 60000);
}

// POST /api/punch/in
router.post("/in", (req, res) => {
  const userId = req.user.id;
  const dateStr = today();
  const shiftHours = req.user.shift_hours || 9;

  // Check if already punched in today
  const existing = db
    .prepare("SELECT * FROM punch_records WHERE user_id = ? AND date = ? AND status = 'active'")
    .get(userId, dateStr);

  if (existing && !existing.punch_out) {
    return res.status(400).json({
      error: "Already punched in today",
      record: existing,
    });
  }

  const punchIn = req.body.time || nowISO();
  const expectedOut = calcExpectedOut(punchIn, shiftHours);
  const id = uuid();

  db.prepare(
    "INSERT INTO punch_records (id, user_id, date, punch_in, expected_out, status) VALUES (?, ?, ?, ?, ?, 'active')"
  ).run(id, userId, dateStr, punchIn, expectedOut);

  const record = db.prepare("SELECT * FROM punch_records WHERE id = ?").get(id);
  res.status(201).json({ record });
});

// POST /api/punch/out
router.post("/out", (req, res) => {
  const userId = req.user.id;
  const dateStr = today();

  const active = db
    .prepare("SELECT * FROM punch_records WHERE user_id = ? AND date = ? AND punch_out IS NULL AND status = 'active'")
    .get(userId, dateStr);

  if (!active) {
    return res.status(400).json({ error: "No active punch-in found for today" });
  }

  const punchOut = req.body.time || nowISO();
  const workMins = minutesBetween(active.punch_in, punchOut);

  db.prepare(
    "UPDATE punch_records SET punch_out = ?, work_minutes = ?, status = 'completed', note = ? WHERE id = ?"
  ).run(punchOut, workMins, req.body.note || null, active.id);

  const record = db.prepare("SELECT * FROM punch_records WHERE id = ?").get(active.id);
  res.json({ record });
});

// GET /api/punch/status — today's status
router.get("/status", (req, res) => {
  const userId = req.user.id;
  const dateStr = today();

  const record = db
    .prepare("SELECT * FROM punch_records WHERE user_id = ? AND date = ? ORDER BY created_at DESC LIMIT 1")
    .get(userId, dateStr);

  if (!record) {
    return res.json({ status: "not_punched_in", record: null });
  }

  let remaining = null;
  if (record.punch_in && !record.punch_out) {
    const expectedOut = new Date(record.expected_out);
    const now = new Date();
    remaining = Math.max(0, Math.round((expectedOut - now) / 60000));
  }

  res.json({
    status: record.punch_out ? "punched_out" : "punched_in",
    record,
    remaining_minutes: remaining,
  });
});

// GET /api/punch/history?days=7
router.get("/history", (req, res) => {
  const userId = req.user.id;
  const days = parseInt(req.query.days) || 7;

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const records = db
    .prepare("SELECT * FROM punch_records WHERE user_id = ? AND date >= ? ORDER BY date DESC")
    .all(userId, sinceStr);

  res.json({ records, days });
});

// GET /api/punch/weekly — current week summary
router.get("/weekly", (req, res) => {
  const userId = req.user.id;

  // Get Monday of current week
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const mondayStr = monday.toISOString().slice(0, 10);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const sundayStr = sunday.toISOString().slice(0, 10);

  const records = db
    .prepare("SELECT * FROM punch_records WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date ASC")
    .all(userId, mondayStr, sundayStr);

  const totalMinutes = records.reduce((sum, r) => sum + (r.work_minutes || 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(2);
  const targetHours = (req.user.shift_hours || 9) * 5; // 5 working days
  const daysWorked = records.filter((r) => r.punch_out).length;

  res.json({
    week_start: mondayStr,
    week_end: sundayStr,
    records,
    total_minutes: totalMinutes,
    total_hours: parseFloat(totalHours),
    target_hours: targetHours,
    days_worked: daysWorked,
    remaining_hours: parseFloat((targetHours - totalMinutes / 60).toFixed(2)),
  });
});

module.exports = router;

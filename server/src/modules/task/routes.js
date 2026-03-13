const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../../models/database");
const { authenticate } = require("../../middleware/auth");

const router = express.Router();
router.use(authenticate);

// GET /api/tasks — all tasks for user
router.get("/", (req, res) => {
  const tasks = db
    .prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY position ASC, created_at DESC")
    .all(req.user.id);
  res.json({ tasks });
});

// POST /api/tasks — create task
router.post("/", (req, res) => {
  const { title, description, status, priority } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });

  const id = uuid();
  const col = status || "todo";
  const prio = priority || "medium";

  // Get max position in the target column
  const maxPos = db
    .prepare("SELECT MAX(position) as mx FROM tasks WHERE user_id = ? AND status = ?")
    .get(req.user.id, col);
  const position = (maxPos?.mx ?? -1) + 1;

  db.prepare(
    "INSERT INTO tasks (id, user_id, title, description, status, priority, position) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, req.user.id, title, description || "", col, prio, position);

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  res.status(201).json({ task });
});

// PUT /api/tasks/:id — update task
router.put("/:id", (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const { title, description, priority } = req.body;
  const updates = [];
  const values = [];

  if (title !== undefined) { updates.push("title = ?"); values.push(title); }
  if (description !== undefined) { updates.push("description = ?"); values.push(description); }
  if (priority !== undefined) { updates.push("priority = ?"); values.push(priority); }

  if (updates.length === 0) return res.status(400).json({ error: "Nothing to update" });

  updates.push("updated_at = datetime('now')");
  values.push(req.params.id, req.user.id);

  db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`).run(...values);
  const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  res.json({ task: updated });
});

// PUT /api/tasks/:id/move — move task to different column
router.put("/:id/move", (req, res) => {
  const { status, position } = req.body;
  if (!status) return res.status(400).json({ error: "status is required" });

  const task = db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const pos = position !== undefined ? position : 0;

  db.prepare(
    "UPDATE tasks SET status = ?, position = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(status, pos, req.params.id, req.user.id);

  const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  res.json({ task: updated });
});

// DELETE /api/tasks/:id
router.delete("/:id", (req, res) => {
  const result = db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: "Task not found" });
  res.json({ success: true });
});

module.exports = router;

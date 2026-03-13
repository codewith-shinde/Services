/* ═══════════════════════════════════════════════
   WorkHub — Premium SaaS Frontend
   ═══════════════════════════════════════════════ */

/* ─── State ─── */
let token = localStorage.getItem("token");
let user = JSON.parse(localStorage.getItem("user") || "null");
let activeTab = "punch";
let punchStatus = null;
let weeklyData = null;
let emails = [];
let selectedEmail = null;
let allTasks = [];
let draggedTaskId = null;
let clockInterval = null;

const $ = (s) => document.querySelector(s);
const app = () => document.getElementById("app");

/* ─── API ─── */
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/* ─── Toast ─── */
function toast(msg, isError = false) {
  const el = document.createElement("div");
  el.className = `toast${isError ? " error" : ""}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(8px)"; }, 2500);
  setTimeout(() => el.remove(), 3000);
}

/* ─── Skeleton ─── */
function skeleton(count = 3) {
  let h = "";
  for (let i = 0; i < count; i++) h += `<div class="skeleton skeleton-card"></div>`;
  return `<div style="padding:8px">${h}</div>`;
}

/* ─── Escape HTML ─── */
function escHtml(s) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ─── Router ─── */
function render() {
  clearInterval(clockInterval);
  if (!token || !user) renderAuth();
  else renderDashboard();
}

/* ═══════════════════════════════════════════════
   AUTH SCREEN
   ═══════════════════════════════════════════════ */
function renderAuth() {
  let isLogin = true;
  function draw() {
    app().innerHTML = `
      <div class="bg-anim"><div class="orb orb-1"></div><div class="orb orb-2"></div><div class="orb orb-3"></div></div>
      <div class="auth-screen">
        <div class="auth-box">
          <div class="logo">WorkHub</div>
          <div class="logo-sub">Track your time. Stay focused.</div>
          <div class="auth-tabs">
            <button class="auth-tab ${isLogin ? "active" : ""}" onclick="window._authTab(true)">Sign in</button>
            <button class="auth-tab ${!isLogin ? "active" : ""}" onclick="window._authTab(false)">Sign up</button>
          </div>
          ${!isLogin ? `<div class="form-group"><label>Name</label><input id="a-name" placeholder="Your name" /></div>` : ""}
          <div class="form-group"><label>Email</label><input id="a-email" type="email" placeholder="you@example.com" /></div>
          <div class="form-group"><label>Password</label><input id="a-pass" type="password" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;" /></div>
          <button class="btn btn-primary" style="width:100%;margin-top:8px;padding:12px" onclick="window._authSubmit()">${isLogin ? "Sign in" : "Create account"}</button>
        </div>
      </div>`;
  }
  window._authTab = (v) => { isLogin = v; draw(); };
  window._authSubmit = async () => {
    try {
      const email = $("#a-email").value;
      const password = $("#a-pass").value;
      if (!isLogin) {
        const name = $("#a-name").value;
        const data = await api("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
        token = data.token; user = data.user;
      } else {
        const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        token = data.token; user = data.user;
      }
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      render();
    } catch (e) { toast(e.message, true); }
  };
  draw();
}

/* ═══════════════════════════════════════════════
   DASHBOARD LAYOUT (Sidebar + Main)
   ═══════════════════════════════════════════════ */
function renderDashboard() {
  const initials = (user.name || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  app().innerHTML = `
    <div class="bg-anim"><div class="orb orb-1"></div><div class="orb orb-2"></div><div class="orb orb-3"></div></div>
    <div class="app-layout">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo">
          <h1>WorkHub</h1>
          <span>Time & Productivity</span>
        </div>
        <nav class="sidebar-nav">
          <button class="nav-item ${activeTab === "punch" ? "active" : ""}" onclick="window._tab('punch')">
            <span class="nav-icon">&#9201;</span> Punch Clock
          </button>
          <button class="nav-item ${activeTab === "tasks" ? "active" : ""}" onclick="window._tab('tasks')">
            <span class="nav-icon">&#9744;</span> Task Board
          </button>
          ${user.email_service_enabled ? `
          <button class="nav-item ${activeTab === "emails" ? "active" : ""}" onclick="window._tab('emails')">
            <span class="nav-icon">&#9993;</span> Emails
          </button>` : ""}
          <button class="nav-item ${activeTab === "game" ? "active" : ""}" onclick="window._tab('game')">
            <span class="nav-icon">&#9889;</span> Snake Game
          </button>
          <div style="flex:1"></div>
          <button class="nav-item ${activeTab === "settings" ? "active" : ""}" onclick="window._tab('settings')">
            <span class="nav-icon">&#9881;</span> Settings
          </button>
        </nav>
        <div class="sidebar-footer">
          <div class="sidebar-user" onclick="window._logout()">
            <div class="sidebar-avatar">${initials}</div>
            <div class="sidebar-user-info">
              <div class="sidebar-user-name">${escHtml(user.name || "User")}</div>
              <div class="sidebar-user-email">${escHtml(user.email || "")}</div>
            </div>
          </div>
        </div>
      </aside>
      <main class="main" id="main-content"></main>
    </div>
    <div class="overlay" id="overlay" onclick="window._closeEmail()"></div>
    <div class="email-panel" id="email-panel"></div>`;

  window._tab = (t) => {
    activeTab = t;
    // Update nav active states
    document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
    const idx = { punch: 0, tasks: 1, emails: 2, game: user.email_service_enabled ? 3 : 2, settings: -1 };
    document.querySelectorAll(".nav-item").forEach(el => {
      if (el.textContent.toLowerCase().includes(t === "punch" ? "punch" : t === "tasks" ? "task" : t === "game" ? "snake" : t)) el.classList.add("active");
    });
    renderTab();
  };
  window._logout = () => {
    if (!confirm("Sign out?")) return;
    token = null; user = null; localStorage.clear(); render();
  };
  renderTab();
}

function renderTab() {
  const c = document.getElementById("main-content");
  if (!c) return;
  clearInterval(clockInterval);
  c.innerHTML = ""; // Clear first
  if (activeTab === "punch") renderPunchTab(c);
  else if (activeTab === "emails") renderEmailTab(c);
  else if (activeTab === "tasks") renderTasksTab(c);
  else if (activeTab === "game") renderGameTab(c);
  else if (activeTab === "settings") renderSettingsTab(c);
}

/* ═══════════════════════════════════════════════
   PUNCH TAB
   ═══════════════════════════════════════════════ */
async function renderPunchTab(container) {
  container.innerHTML = `<div class="page-enter">${skeleton(4)}</div>`;

  try {
    const [statusRes, weeklyRes] = await Promise.all([api("/punch/status"), api("/punch/weekly")]);
    punchStatus = statusRes;
    weeklyData = weeklyRes;
  } catch {
    punchStatus = { status: "not_punched_in", record: null };
    weeklyData = { records: [], total_hours: 0, target_hours: 45, days_worked: 0, remaining_hours: 45 };
  }
  drawPunchTab(container);
}

function drawPunchTab(container) {
  const isPunchedIn = punchStatus.status === "punched_in";
  const record = punchStatus.record;
  const remaining = punchStatus.remaining_minutes;
  const w = weeklyData;
  const now = new Date();

  const weekDays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const mondayDate = new Date(w.week_start + "T00:00:00");

  // Weekly bar cards
  let weekHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayRecord = (w.records || []).find(r => r.date === dateStr);
    const hours = dayRecord ? (dayRecord.work_minutes / 60).toFixed(1) : "0";
    const pct = dayRecord ? Math.min(100, (dayRecord.work_minutes / ((user.shift_hours || 9) * 60)) * 100) : 0;
    const isToday = dateStr === now.toISOString().slice(0, 10);
    const isCompleted = dayRecord && dayRecord.punch_out;
    weekHTML += `
      <div class="week-day ${isToday ? "today" : ""} ${isCompleted ? "completed" : ""}">
        <div class="day-name">${weekDays[i]}</div>
        <div class="day-hours">${hours}h</div>
        <div class="day-bar"><div class="day-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
  }

  // Countdown ring
  let ringHTML = "";
  if (isPunchedIn && remaining !== null) {
    const totalMins = (user.shift_hours || 9) * 60;
    const worked = totalMins - remaining;
    const pct = Math.min(100, (worked / totalMins) * 100);
    const circ = 2 * Math.PI * 70;
    const offset = circ - (pct / 100) * circ;
    const hrs = Math.floor(remaining / 60);
    const mins = remaining % 60;
    ringHTML = `
      <div class="countdown-ring">
        <svg viewBox="0 0 160 160">
          <circle class="track" cx="80" cy="80" r="70" />
          <circle class="progress" cx="80" cy="80" r="70" stroke-dasharray="${circ}" stroke-dashoffset="${offset}" />
        </svg>
        <div class="center-text">
          <div class="time-left">${hrs}h ${mins}m</div>
          <div class="time-label">remaining</div>
        </div>
      </div>`;
  }

  // Punch info
  let punchInfoHTML = "";
  if (record) {
    const pIn = record.punch_in ? new Date(record.punch_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
    const eOut = record.expected_out ? new Date(record.expected_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
    const pOut = record.punch_out ? new Date(record.punch_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
    punchInfoHTML = `
      <div class="punch-info">
        <div class="punch-info-item"><div class="label">Punch In</div><div class="value">${pIn}</div></div>
        <div class="punch-info-item"><div class="label">Expected Out</div><div class="value">${eOut}</div></div>
        <div class="punch-info-item"><div class="label">${record.punch_out ? "Punch Out" : "Status"}</div><div class="value">${record.punch_out ? pOut : "Active"}</div></div>
      </div>`;
  }

  container.innerHTML = `
    <div class="page-enter">
      <div class="page-header">
        <div>
          <div class="page-title">Punch Clock</div>
          <div class="page-subtitle">Track your daily work hours</div>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Hours Today</div>
          <div class="stat-value">${record && record.work_minutes ? (record.work_minutes / 60).toFixed(1) : "0"}h</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">This Week</div>
          <div class="stat-value">${w.total_hours}h</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Days Worked</div>
          <div class="stat-value">${w.days_worked}/5</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Remaining</div>
          <div class="stat-value">${Math.max(0, w.remaining_hours)}h</div>
        </div>
      </div>

      <div class="grid-main">
        <div class="card">
          <div class="punch-hero">
            <div class="punch-time" id="live-clock">${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
            <div class="punch-date">${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
            ${isPunchedIn
              ? `<div class="punch-status active"><div class="dot"></div>Punched In</div>`
              : punchStatus.status === "punched_out"
              ? `<div class="punch-status inactive"><div class="dot"></div>Shift Complete</div>`
              : `<div class="punch-status inactive"><div class="dot"></div>Not Punched In</div>`}
            ${ringHTML}
            ${!isPunchedIn && punchStatus.status !== "punched_out" ? `
            <div class="time-input-group">
              <label>Punch-in time</label>
              <input type="time" id="punch-time-input" value="${now.toTimeString().slice(0,5)}" />
            </div>` : ""}
            <div class="punch-actions">
              <button class="punch-btn in" ${isPunchedIn ? "disabled" : ""} onclick="window._punchIn()">Punch In</button>
              <button class="punch-btn out" ${!isPunchedIn ? "disabled" : ""} onclick="window._punchOut()">Punch Out</button>
            </div>
            ${punchInfoHTML}
          </div>
        </div>
        <div>
          <div class="card">
            <div class="card-title">Weekly Overview</div>
            <div class="weekly-grid">${weekHTML}</div>
          </div>
        </div>
      </div>
    </div>`;

  clockInterval = setInterval(() => {
    const el = document.getElementById("live-clock");
    if (el) el.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }, 1000);

  window._punchIn = async () => {
    try {
      const timeInput = document.getElementById("punch-time-input");
      let body = {};
      if (timeInput && timeInput.value) {
        const [h, m] = timeInput.value.split(":");
        const d = new Date();
        d.setHours(parseInt(h), parseInt(m), 0, 0);
        body.time = d.toISOString();
      }
      await api("/punch/in", { method: "POST", body: JSON.stringify(body) });
      toast("Punched in at " + (timeInput ? timeInput.value : "now"));
      renderPunchTab(container);
    } catch (e) { toast(e.message, true); }
  };

  window._punchOut = async () => {
    try {
      await api("/punch/out", { method: "POST", body: JSON.stringify({}) });
      toast("Punched out!");
      renderPunchTab(container);
    } catch (e) { toast(e.message, true); }
  };
}

/* ═══════════════════════════════════════════════
   EMAIL TAB
   ═══════════════════════════════════════════════ */
async function renderEmailTab(container) {
  container.innerHTML = `<div class="page-enter"><div class="page-header"><div><div class="page-title">Emails</div><div class="page-subtitle">Your recent inbox</div></div></div>${skeleton(5)}</div>`;
  try {
    const data = await api("/emails?max=20");
    emails = data.emails || [];
  } catch (e) {
    container.innerHTML = `<div class="page-enter"><div class="card"><div class="empty"><div class="empty-text">${e.message}</div></div></div></div>`;
    return;
  }

  if (!emails.length) {
    container.innerHTML = `<div class="page-enter"><div class="card"><div class="empty"><div class="empty-icon">&#9993;</div><div class="empty-text">No emails found</div></div></div></div>`;
    return;
  }

  let html = `<div class="page-enter"><div class="page-header"><div><div class="page-title">Emails</div><div class="page-subtitle">${emails.length} messages</div></div></div><div class="card">`;
  emails.forEach((em, i) => {
    const impClass = (em.importance || "medium").toLowerCase();
    html += `
      <div class="email-item" style="--i:${i}" onclick="window._openEmail('${em.message_id}')">
        <div class="email-dot ${em.is_unread ? "unread" : "read"}"></div>
        <div class="email-body">
          <div class="email-subject">${escHtml(em.subject)}</div>
          <div class="email-sender">${escHtml(em.sender)} &middot; ${em.date ? new Date(em.date).toLocaleDateString() : ""}</div>
        </div>
        <div class="email-badge ${impClass}">${em.importance}</div>
      </div>`;
  });
  html += `</div></div>`;
  container.innerHTML = html;

  window._openEmail = (msgId) => {
    const em = emails.find(e => e.message_id === msgId);
    if (!em) return;
    selectedEmail = em;
    const panel = document.getElementById("email-panel");
    const overlay = document.getElementById("overlay");
    panel.innerHTML = `
      <div class="email-panel-header">
        <h3>${escHtml(em.subject)}</h3>
        <button class="email-panel-close" onclick="window._closeEmail()">&times;</button>
      </div>
      <div class="email-panel-meta">
        <strong>From:</strong> ${escHtml(em.sender)}<br/>
        <strong>Date:</strong> ${em.date ? new Date(em.date).toLocaleString() : "Unknown"}<br/>
        <strong>Category:</strong> ${em.category} &middot; <strong>Importance:</strong> ${em.importance}
      </div>
      <div class="email-panel-body">${escHtml(em.body || em.snippet || "No content")}</div>`;
    panel.classList.add("open");
    overlay.classList.add("open");
  };
  window._closeEmail = () => {
    document.getElementById("email-panel").classList.remove("open");
    document.getElementById("overlay").classList.remove("open");
    selectedEmail = null;
  };
}

/* ═══════════════════════════════════════════════
   KANBAN TASKS TAB
   ═══════════════════════════════════════════════ */
async function renderTasksTab(container) {
  container.innerHTML = `<div class="page-enter"><div class="page-header"><div><div class="page-title">Task Board</div><div class="page-subtitle">Organize your work</div></div></div>${skeleton(3)}</div>`;
  try {
    const data = await api("/tasks");
    allTasks = data.tasks || [];
  } catch { allTasks = []; }
  drawKanban(container);
}

function drawKanban(container) {
  const columns = [
    { id: "todo", label: "To Do" },
    { id: "in_progress", label: "In Progress" },
    { id: "done", label: "Done" },
  ];

  let html = `<div class="page-enter"><div class="page-header"><div><div class="page-title">Task Board</div><div class="page-subtitle">${allTasks.length} tasks</div></div><button class="btn btn-primary btn-sm" onclick="window._addTask('todo')">+ New Task</button></div><div class="kanban">`;
  for (const col of columns) {
    const tasks = allTasks.filter(t => t.status === col.id);
    html += `
      <div class="kanban-col" id="col-${col.id}"
        ondragover="window._kanbanDragOver(event)"
        ondragleave="window._kanbanDragLeave(event)"
        ondrop="window._kanbanDrop(event, '${col.id}')">
        <div class="kanban-col-header">
          <span class="kanban-col-title">${col.label}</span>
          <span class="kanban-col-count">${tasks.length}</span>
        </div>`;
    for (const task of tasks) {
      html += `
        <div class="kanban-card" draggable="true" id="task-${task.id}"
          ondragstart="window._kanbanDragStart(event, '${task.id}')"
          ondragend="window._kanbanDragEnd(event)">
          <div class="kanban-card-title">${escHtml(task.title)}</div>
          ${task.description ? `<div class="kanban-card-desc">${escHtml(task.description)}</div>` : ""}
          <div class="kanban-card-footer">
            <span class="kanban-card-prio ${task.priority}">${task.priority}</span>
            <div class="kanban-card-actions">
              <button onclick="window._editTask('${task.id}')" title="Edit">&#9998;</button>
              <button onclick="window._deleteTask('${task.id}')" title="Delete">&times;</button>
            </div>
          </div>
        </div>`;
    }
    html += `<button class="kanban-add" onclick="window._addTask('${col.id}')">+ Add task</button></div>`;
  }
  html += `</div></div>`;
  container.innerHTML = html;

  window._kanbanDragStart = (e, id) => { draggedTaskId = id; e.target.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; };
  window._kanbanDragEnd = (e) => { e.target.classList.remove("dragging"); draggedTaskId = null; };
  window._kanbanDragOver = (e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); };
  window._kanbanDragLeave = (e) => { e.currentTarget.classList.remove("drag-over"); };
  window._kanbanDrop = async (e, newStatus) => {
    e.preventDefault(); e.currentTarget.classList.remove("drag-over");
    if (!draggedTaskId) return;
    try {
      await api(`/tasks/${draggedTaskId}/move`, { method: "PUT", body: JSON.stringify({ status: newStatus }) });
      const task = allTasks.find(t => t.id === draggedTaskId);
      if (task) task.status = newStatus;
      drawKanban(container);
      toast("Task moved");
    } catch (e) { toast(e.message, true); }
  };
  window._addTask = (status) => showTaskModal(null, status, container);
  window._editTask = (id) => { const t = allTasks.find(x => x.id === id); if (t) showTaskModal(t, t.status, container); };
  window._deleteTask = async (id) => {
    try {
      await api(`/tasks/${id}`, { method: "DELETE" });
      allTasks = allTasks.filter(t => t.id !== id);
      drawKanban(container);
      toast("Task deleted");
    } catch (e) { toast(e.message, true); }
  };
}

function showTaskModal(task, status, container) {
  const isEdit = !!task;
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div class="modal-box">
      <h3>${isEdit ? "Edit Task" : "New Task"}</h3>
      <div class="form-group"><label>Title</label><input id="task-title" value="${isEdit ? escHtml(task.title) : ""}" placeholder="What needs to be done?" /></div>
      <div class="form-group"><label>Description</label><input id="task-desc" value="${isEdit ? escHtml(task.description || "") : ""}" placeholder="Add details..." /></div>
      <div class="form-group"><label>Priority</label>
        <select id="task-prio">
          <option value="low" ${isEdit && task.priority === "low" ? "selected" : ""}>Low</option>
          <option value="medium" ${!isEdit || task?.priority === "medium" ? "selected" : ""}>Medium</option>
          <option value="high" ${isEdit && task.priority === "high" ? "selected" : ""}>High</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="this.closest('.modal').remove()">Cancel</button>
        <button class="btn btn-primary" id="task-save-btn">${isEdit ? "Save" : "Create"}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById("task-title").focus();

  document.getElementById("task-save-btn").onclick = async () => {
    const title = document.getElementById("task-title").value.trim();
    if (!title) { toast("Title required", true); return; }
    const description = document.getElementById("task-desc").value.trim();
    const priority = document.getElementById("task-prio").value;
    try {
      if (isEdit) {
        await api(`/tasks/${task.id}`, { method: "PUT", body: JSON.stringify({ title, description, priority }) });
        Object.assign(task, { title, description, priority });
      } else {
        const data = await api("/tasks", { method: "POST", body: JSON.stringify({ title, description, priority, status }) });
        allTasks.push(data.task);
      }
      modal.remove(); drawKanban(container);
      toast(isEdit ? "Task updated" : "Task created");
    } catch (e) { toast(e.message, true); }
  };
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("task-save-btn").click();
    if (e.key === "Escape") modal.remove();
  });
}

/* ═══════════════════════════════════════════════
   SNAKE GAME TAB
   ═══════════════════════════════════════════════ */
function renderGameTab(container) {
  container.innerHTML = `
    <div class="page-enter">
      <div class="page-header"><div><div class="page-title">Snake Game</div><div class="page-subtitle">Take a break</div></div></div>
      <div class="card" style="text-align:center">
        <div style="display:flex;align-items:center;justify-content:center;gap:24px;margin-bottom:16px">
          <div style="font-size:13px;color:var(--text3)">Score <strong id="snake-score" style="color:#fff;font-size:20px;margin-left:4px">0</strong></div>
          <div style="font-size:13px;color:var(--text3)">Best <strong id="snake-best" style="color:var(--green);font-size:20px;margin-left:4px">${localStorage.getItem("snakeBest") || 0}</strong></div>
        </div>
        <canvas id="snake-canvas" width="400" height="400"
          style="border:1px solid var(--border);border-radius:var(--radius-sm);background:#09090b;display:block;margin:0 auto"></canvas>
        <div style="margin-top:16px;display:flex;gap:8px;justify-content:center">
          <button class="btn btn-primary" id="snake-start-btn" onclick="window._snakeStart()">Start Game</button>
          <button class="btn" onclick="window._snakePause()">Pause</button>
        </div>
        <div style="margin-top:12px">
          <div style="display:flex;gap:6px;justify-content:center">
            <button class="btn btn-icon" onclick="window._snakeDir('up')">&#9650;</button>
          </div>
          <div style="display:flex;gap:6px;justify-content:center;margin-top:4px">
            <button class="btn btn-icon" onclick="window._snakeDir('left')">&#9664;</button>
            <button class="btn btn-icon" onclick="window._snakeDir('down')">&#9660;</button>
            <button class="btn btn-icon" onclick="window._snakeDir('right')">&#9654;</button>
          </div>
        </div>
        <p style="margin-top:12px;font-size:11px;color:var(--text4)">Arrow keys or WASD to move</p>
      </div>
    </div>`;

  const canvas = document.getElementById("snake-canvas");
  const ctx = canvas.getContext("2d");
  const grid = 20, cols = canvas.width / grid, rows = canvas.height / grid;
  let snake, food, dir, nextDir, score, gameLoop, paused, gameOver;

  function init() { snake = [{x:10,y:10},{x:9,y:10},{x:8,y:10}]; dir="right"; nextDir="right"; score=0; paused=false; gameOver=false; placeFood(); updateScore(); }
  function placeFood() { do { food={x:Math.floor(Math.random()*cols),y:Math.floor(Math.random()*rows)}; } while(snake.some(s=>s.x===food.x&&s.y===food.y)); }
  function updateScore() { const el=document.getElementById("snake-score"); if(el) el.textContent=score; }

  function draw() {
    ctx.fillStyle="#09090b"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle="rgba(255,255,255,0.02)"; ctx.lineWidth=0.5;
    for(let i=0;i<cols;i++){ctx.beginPath();ctx.moveTo(i*grid,0);ctx.lineTo(i*grid,canvas.height);ctx.stroke();}
    for(let i=0;i<rows;i++){ctx.beginPath();ctx.moveTo(0,i*grid);ctx.lineTo(canvas.width,i*grid);ctx.stroke();}
    // Food
    const fx=food.x*grid+grid/2,fy=food.y*grid+grid/2;
    const glow=ctx.createRadialGradient(fx,fy,2,fx,fy,grid/2+4);
    glow.addColorStop(0,"#fff"); glow.addColorStop(0.5,"rgba(255,255,255,0.3)"); glow.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle=glow; ctx.fillRect(food.x*grid-4,food.y*grid-4,grid+8,grid+8);
    ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(fx,fy,grid/2-2,0,Math.PI*2); ctx.fill();
    // Snake
    snake.forEach((seg,i)=>{
      const a=1-(i/snake.length)*0.6;
      ctx.fillStyle=i===0?"#fff":"rgba(255,255,255,"+a+")";
      if(i===0){ctx.shadowColor="rgba(255,255,255,0.4)";ctx.shadowBlur=8;}else{ctx.shadowBlur=0;}
      ctx.beginPath();
      const r=i===0?4:3,sx=seg.x*grid+1,sy=seg.y*grid+1,sw=grid-2,sh=grid-2;
      ctx.moveTo(sx+r,sy);ctx.lineTo(sx+sw-r,sy);ctx.quadraticCurveTo(sx+sw,sy,sx+sw,sy+r);
      ctx.lineTo(sx+sw,sy+sh-r);ctx.quadraticCurveTo(sx+sw,sy+sh,sx+sw-r,sy+sh);
      ctx.lineTo(sx+r,sy+sh);ctx.quadraticCurveTo(sx,sy+sh,sx,sy+sh-r);
      ctx.lineTo(sx,sy+r);ctx.quadraticCurveTo(sx,sy,sx+r,sy);ctx.fill();
    });
    ctx.shadowBlur=0;
    if(gameOver){
      ctx.fillStyle="rgba(0,0,0,0.7)";ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle="#fff";ctx.font="700 24px Inter,sans-serif";ctx.textAlign="center";
      ctx.fillText("GAME OVER",canvas.width/2,canvas.height/2-8);
      ctx.font="400 13px Inter,sans-serif";ctx.fillStyle="#888";
      ctx.fillText("Score: "+score+"  |  Press Start",canvas.width/2,canvas.height/2+16);
    }
  }

  function tick() {
    if(paused||gameOver)return; dir=nextDir;
    const head={...snake[0]};
    if(dir==="up")head.y--;else if(dir==="down")head.y++;else if(dir==="left")head.x--;else head.x++;
    if(head.x<0)head.x=cols-1;if(head.x>=cols)head.x=0;if(head.y<0)head.y=rows-1;if(head.y>=rows)head.y=0;
    if(snake.some(s=>s.x===head.x&&s.y===head.y)){
      gameOver=true;clearInterval(gameLoop);
      const best=parseInt(localStorage.getItem("snakeBest")||"0");
      if(score>best){localStorage.setItem("snakeBest",score);const b=document.getElementById("snake-best");if(b)b.textContent=score;}
      draw();return;
    }
    snake.unshift(head);
    if(head.x===food.x&&head.y===food.y){score++;updateScore();placeFood();}else{snake.pop();}
    draw();
  }

  const keyMap={ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right",w:"up",s:"down",a:"left",d:"right"};
  const opp={up:"down",down:"up",left:"right",right:"left"};
  function handleKey(e){const nd=keyMap[e.key];if(nd&&nd!==opp[dir]){nextDir=nd;e.preventDefault();}}
  document.addEventListener("keydown",handleKey);
  window._snakeDir=(d)=>{if(d!==opp[dir])nextDir=d;};
  window._snakeStart=()=>{clearInterval(gameLoop);init();draw();gameLoop=setInterval(tick,100);document.getElementById("snake-start-btn").textContent="Restart";};
  window._snakePause=()=>{paused=!paused;};
  init(); draw();
}

/* ═══════════════════════════════════════════════
   SETTINGS TAB
   ═══════════════════════════════════════════════ */
function renderSettingsTab(container) {
  container.innerHTML = `
    <div class="page-enter">
      <div class="page-header"><div><div class="page-title">Settings</div><div class="page-subtitle">Configure your workspace</div></div></div>
      <div class="settings-grid">
        <div class="card">
          <div class="card-title">Modules</div>
          <div class="setting-row">
            <div><div class="setting-label">Punch In/Out</div><div class="setting-desc">Track daily working hours</div></div>
            <button class="toggle on" disabled></button>
          </div>
          <div class="setting-row">
            <div><div class="setting-label">Email Service</div><div class="setting-desc">Fetch and classify Gmail</div></div>
            <button class="toggle ${user.email_service_enabled ? "on" : ""}" id="toggle-email" onclick="window._toggleEmail()"></button>
          </div>
          <div class="setting-row">
            <div><div class="setting-label">Shift Hours</div><div class="setting-desc">Daily shift duration</div></div>
            <div style="display:flex;gap:8px;align-items:center">
              <input id="shift-input" type="number" value="${user.shift_hours || 9}" min="1" max="24" step="0.5"
                style="width:60px;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-xs);color:#fff;font-family:inherit;text-align:center;font-size:14px;outline:none" />
              <button class="btn btn-sm" onclick="window._saveShift()">Save</button>
            </div>
          </div>
        </div>
        <div class="card" id="gmail-settings">
          <div class="card-title">Gmail Configuration</div>
          ${user.email_service_enabled ? `
            <div class="form-group"><label>Gmail Email</label><input id="gmail-email" type="email" placeholder="you@gmail.com" value="${user.gmail_email || ""}" /></div>
            <div class="form-group"><label>App Password</label><input id="gmail-pass" type="password" placeholder="Gmail App Password" /></div>
            <button class="btn btn-primary btn-sm" onclick="window._saveGmail()">Save Gmail</button>
            <p style="margin-top:10px;font-size:11px;color:var(--text4)">myaccount.google.com > Security > 2FA > App Passwords</p>
          ` : `<div class="empty"><div class="empty-text">Enable Email Service first</div></div>`}
        </div>
      </div>
    </div>`;

  window._toggleEmail = async () => {
    try {
      const v = !user.email_service_enabled;
      await api("/user/settings", { method: "PUT", body: JSON.stringify({ email_service_enabled: v }) });
      user.email_service_enabled = v;
      localStorage.setItem("user", JSON.stringify(user));
      toast(v ? "Email enabled" : "Email disabled");
      renderDashboard(); activeTab = "settings"; renderTab();
    } catch (e) { toast(e.message, true); }
  };
  window._saveShift = async () => {
    try {
      const h = parseFloat(document.getElementById("shift-input").value);
      await api("/user/settings", { method: "PUT", body: JSON.stringify({ shift_hours: h }) });
      user.shift_hours = h;
      localStorage.setItem("user", JSON.stringify(user));
      toast("Shift updated to " + h + "h");
    } catch (e) { toast(e.message, true); }
  };
  window._saveGmail = async () => {
    try {
      const gmail_email = document.getElementById("gmail-email").value;
      const gmail_app_password = document.getElementById("gmail-pass").value;
      await api("/user/gmail", { method: "PUT", body: JSON.stringify({ gmail_email, gmail_app_password }) });
      user.gmail_email = gmail_email;
      localStorage.setItem("user", JSON.stringify(user));
      toast("Gmail configured");
    } catch (e) { toast(e.message, true); }
  };
}

/* ─── Keyboard ─── */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window._closeEmail && window._closeEmail();
});

/* ─── Init ─── */
render();

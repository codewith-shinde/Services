/* ─── State ─── */
let token = localStorage.getItem("token");
let user = JSON.parse(localStorage.getItem("user") || "null");
let activeTab = "punch";
let punchStatus = null;
let weeklyData = null;
let emails = [];
let selectedEmail = null;
let clockInterval = null;
let countdownInterval = null;

const $ = (s) => document.querySelector(s);
const app = () => document.getElementById("app");

/* ─── API Helper ─── */
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
  setTimeout(() => el.remove(), 3000);
}

/* ─── Router ─── */
function render() {
  clearInterval(clockInterval);
  clearInterval(countdownInterval);
  if (!token || !user) {
    renderAuth();
  } else {
    renderDashboard();
  }
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
          <h2>WorkHub</h2>
          <p>Punch tracker & email assistant</p>
          <div class="auth-tabs">
            <button class="auth-tab ${isLogin ? "active" : ""}" onclick="window._authTab(true)">Login</button>
            <button class="auth-tab ${!isLogin ? "active" : ""}" onclick="window._authTab(false)">Register</button>
          </div>
          ${!isLogin ? `<div class="form-group"><label>Name</label><input id="a-name" placeholder="Your name" /></div>` : ""}
          <div class="form-group"><label>Email</label><input id="a-email" type="email" placeholder="you@example.com" /></div>
          <div class="form-group"><label>Password</label><input id="a-pass" type="password" placeholder="Password" /></div>
          <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="window._authSubmit()">${isLogin ? "Login" : "Create Account"}</button>
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
   DASHBOARD
   ═══════════════════════════════════════════════ */
function renderDashboard() {
  app().innerHTML = `
    <div class="bg-anim"><div class="orb orb-1"></div><div class="orb orb-2"></div><div class="orb orb-3"></div></div>
    <div class="container">
      <div class="header">
        <h1>WorkHub <span>/ ${user.name || "User"}</span></h1>
        <div class="header-actions">
          <button class="btn btn-sm" onclick="window._tab('punch')">Punch</button>
          ${user.email_service_enabled ? `<button class="btn btn-sm" onclick="window._tab('emails')">Emails</button>` : ""}
          <button class="btn btn-sm btn-green" onclick="window._tab('game')">Snake</button>
          <button class="btn btn-sm" onclick="window._tab('settings')">Settings</button>
          <button class="btn btn-sm btn-danger" onclick="window._logout()">Logout</button>
        </div>
      </div>
      <div id="tab-content"></div>
    </div>
    <div class="overlay" id="overlay" onclick="window._closeEmail()"></div>
    <div class="email-panel" id="email-panel"></div>`;

  window._tab = (t) => { activeTab = t; renderTab(); };
  window._logout = () => { token = null; user = null; localStorage.clear(); render(); };
  renderTab();
}

function renderTab() {
  const c = document.getElementById("tab-content");
  if (!c) return;
  if (activeTab === "punch") renderPunchTab(c);
  else if (activeTab === "emails") renderEmailTab(c);
  else if (activeTab === "game") renderGameTab(c);
  else if (activeTab === "settings") renderSettingsTab(c);
}

/* ═══════════════════════════════════════════════
   PUNCH TAB
   ═══════════════════════════════════════════════ */
async function renderPunchTab(container) {
  container.innerHTML = `<div class="card"><div class="empty"><div class="empty-text">Loading...</div></div></div>`;

  try {
    const [statusRes, weeklyRes] = await Promise.all([api("/punch/status"), api("/punch/weekly")]);
    punchStatus = statusRes;
    weeklyData = weeklyRes;
  } catch (e) {
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
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const todayDow = now.getDay();

  // Build weekly day cards
  const weekDays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const mondayDate = new Date(w.week_start + "T00:00:00");

  let weekHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayRecord = (w.records || []).find((r) => r.date === dateStr);
    const hours = dayRecord ? (dayRecord.work_minutes / 60).toFixed(1) : "0";
    const pct = dayRecord ? Math.min(100, (dayRecord.work_minutes / (9 * 60)) * 100) : 0;
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
    const circumference = 2 * Math.PI * 80;
    const offset = circumference - (pct / 100) * circumference;
    const hrs = Math.floor(remaining / 60);
    const mins = remaining % 60;

    ringHTML = `
      <div class="countdown-ring">
        <svg viewBox="0 0 180 180">
          <circle class="track" cx="90" cy="90" r="80" />
          <circle class="progress" cx="90" cy="90" r="80"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" />
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
        <div class="punch-info-item">
          <div class="label">Punch In</div>
          <div class="value">${pIn}</div>
        </div>
        <div class="punch-info-item">
          <div class="label">Expected Out</div>
          <div class="value">${eOut}</div>
        </div>
        <div class="punch-info-item">
          <div class="label">${record.punch_out ? "Punch Out" : "Status"}</div>
          <div class="value">${record.punch_out ? pOut : "Active"}</div>
        </div>
      </div>`;
  }

  container.innerHTML = `
    <div class="grid-3">
      <div>
        <div class="card" style="margin-bottom:20px">
          <div class="punch-hero">
            <div class="punch-time" id="live-clock">${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
            <div class="punch-date">${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
            ${isPunchedIn
              ? `<div class="punch-status active"><div class="dot"></div>Punched In</div>`
              : punchStatus.status === "punched_out"
              ? `<div class="punch-status inactive"><div class="dot"></div>Shift Complete</div>`
              : `<div class="punch-status inactive"><div class="dot"></div>Not Punched In</div>`
            }
            ${ringHTML}
            ${!isPunchedIn && punchStatus.status !== "punched_out" ? `
            <div style="margin-bottom:20px;display:flex;align-items:center;justify-content:center;gap:10px">
              <label style="font-size:13px;color:var(--text2)">Punch-in time:</label>
              <input type="time" id="punch-time-input" value="${new Date().toTimeString().slice(0,5)}"
                style="padding:10px 14px;background:rgba(255,255,255,0.04);border:1px solid var(--border);
                border-radius:var(--radius-sm);color:#fff;font-family:inherit;font-size:16px;font-weight:600;
                text-align:center;outline:none;width:140px" />
            </div>` : ""}
            <div class="punch-actions">
              <button class="punch-btn in" ${isPunchedIn ? "disabled" : ""} onclick="window._punchIn()">Punch In</button>
              <button class="punch-btn out" ${!isPunchedIn ? "disabled" : ""} onclick="window._punchOut()">Punch Out</button>
            </div>
            ${punchInfoHTML}
          </div>
        </div>

        <div class="card">
          <div class="card-title">This Week</div>
          <div class="weekly-summary">
            <div class="summary-item">
              <div class="s-label">Hours Worked</div>
              <div class="s-value">${w.total_hours}h</div>
            </div>
            <div class="summary-item">
              <div class="s-label">Target</div>
              <div class="s-value">${w.target_hours}h</div>
            </div>
            <div class="summary-item">
              <div class="s-label">Days Worked</div>
              <div class="s-value">${w.days_worked}/5</div>
            </div>
            <div class="summary-item">
              <div class="s-label">Remaining</div>
              <div class="s-value">${Math.max(0, w.remaining_hours)}h</div>
            </div>
          </div>
          <div class="weekly-grid">${weekHTML}</div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-title">Quick Actions</div>
          <button class="btn" style="width:100%;margin-bottom:10px" onclick="window._tab('settings')">Settings</button>
          ${user.email_service_enabled ? `<button class="btn" style="width:100%;margin-bottom:10px" onclick="window._tab('emails')">View Emails</button>` : ""}
          <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--border)">
            <div class="card-title" style="margin-bottom:12px">Shift Info</div>
            <div style="font-size:13px; color:var(--text2); line-height:1.8">
              <div>Shift Duration: <strong style="color:#fff">${user.shift_hours || 9}h</strong></div>
              <div>Email Service: <strong style="color:#fff">${user.email_service_enabled ? "Enabled" : "Disabled"}</strong></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  // Live clock
  clockInterval = setInterval(() => {
    const el = document.getElementById("live-clock");
    if (el) el.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }, 1000);

  // Punch actions
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
  container.innerHTML = `<div class="card"><div class="empty"><div class="empty-text">Fetching emails...</div></div></div>`;

  try {
    const data = await api("/emails?max=20");
    emails = data.emails || [];
  } catch (e) {
    container.innerHTML = `<div class="card"><div class="empty"><div class="empty-text">${e.message}</div></div></div>`;
    return;
  }

  if (emails.length === 0) {
    container.innerHTML = `<div class="card"><div class="empty"><div class="empty-icon">&#9993;</div><div class="empty-text">No emails found</div></div></div>`;
    return;
  }

  let html = `<div class="card"><div class="card-title">Recent Emails (${emails.length})</div>`;
  for (const em of emails) {
    const impClass = (em.importance || "medium").toLowerCase();
    html += `
      <div class="email-item" onclick="window._openEmail('${em.message_id}')">
        <div class="email-dot ${em.is_unread ? "unread" : "read"}"></div>
        <div class="email-body">
          <div class="email-subject">${escHtml(em.subject)}</div>
          <div class="email-sender">${escHtml(em.sender)} &middot; ${em.date ? new Date(em.date).toLocaleDateString() : ""}</div>
        </div>
        <div class="email-badge ${impClass}">${em.importance}</div>
      </div>`;
  }
  html += `</div>`;
  container.innerHTML = html;

  window._openEmail = (msgId) => {
    const em = emails.find((e) => e.message_id === msgId);
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
   SETTINGS TAB
   ═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════
   SNAKE GAME TAB
   ═══════════════════════════════════════════════ */
function renderGameTab(container) {
  container.innerHTML = `
    <div class="card" style="text-align:center">
      <div class="card-title">Snake Game</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:24px;margin-bottom:16px">
        <div style="font-size:14px;color:var(--text2)">Score: <strong id="snake-score" style="color:#fff;font-size:20px">0</strong></div>
        <div style="font-size:14px;color:var(--text2)">Best: <strong id="snake-best" style="color:var(--green);font-size:20px">${localStorage.getItem("snakeBest") || 0}</strong></div>
      </div>
      <canvas id="snake-canvas" width="400" height="400"
        style="border:1px solid var(--border);border-radius:var(--radius-sm);background:#0a0a0a;display:block;margin:0 auto"></canvas>
      <div style="margin-top:16px;display:flex;gap:10px;justify-content:center">
        <button class="btn btn-primary" id="snake-start-btn" onclick="window._snakeStart()">Start Game</button>
        <button class="btn" onclick="window._snakePause()">Pause</button>
      </div>
      <div style="margin-top:12px">
        <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn btn-sm" onclick="window._snakeDir('up')">&#9650;</button>
        </div>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:4px">
          <button class="btn btn-sm" onclick="window._snakeDir('left')">&#9664;</button>
          <button class="btn btn-sm" onclick="window._snakeDir('down')">&#9660;</button>
          <button class="btn btn-sm" onclick="window._snakeDir('right')">&#9654;</button>
        </div>
      </div>
      <p style="margin-top:12px;font-size:12px;color:var(--text3)">Use arrow keys or WASD to move</p>
    </div>`;

  const canvas = document.getElementById("snake-canvas");
  const ctx = canvas.getContext("2d");
  const grid = 20;
  const cols = canvas.width / grid;
  const rows = canvas.height / grid;

  let snake, food, dir, nextDir, score, gameLoop, paused, gameOver;

  function init() {
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    dir = "right"; nextDir = "right";
    score = 0; paused = false; gameOver = false;
    placeFood();
    updateScore();
  }

  function placeFood() {
    do {
      food = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
    } while (snake.some(s => s.x === food.x && s.y === food.y));
  }

  function updateScore() {
    const el = document.getElementById("snake-score");
    if (el) el.textContent = score;
  }

  function draw() {
    // Background
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines (subtle)
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i < cols; i++) {
      ctx.beginPath(); ctx.moveTo(i * grid, 0); ctx.lineTo(i * grid, canvas.height); ctx.stroke();
    }
    for (let i = 0; i < rows; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * grid); ctx.lineTo(canvas.width, i * grid); ctx.stroke();
    }

    // Food (glowing ball)
    const fx = food.x * grid + grid / 2;
    const fy = food.y * grid + grid / 2;
    const glow = ctx.createRadialGradient(fx, fy, 2, fx, fy, grid / 2 + 4);
    glow.addColorStop(0, "#ffffff");
    glow.addColorStop(0.5, "rgba(255,255,255,0.4)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(food.x * grid - 4, food.y * grid - 4, grid + 8, grid + 8);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(fx, fy, grid / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    // Snake
    snake.forEach((seg, i) => {
      const alpha = 1 - (i / snake.length) * 0.6;
      if (i === 0) {
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "rgba(255,255,255,0.5)";
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = "rgba(255,255,255," + alpha + ")";
        ctx.shadowBlur = 0;
      }
      const r = i === 0 ? 4 : 3;
      roundRect(ctx, seg.x * grid + 1, seg.y * grid + 1, grid - 2, grid - 2, r);
    });
    ctx.shadowBlur = 0;

    // Game over overlay
    if (gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";
      ctx.font = "700 28px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 10);
      ctx.font = "400 14px Inter, sans-serif";
      ctx.fillStyle = "#888";
      ctx.fillText("Score: " + score + "  |  Click Start to retry", canvas.width / 2, canvas.height / 2 + 20);
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.fill();
  }

  function tick() {
    if (paused || gameOver) return;
    dir = nextDir;

    const head = { ...snake[0] };
    if (dir === "up") head.y--;
    else if (dir === "down") head.y++;
    else if (dir === "left") head.x--;
    else if (dir === "right") head.x++;

    // Wall collision (wrap around)
    if (head.x < 0) head.x = cols - 1;
    if (head.x >= cols) head.x = 0;
    if (head.y < 0) head.y = rows - 1;
    if (head.y >= rows) head.y = 0;

    // Self collision
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
      gameOver = true;
      clearInterval(gameLoop);
      const best = parseInt(localStorage.getItem("snakeBest") || "0");
      if (score > best) {
        localStorage.setItem("snakeBest", score);
        const bel = document.getElementById("snake-best");
        if (bel) bel.textContent = score;
      }
      draw();
      return;
    }

    snake.unshift(head);

    // Eat food
    if (head.x === food.x && head.y === food.y) {
      score++;
      updateScore();
      placeFood();
    } else {
      snake.pop();
    }

    draw();
  }

  // Controls
  const keyMap = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
  const opposite = { up: "down", down: "up", left: "right", right: "left" };

  function handleKey(e) {
    const nd = keyMap[e.key];
    if (nd && nd !== opposite[dir]) {
      nextDir = nd;
      e.preventDefault();
    }
  }
  document.addEventListener("keydown", handleKey);

  window._snakeDir = (d) => {
    if (d !== opposite[dir]) nextDir = d;
  };

  window._snakeStart = () => {
    clearInterval(gameLoop);
    init();
    draw();
    gameLoop = setInterval(tick, 100);
    document.getElementById("snake-start-btn").textContent = "Restart";
  };

  window._snakePause = () => {
    paused = !paused;
  };

  // Initial draw
  init();
  draw();
}

function renderSettingsTab(container) {
  container.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Module Settings</div>
        <div class="setting-row">
          <div>
            <div class="setting-label">Punch In/Out</div>
            <div class="setting-desc">Track your daily working hours</div>
          </div>
          <button class="toggle on" disabled></button>
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-label">Email Service</div>
            <div class="setting-desc">Fetch and classify Gmail emails</div>
          </div>
          <button class="toggle ${user.email_service_enabled ? "on" : ""}" id="toggle-email"
            onclick="window._toggleEmail()"></button>
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-label">Shift Hours</div>
            <div class="setting-desc">Your daily shift duration</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <input id="shift-input" type="number" value="${user.shift_hours || 9}" min="1" max="24" step="0.5"
              style="width:70px;padding:8px;background:rgba(255,255,255,0.04);border:1px solid var(--border);
              border-radius:8px;color:#fff;font-family:inherit;text-align:center;font-size:14px" />
            <button class="btn btn-sm" onclick="window._saveShift()">Save</button>
          </div>
        </div>
      </div>

      <div class="card" id="gmail-settings">
        <div class="card-title">Gmail Configuration</div>
        ${user.email_service_enabled ? `
          <div class="form-group">
            <label>Gmail Email</label>
            <input id="gmail-email" type="email" placeholder="you@gmail.com" value="${user.gmail_email || ""}" />
          </div>
          <div class="form-group">
            <label>App Password</label>
            <input id="gmail-pass" type="password" placeholder="Your Gmail App Password" />
          </div>
          <button class="btn btn-primary" onclick="window._saveGmail()">Save Gmail Config</button>
          <p style="margin-top:12px;font-size:11px;color:var(--text3)">
            Generate an App Password at myaccount.google.com > Security > 2FA > App Passwords
          </p>
        ` : `
          <div class="empty">
            <div class="empty-text">Enable Email Service to configure Gmail</div>
          </div>
        `}
      </div>
    </div>`;

  window._toggleEmail = async () => {
    try {
      const newVal = !user.email_service_enabled;
      await api("/user/settings", { method: "PUT", body: JSON.stringify({ email_service_enabled: newVal }) });
      user.email_service_enabled = newVal;
      localStorage.setItem("user", JSON.stringify(user));
      toast(newVal ? "Email service enabled" : "Email service disabled");
      renderDashboard();
      activeTab = "settings";
      renderTab();
    } catch (e) { toast(e.message, true); }
  };

  window._saveShift = async () => {
    try {
      const hours = parseFloat(document.getElementById("shift-input").value);
      await api("/user/settings", { method: "PUT", body: JSON.stringify({ shift_hours: hours }) });
      user.shift_hours = hours;
      localStorage.setItem("user", JSON.stringify(user));
      toast("Shift hours updated to " + hours + "h");
    } catch (e) { toast(e.message, true); }
  };

  window._saveGmail = async () => {
    try {
      const gmail_email = document.getElementById("gmail-email").value;
      const gmail_app_password = document.getElementById("gmail-pass").value;
      await api("/user/gmail", { method: "PUT", body: JSON.stringify({ gmail_email, gmail_app_password }) });
      user.gmail_email = gmail_email;
      localStorage.setItem("user", JSON.stringify(user));
      toast("Gmail configured successfully");
    } catch (e) { toast(e.message, true); }
  };
}

/* ─── Util ─── */
function escHtml(s) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ─── Keyboard shortcuts ─── */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    window._closeEmail && window._closeEmail();
  }
});

/* ─── Init ─── */
render();

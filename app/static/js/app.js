// ─── State ──────────────────────────────────────
let state = {
    authenticated: false,
    emails: [],
    meetings: [],
    notifications: [],
    unreadCount: 0,
    loading: { emails: false, meetings: false, digest: false },
    initialized: false,
    // Calendar state
    calYear: new Date().getFullYear(),
    calMonth: new Date().getMonth(),
    calSelectedDate: null,
    calReminders: [],
    calReminderDates: [],
    showAddReminder: false,
    reminderColor: "#ffffff",
    // Email detail
    openEmail: null,
    openEmailFull: null,
    loadingEmailDetail: false,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Custom Cursor ──────────────────────────────
function initCustomCursor() {
    const dot = $("#cursor-dot");
    const blob = $("#cursor-blob");
    if (!dot || !blob) return;

    window.addEventListener("mousemove", (e) => {
        const { clientX: x, clientY: y } = e;
        dot.style.transform = `translate(${x}px, ${y}px)`;

        // Blob follows with a slight delay naturally due to transition
        blob.style.transform = `translate(${x}px, ${y}px)`;

        // Magnetic effect for buttons
        const target = e.target.closest(".btn, .notification-bell, .email-item, .cal-day");
        if (target) {
            blob.classList.add("active");
            if (target.classList.contains("btn")) {
                const rect = target.getBoundingClientRect();
                const bx = rect.left + rect.width / 2;
                const by = rect.top + rect.height / 2;
                const distx = (x - bx) * 0.3;
                const disty = (y - by) * 0.3;
                target.style.transform = `translate(${distx}px, ${disty}px)`;
            }
        } else {
            blob.classList.remove("active");
            $$(".btn").forEach(b => b.style.transform = "");
        }
    });

    document.addEventListener("mousedown", () => blob.style.transform += " scale(0.8)");
    document.addEventListener("mouseup", () => blob.style.transform = blob.style.transform.replace(" scale(0.8)", ""));
}

// ─── API Calls ──────────────────────────────────
async function api(endpoint) {
    try {
        const res = await fetch(endpoint);
        if (res.status === 401) { state.authenticated = false; fullRender(); return null; }
        return await res.json();
    } catch (err) { console.error(`API error (${endpoint}):`, err); return null; }
}

async function apiPost(endpoint, body = null) {
    try {
        const opts = { method: "POST" };
        if (body) { opts.headers = { "Content-Type": "application/json" }; opts.body = JSON.stringify(body); }
        const res = await fetch(endpoint, opts);
        return await res.json();
    } catch (err) { console.error(`API error (${endpoint}):`, err); return null; }
}

async function apiDelete(endpoint) {
    try {
        const res = await fetch(endpoint, { method: "DELETE" });
        return await res.json();
    } catch (err) { console.error(`API error (${endpoint}):`, err); return null; }
}

// ─── Data Loading ───────────────────────────────
async function checkAuth() {
    const data = await api("/auth/status");
    if (data) state.authenticated = data.authenticated;
}

async function loadEmails() {
    state.loading.emails = true;
    updateEmailSection();
    const data = await api("/api/emails?max_results=15");
    if (data) state.emails = data.emails || [];
    state.loading.emails = false;
    updateEmailSection();
}

async function loadMeetings() {
    state.loading.meetings = true;
    updateCalendarSection();
    const data = await api("/api/meetings");
    if (data) state.meetings = data.meetings || [];
    state.loading.meetings = false;
    updateCalendarSection();
}

async function loadDigest() {
    state.loading.digest = true;
    const btn = $("#digest-btn");
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;margin:0;border-width:2px;display:inline-block;vertical-align:middle;"></span> Generating...'; }
    const data = await api("/api/digest");
    state.loading.digest = false;
    if (btn) { btn.disabled = false; btn.textContent = "Generate Digest"; }
    if (data) {
        const el = $("#digest-content");
        if (el) {
            el.style.opacity = "0";
            el.textContent = data.digest || "No digest available.";
            requestAnimationFrame(() => { el.style.transition = "opacity 0.6s"; el.style.opacity = "1"; });
        }
    }
}

async function loadNotifications() {
    const data = await api("/api/notifications");
    if (data) {
        const prev = state.unreadCount;
        state.notifications = data.notifications || [];
        state.unreadCount = data.unread_count || 0;
        if (state.unreadCount > prev && prev > 0) {
            const n = state.notifications[0];
            if (n) showBrowserNotification(n.title, n.message);
        }
    }
    updateNotificationBadge();
}

// ─── Calendar Data ──────────────────────────────
async function loadCalendarReminders() {
    const data = await api(`/api/reminders?year=${state.calYear}&month=${state.calMonth + 1}`);
    if (data) {
        state.calReminders = data.reminders || [];
        state.calReminderDates = data.dates_with_reminders || [];
    }
}

async function loadDayReminders(dateStr) {
    const data = await api(`/api/reminders?date=${dateStr}`);
    if (data) state.calReminders = data.reminders || [];
}

// ─── Email Detail ───────────────────────────────
async function openEmailDetail(emailIdx) {
    const email = state.emails[emailIdx];
    if (!email) return;
    state.openEmail = email;
    state.openEmailFull = null;
    state.loadingEmailDetail = true;
    renderEmailDetail();

    const data = await api(`/api/emails/${email.id}`);
    if (data && data.email) {
        state.openEmailFull = data.email;
    }
    state.loadingEmailDetail = false;
    renderEmailDetail();
}

function closeEmailDetail() {
    state.openEmail = null;
    state.openEmailFull = null;
    const overlay = $(".email-overlay");
    const panel = $(".email-detail");
    if (overlay) overlay.classList.remove("open");
    if (panel) panel.classList.remove("open");
}

function renderEmailDetail() {
    const overlay = $(".email-overlay");
    const panel = $(".email-detail");
    if (!overlay || !panel) return;

    const e = state.openEmail;
    if (!e) { overlay.classList.remove("open"); panel.classList.remove("open"); return; }

    overlay.classList.add("open");
    panel.classList.add("open");

    const full = state.openEmailFull;
    const body = full ? full.body : (e.body || e.snippet || "");

    panel.innerHTML = `
        <div class="email-detail-header">
            <div class="email-detail-meta">
                <div class="email-detail-subject">${escapeHtml(e.subject || "No Subject")}</div>
                <div class="email-detail-info">
                    <span><span class="label">From</span> ${escapeHtml(e.from || "Unknown")}</span>
                    <span><span class="label">Date</span> ${e.date ? new Date(e.date).toLocaleString() : ""}</span>
                </div>
                <div class="email-detail-tags">
                    <span class="importance-tag ${(e.importance || "medium").toLowerCase()}">${e.importance || "MEDIUM"}</span>
                    ${e.category ? `<span class="category-tag">${e.category}</span>` : ""}
                    ${e.needs_reply ? '<span class="importance-tag high">REPLY NEEDED</span>' : ""}
                </div>
            </div>
            <button class="email-detail-close" onclick="closeEmailDetail()">&times;</button>
        </div>
        <div class="email-detail-body">
            ${e.summary ? `
                <div class="email-detail-summary">
                    <h4>AI Summary</h4>
                    <p>${escapeHtml(e.summary)}</p>
                </div>
            ` : ""}
            ${state.loadingEmailDetail ? '<div class="loading"><div class="spinner"></div><p>Loading full email...</p></div>' : ""}
            <div class="email-body-content">${escapeHtml(body)}</div>
        </div>
    `;
}

// ─── Targeted Update Functions ──────────────────
// These update only their specific section, no full re-render

function updateEmailSection() {
    const container = $("#email-section");
    if (!container) return;
    container.innerHTML = renderEmailListHTML();
    // Update count badge
    const countEl = $("#email-count");
    if (countEl) countEl.textContent = state.emails.length;
}

function updateCalendarSection() {
    const container = $("#calendar-section");
    if (!container) return;
    container.innerHTML = renderCalendarSectionHTML();
    // Update count badge
    const countEl = $("#meeting-count");
    if (countEl) countEl.textContent = state.meetings.length;
}

// ─── Full Render (only on init / auth change) ───
function fullRender() {
    const app = $("#app");
    if (!state.authenticated) { app.innerHTML = renderSetupScreen(); return; }
    app.innerHTML = renderDashboard();
}

function renderSetupScreen() {
    return `
        <div class="auth-screen">
            <h2>AI Mail Assistant</h2>
            <p>Configure your Gmail App Password and Google Calendar iCal URL in the <code>.env</code> file to get started. 100% free, 100% local.</p>
            <div class="setup-card">
                <h3>Quick Setup</h3>
                <ol>
                    <li>Enable 2-Step Verification on your Google Account</li>
                    <li>Go to Google Account &rarr; Security &rarr; App Passwords</li>
                    <li>Generate an App Password for "Mail"</li>
                    <li>Copy <code>.env.example</code> to <code>.env</code></li>
                    <li>Set <code>GMAIL_EMAIL</code> and <code>GMAIL_APP_PASSWORD</code></li>
                    <li>Restart the server: <code>python run.py</code></li>
                </ol>
            </div>
            <button class="btn btn-primary" style="margin-top: 28px;" onclick="checkAuth().then(()=>fullRender())">Check Connection</button>
        </div>`;
}

function renderDashboard() {
    // Add staggered delay to cards
    setTimeout(() => {
        $$(".card").forEach((card, i) => {
            card.style.animationDelay = `${i * 0.15}s`;
        });
    }, 10);

    return `
        <div class="digest-banner card glass">
            <div class="card-header">
                <h2><span class="live-dot"></span> Daily Briefing</h2>
                <button class="btn btn-outline" id="digest-btn" onclick="loadDigest()">Generate Digest</button>
            </div>
            <div class="digest-content" id="digest-content">Click "Generate Digest" to get your AI-powered daily briefing.</div>
        </div>
        <div class="grid">
            <div class="card glass">
                <div class="card-header">
                    <h2>Emails</h2>
                    <div style="display:flex;gap:10px;align-items:center;">
                        <span class="count" id="email-count">${state.emails.length}</span>
                        <button class="btn btn-outline" onclick="loadEmails()">Refresh</button>
                    </div>
                </div>
                <div id="email-section">${renderEmailListHTML()}</div>
            </div>
            <div class="card glass">
                <div class="card-header">
                    <h2>Calendar & Meetings</h2>
                    <div style="display:flex;gap:10px;align-items:center;">
                        <span class="count" id="meeting-count">${state.meetings.length}</span>
                        <button class="btn btn-outline" onclick="loadMeetings()">Refresh</button>
                    </div>
                </div>
                <div id="calendar-section">${renderCalendarSectionHTML()}</div>
            </div>
        </div>`;
}

// ─── Email List HTML ────────────────────────────
function renderEmailListHTML() {
    if (state.loading.emails)
        return `<div class="loading"><div class="spinner"></div><p>Analyzing emails with AI...</p></div>`;
    if (state.emails.length === 0)
        return `<div class="empty-state"><p>No emails to show. Click Refresh to load.</p></div>`;

    return `<div class="email-list">
        ${state.emails.map((e, i) => `
            <div class="email-item ${(e.importance || "").toLowerCase()} ${e.is_unread ? "unread" : ""}" onclick="openEmailDetail(${i})">
                <div class="email-subject">
                    <span>${escapeHtml(e.subject || "No Subject")}</span>
                    <span class="importance-tag ${(e.importance || "medium").toLowerCase()}">${e.importance || "MEDIUM"}</span>
                    ${e.category ? `<span class="category-tag">${e.category}</span>` : ""}
                </div>
                <div class="email-from">${escapeHtml(e.from || "Unknown")} &middot; ${formatDate(e.date)}</div>
                <div class="email-summary">${escapeHtml(e.summary || e.snippet || "")}</div>
                ${e.needs_reply ? '<div class="needs-reply">Reply needed</div>' : ""}
            </div>
        `).join("")}
    </div>`;
}

// ─── Calendar Section HTML ──────────────────────
function renderCalendarSectionHTML() {
    if (state.loading.meetings)
        return `<div class="loading"><div class="spinner"></div><p>Loading...</p></div>`;

    return `<div class="calendar-section">
        ${renderCalendarWidget()}
        ${renderDayPanel()}
        ${renderMeetingListBelow()}
    </div>`;
}

function renderCalendarWidget() {
    const year = state.calYear;
    const month = state.calMonth;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const meetingDates = new Set();
    state.meetings.forEach(m => {
        if (m.start_time) meetingDates.add(m.start_time.split("T")[0]);
    });

    const reminderDates = new Set(state.calReminderDates || []);

    let days = "";
    for (let i = firstDay - 1; i >= 0; i--) {
        days += `<div class="cal-day other-month">${daysInPrev - i}</div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === state.calSelectedDate;
        const hasEvent = meetingDates.has(dateStr);
        const hasReminder = reminderDates.has(dateStr);
        const cls = [
            "cal-day",
            isToday ? "today" : "",
            isSelected && !isToday ? "selected" : "",
            hasEvent ? "has-event" : "",
            hasReminder ? "has-reminder" : "",
        ].filter(Boolean).join(" ");
        days += `<div class="${cls}" onclick="selectCalDate('${dateStr}')">${d}</div>`;
    }
    const totalCells = firstDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
        days += `<div class="cal-day other-month">${i}</div>`;
    }

    return `
        <div class="calendar-widget">
            <div class="cal-nav">
                <button class="cal-nav-btn" onclick="calPrevMonth()">&larr;</button>
                <span class="cal-month-label">${monthNames[month]} ${year}</span>
                <button class="cal-nav-btn" onclick="calNextMonth()">&rarr;</button>
            </div>
            <div class="cal-grid">
                <div class="cal-day-header">Sun</div><div class="cal-day-header">Mon</div><div class="cal-day-header">Tue</div>
                <div class="cal-day-header">Wed</div><div class="cal-day-header">Thu</div><div class="cal-day-header">Fri</div><div class="cal-day-header">Sat</div>
                ${days}
            </div>
        </div>`;
}

function renderDayPanel() {
    const sel = state.calSelectedDate;
    if (!sel) return "";

    const dayMeetings = state.meetings.filter(m => m.start_time && m.start_time.startsWith(sel));
    const dayReminders = state.calReminders.filter(r => r.date === sel);
    const dateObj = new Date(sel + "T00:00:00");
    const label = dateObj.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

    return `
        <div class="day-panel">
            <div class="day-panel-header">
                <h3>${label}</h3>
                <button class="btn btn-outline" onclick="toggleAddReminder()" style="padding:5px 14px;font-size:0.8rem;">+ Reminder</button>
            </div>
            <div class="day-panel-items">
                ${dayMeetings.map(m => `
                    <div class="day-event">
                        <div class="ev-time">${formatMeetingTime(m.start_time, m.end_time, m.is_all_day)}</div>
                        <div>${escapeHtml(m.title)}</div>
                        ${m.meet_link ? `<a href="${m.meet_link}" target="_blank" class="meeting-link" style="margin-top:4px;">Join Meet &rarr;</a>` : ""}
                    </div>
                `).join("")}
                ${dayReminders.map(r => `
                    <div class="day-reminder" style="border-left-color:${r.color || "var(--text-secondary)"}">
                        <div>
                            ${r.time ? `<span class="rem-time">${r.time}</span>` : ""}
                            <div>${escapeHtml(r.title)}</div>
                            ${r.description ? `<div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px;">${escapeHtml(r.description)}</div>` : ""}
                        </div>
                        <button class="rem-delete" onclick="deleteReminder('${r.id}')">&times;</button>
                    </div>
                `).join("")}
                ${dayMeetings.length === 0 && dayReminders.length === 0 ? '<div style="font-size:0.85rem;color:var(--text-secondary);padding:8px;">No events or reminders for this day.</div>' : ""}
            </div>
            ${state.showAddReminder ? renderAddReminderForm(sel) : ""}
        </div>`;
}

function renderAddReminderForm(dateStr) {
    const colors = ["#ffffff", "#cccccc", "#888888", "#ff4444", "#ffaa00", "#666666"];
    return `
        <div class="add-reminder-form">
            <input type="text" id="rem-title" placeholder="Reminder title..." autofocus>
            <div class="form-row">
                <input type="time" id="rem-time" placeholder="Time (optional)">
            </div>
            <textarea id="rem-desc" placeholder="Description (optional)"></textarea>
            <div class="reminder-colors">
                <span style="font-size:0.8rem;color:var(--text-secondary);">Color:</span>
                ${colors.map(c => `<div class="color-dot ${c === state.reminderColor ? "active" : ""}" style="background:${c};" onclick="setReminderColor('${c}')"></div>`).join("")}
            </div>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-primary" onclick="submitReminder('${dateStr}')" style="flex:1;">Add Reminder</button>
                <button class="btn btn-outline" onclick="toggleAddReminder()">Cancel</button>
            </div>
        </div>`;
}

function renderMeetingListBelow() {
    if (state.meetings.length === 0) return "";
    return `
        <div style="margin-top:4px;">
            <div style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">Today's Schedule</div>
            <div class="meeting-list">
                ${state.meetings.map(m => `
                    <div class="meeting-item">
                        <div class="meeting-time">${formatMeetingTime(m.start_time, m.end_time, m.is_all_day)}</div>
                        <div class="meeting-title">${escapeHtml(m.title || "No Title")}</div>
                        ${m.location ? `<div class="meeting-details">${escapeHtml(m.location)}</div>` : ""}
                        ${m.meet_link ? `<a href="${m.meet_link}" target="_blank" class="meeting-link">Join Meet &rarr;</a>` : ""}
                        ${m.attendees?.length ? `<div class="meeting-attendees">${m.attendees.map(a => escapeHtml(a.name || a.email)).join(", ")}</div>` : ""}
                    </div>
                `).join("")}
            </div>
        </div>`;
}

// ─── Calendar Actions ───────────────────────────
async function selectCalDate(dateStr) {
    state.calSelectedDate = dateStr;
    state.showAddReminder = false;
    await loadDayReminders(dateStr);
    updateCalendarSection();
}

async function calPrevMonth() {
    state.calMonth--;
    if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
    state.calSelectedDate = null;
    state.showAddReminder = false;
    await loadCalendarReminders();
    updateCalendarSection();
}

async function calNextMonth() {
    state.calMonth++;
    if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
    state.calSelectedDate = null;
    state.showAddReminder = false;
    await loadCalendarReminders();
    updateCalendarSection();
}

function toggleAddReminder() {
    state.showAddReminder = !state.showAddReminder;
    updateCalendarSection();
}

function setReminderColor(color) {
    state.reminderColor = color;
    updateCalendarSection();
}

async function submitReminder(dateStr) {
    const title = $("#rem-title")?.value?.trim();
    if (!title) { $("#rem-title")?.focus(); return; }
    const time = $("#rem-time")?.value || "";
    const desc = $("#rem-desc")?.value?.trim() || "";

    await apiPost("/api/reminders", {
        title, date: dateStr, time, description: desc, color: state.reminderColor
    });
    state.showAddReminder = false;
    await loadDayReminders(dateStr);
    await loadCalendarReminders();
    updateCalendarSection();
}

async function deleteReminder(id) {
    await apiDelete(`/api/reminders/${id}`);
    if (state.calSelectedDate) await loadDayReminders(state.calSelectedDate);
    await loadCalendarReminders();
    updateCalendarSection();
}

// ─── Notifications ──────────────────────────────
function toggleNotifications() {
    const panel = $(".notifications-panel");
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) renderNotifications();
}

function renderNotifications() {
    const list = $(".notifications-list");
    if (!list) return;
    if (state.notifications.length === 0) {
        list.innerHTML = `<div class="empty-state"><p>No notifications yet.</p></div>`;
        return;
    }
    list.innerHTML = state.notifications.slice(0, 20).map(n => `
        <div class="notif-item ${n.read ? "" : "unread"} ${n.severity}" onclick="markNotifRead('${n.id}')">
            <div class="notif-title">${escapeHtml(n.title)}</div>
            <div class="notif-message">${escapeHtml(n.message)}</div>
            <div class="notif-time">${formatDate(n.timestamp)}</div>
        </div>
    `).join("");
}

async function markNotifRead(id) {
    await apiPost(`/api/notifications/${id}/read`);
    await loadNotifications(); renderNotifications();
}

async function markAllRead() {
    await apiPost("/api/notifications/read-all");
    await loadNotifications(); renderNotifications();
}

function updateNotificationBadge() {
    const badge = $(".notification-badge");
    if (badge) {
        badge.textContent = state.unreadCount;
        badge.classList.toggle("active", state.unreadCount > 0);
    }
}

// ─── Helpers ────────────────────────────────────
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMins = Math.floor((now - date) / 60000);
        if (diffMins < 1) return "just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
        return date.toLocaleDateString();
    } catch { return dateStr; }
}

function formatMeetingTime(start, end, isAllDay) {
    if (isAllDay) return "All day";
    try {
        const s = new Date(start);
        const e = new Date(end);
        const fmt = d => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return `${fmt(s)} - ${fmt(e)}`;
    } catch { return start || "TBD"; }
}

// ─── Auto-Refresh (silent — no full re-render) ─
function startAutoRefresh() {
    setInterval(async () => { if (state.authenticated) await loadNotifications(); }, 30000);
    setInterval(async () => {
        if (state.authenticated) {
            await loadEmails();
            await loadMeetings();
        }
    }, 300000);
}

// ─── Browser Notifications ──────────────────────
function requestBrowserNotifications() {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
}
function showBrowserNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
}

// ─── Close panels on outside click ──────────────
document.addEventListener("click", (e) => {
    const panel = $(".notifications-panel");
    const bell = $(".notification-bell");
    if (panel?.classList.contains("open") && !panel.contains(e.target) && !bell.contains(e.target))
        panel.classList.remove("open");
});

// Escape key closes email detail
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.openEmail) closeEmailDetail();
});

// ─── Punch Tracker ──────────────────────────────
// ─── Punch Tracker ──────────────────────────────
let punchInterval = null;

function togglePunchPanel() {
    const panel = $("#punch-panel");
    panel.classList.toggle("open");
}

function initPunchTracker() {
    const savedTime = localStorage.getItem("punchInTime");
    const savedDuration = localStorage.getItem("shiftDuration");

    if (savedDuration) {
        const select = $("#shift-length-select");
        if (select) select.value = savedDuration;
        updateShiftSummary();
    }

    if (savedTime) {
        restorePunch(savedTime);
    }
}

function setNow() {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const input = $("#punch-time-input");
    if (input) input.value = timeStr;
}

function updateShiftSummary() {
    const select = $("#shift-length-select");
    const summary = $("#shift-config-summary");
    if (!select || !summary) return;

    const minutes = parseInt(select.value);
    const hours = minutes / 60;
    summary.textContent = `${hours}h shift (30m recess included)`;
    localStorage.setItem("shiftDuration", select.value);
}

function setPunchIn() {
    const timeInput = $("#punch-time-input");
    const lengthSelect = $("#shift-length-select");

    const timeVal = timeInput?.value;
    const durationVal = lengthSelect?.value;

    if (!timeVal) { timeInput?.focus(); return; }

    localStorage.setItem("punchInTime", timeVal);
    localStorage.setItem("shiftDuration", durationVal);

    restorePunch(timeVal);
}

function restorePunch(timeStr) {
    const duration = parseInt(localStorage.getItem("shiftDuration") || "540");
    const [h, m] = timeStr.split(":").map(Number);
    const now = new Date();
    const punchIn = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
    const punchOut = new Date(punchIn.getTime() + duration * 60000);

    // Update UI elements
    const input = $("#punch-time-input");
    if (input) input.value = timeStr;

    const select = $("#shift-length-select");
    if (select) select.value = duration.toString();

    updateShiftSummary();

    const tracker = $("#punch-tracker");
    const label = $("#punch-label");
    if (tracker) tracker.classList.add("active");

    const fmtTime = d => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const punchInFmt = fmtTime(punchIn);
    const punchOutFmt = fmtTime(punchOut);

    const btn = $("#punch-set-btn");
    if (btn) btn.textContent = "Sync Shift";

    const result = $("#punch-result");
    if (result) {
        result.classList.add("visible");
        result.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div class="punch-info-card">
                    <div class="punch-info-label">Started</div>
                    <div class="punch-info-value">${punchInFmt}</div>
                </div>
                <div class="punch-info-card">
                    <div class="punch-info-label">Ending</div>
                    <div class="punch-info-value">${punchOutFmt}</div>
                    <div class="punch-info-sub">Total Duration: ${duration / 60}h</div>
                </div>
            </div>
            <div class="punch-countdown" id="punch-countdown">
                <div class="countdown-label">Time Remaining</div>
                <div class="countdown-time" id="punch-countdown-time">--:--:--</div>
            </div>
            <button class="punch-clear-btn" onclick="clearPunch()">Reset Tracker</button>
        `;
    }

    if (punchInterval) clearInterval(punchInterval);
    updatePunchCountdown(punchOut);
    punchInterval = setInterval(() => updatePunchCountdown(punchOut), 1000);

    if (label) label.textContent = `Finish: ${punchOutFmt}`;
}

function updatePunchCountdown(punchOut) {
    const now = new Date();
    const diff = punchOut.getTime() - now.getTime();
    const el = $("#punch-countdown-time");
    const container = $("#punch-countdown");
    if (!el) return;

    if (diff <= 0) {
        // Overtime
        const over = Math.abs(diff);
        const oh = Math.floor(over / 3600000);
        const om = Math.floor((over % 3600000) / 60000);
        const os = Math.floor((over % 60000) / 1000);
        el.textContent = `+${String(oh).padStart(2, "0")}:${String(om).padStart(2, "0")}:${String(os).padStart(2, "0")}`;
        if (container) {
            container.classList.add("overtime");
            const lbl = container.querySelector(".countdown-label");
            if (lbl) lbl.textContent = "Overtime";
        }
    } else {
        const rh = Math.floor(diff / 3600000);
        const rm = Math.floor((diff % 3600000) / 60000);
        const rs = Math.floor((diff % 60000) / 1000);
        el.textContent = `${String(rh).padStart(2, "0")}:${String(rm).padStart(2, "0")}:${String(rs).padStart(2, "0")}`;
        if (container) {
            container.classList.remove("overtime");
            const lbl = container.querySelector(".countdown-label");
            if (lbl) lbl.textContent = "Time Remaining";
        }
    }
}

function clearPunch() {
    localStorage.removeItem("punchInTime");
    if (punchInterval) { clearInterval(punchInterval); punchInterval = null; }
    const tracker = $("#punch-tracker");
    const label = $("#punch-label");
    const result = $("#punch-result");
    const input = $("#punch-time-input");
    const btn = $("#punch-set-btn");
    if (tracker) tracker.classList.remove("active");
    if (label) label.textContent = "Punch In";
    if (result) { result.classList.remove("visible"); result.innerHTML = ""; }
    if (input) input.value = "";
    if (btn) btn.textContent = "Set Punch In";
}

// Close punch panel on outside click
document.addEventListener("click", (e) => {
    const panel = $("#punch-panel");
    const tracker = $("#punch-tracker");
    if (panel?.classList.contains("open") && !panel.contains(e.target) && !tracker.contains(e.target))
        panel.classList.remove("open");
});

// ─── Init ───────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
    initCustomCursor();
    initPunchTracker();
    await checkAuth();
    fullRender();
    if (state.authenticated) {
        requestBrowserNotifications();
        await Promise.all([loadEmails(), loadMeetings(), loadNotifications(), loadCalendarReminders()]);
        updateCalendarSection();
        startAutoRefresh();
    }
});

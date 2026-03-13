import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from pydantic import BaseModel

from config.settings import settings
from app.services.gmail_service import GmailService
from app.services.calendar_service import CalendarService
from app.services.llm_service import LLMService
from app.services.notifier import NotificationEngine
from app.services.reminder_service import ReminderService

# Global state
notifier = NotificationEngine()
llm = LLMService()
reminders = ReminderService()
_background_task: asyncio.Task | None = None


class ReminderCreate(BaseModel):
    title: str
    date: str  # YYYY-MM-DD
    time: str = ""
    description: str = ""
    color: str = "#6366f1"


def is_configured() -> bool:
    """Check if Gmail credentials are set in .env."""
    return bool(settings.GMAIL_EMAIL and settings.GMAIL_APP_PASSWORD)


async def background_checker():
    """Periodically check for new emails and meetings."""
    while True:
        try:
            if is_configured():
                gmail = GmailService()
                calendar = CalendarService()

                # Get unread emails and analyze them
                emails = gmail.get_unread_emails(max_results=10)
                analyzed = []
                for em in emails:
                    result = await llm.summarize_email(em)
                    analyzed.append(result)

                notifier.process_emails(analyzed)

                # Get today's meetings
                meetings = await calendar.get_todays_meetings()
                notifier.process_meetings(meetings)

                print(f"[Background] Checked: {len(emails)} emails, {len(meetings)} meetings")
        except Exception as e:
            print(f"[Background] Error: {e}")

        await asyncio.sleep(settings.CHECK_INTERVAL_MINUTES * 60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _background_task
    if is_configured():
        _background_task = asyncio.create_task(background_checker())
        print(f"[Startup] Background checker started (every {settings.CHECK_INTERVAL_MINUTES} min)")
    else:
        print("[Startup] Gmail not configured — set GMAIL_EMAIL and GMAIL_APP_PASSWORD in .env")
    yield
    if _background_task:
        _background_task.cancel()


app = FastAPI(title="AI Mail & Calendar Assistant", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")


# ─── Dashboard ──────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


# ─── Auth Status (config-based, no OAuth) ──────────────────────

@app.get("/auth/status")
async def auth_status():
    configured = is_configured()
    gmail_ok = False
    if configured:
        try:
            gmail_ok = GmailService().check_connection()
        except Exception:
            gmail_ok = False
    return {
        "authenticated": configured and gmail_ok,
        "configured": configured,
        "gmail_connected": gmail_ok,
    }


# ─── Email Routes ───────────────────────────────────────────────

@app.get("/api/emails")
async def get_emails(unread_only: bool = False, max_results: int = 15):
    if not is_configured():
        return JSONResponse({"error": "Gmail not configured. Set GMAIL_EMAIL and GMAIL_APP_PASSWORD in .env"}, status_code=401)

    gmail = GmailService()
    emails = gmail.get_unread_emails(max_results) if unread_only else gmail.get_recent_emails(max_results)

    analyzed = []
    for em in emails:
        result = await llm.summarize_email(em)
        analyzed.append(result)

    notifier.process_emails(analyzed)
    return {"emails": analyzed, "count": len(analyzed)}


# ─── Calendar Routes ───────────────────────────────────────────

@app.get("/api/meetings")
async def get_meetings():
    calendar = CalendarService()
    if not calendar.is_configured():
        return {"meetings": [], "count": 0, "message": "Calendar not configured. Set GOOGLE_CALENDAR_ICAL_URL in .env"}

    meetings = await calendar.get_todays_meetings()
    notifier.process_meetings(meetings)
    return {"meetings": meetings, "count": len(meetings)}


@app.get("/api/meetings/briefing")
async def get_meeting_briefing():
    calendar = CalendarService()
    meetings = await calendar.get_todays_meetings()
    briefing = await llm.summarize_meetings(meetings)
    return {"briefing": briefing, "meeting_count": len(meetings)}


# ─── Digest Route ──────────────────────────────────────────────

@app.get("/api/digest")
async def get_daily_digest():
    if not is_configured():
        return JSONResponse({"error": "Gmail not configured"}, status_code=401)

    gmail = GmailService()
    calendar = CalendarService()

    emails = gmail.get_unread_emails(max_results=20)
    analyzed = []
    for em in emails:
        result = await llm.summarize_email(em)
        analyzed.append(result)

    meetings = await calendar.get_todays_meetings()
    digest = await llm.generate_daily_digest(analyzed, meetings)

    return {"digest": digest, "email_count": len(analyzed), "meeting_count": len(meetings)}


# ─── Notification Routes ───────────────────────────────────────

@app.get("/api/notifications")
async def get_notifications():
    return {
        "notifications": notifier.get_all_notifications(),
        "unread_count": notifier.get_unread_count(),
    }


@app.post("/api/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str):
    notifier.mark_as_read(notif_id)
    return {"success": True}


@app.post("/api/notifications/read-all")
async def mark_all_notifications_read():
    notifier.mark_all_read()
    return {"success": True}


# ─── Email Detail ─────────────────────────────────────────────

@app.get("/api/emails/{email_id}")
async def get_email_detail(email_id: str):
    """Fetch full email content by ID."""
    if not is_configured():
        return JSONResponse({"error": "Gmail not configured"}, status_code=401)

    gmail = GmailService()
    mail = gmail._connect()
    try:
        email_data = gmail._fetch_and_parse(mail, email_id.encode())
        if not email_data:
            return JSONResponse({"error": "Email not found"}, status_code=404)
        return {"email": email_data}
    finally:
        mail.logout()


# ─── Reminder Routes ─────────────────────────────────────────

@app.get("/api/reminders")
async def get_reminders(date: str = "", year: int = 0, month: int = 0):
    if date:
        return {"reminders": reminders.get_by_date(date)}
    if year and month:
        return {
            "reminders": reminders.get_by_month(year, month),
            "dates_with_reminders": reminders.get_dates_with_reminders(year, month),
        }
    return {"reminders": reminders.get_all()}


@app.post("/api/reminders")
async def create_reminder(data: ReminderCreate):
    reminder = reminders.add(
        title=data.title,
        date=data.date,
        time=data.time,
        description=data.description,
        color=data.color,
    )
    return {"reminder": reminder}


@app.delete("/api/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str):
    deleted = reminders.delete(reminder_id)
    if not deleted:
        return JSONResponse({"error": "Reminder not found"}, status_code=404)
    return {"success": True}


# ─── Health Check ──────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    gmail_ok = False
    if is_configured():
        try:
            gmail_ok = GmailService().check_connection()
        except Exception:
            pass
    return {
        "status": "ok",
        "gmail_configured": is_configured(),
        "gmail_connected": gmail_ok,
        "calendar_configured": CalendarService().is_configured(),
    }

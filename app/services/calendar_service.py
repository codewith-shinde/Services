import re
from datetime import datetime, date, timedelta, timezone

import httpx
from icalendar import Calendar
import recurring_ical_events

from config.settings import settings


class CalendarService:
    """Read-only Google Calendar via iCal URL — free, no API key needed."""

    def __init__(self):
        self.ical_url = settings.GOOGLE_CALENDAR_ICAL_URL

    async def get_todays_meetings(self) -> list[dict]:
        if not self.ical_url:
            return []

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(self.ical_url)
                response.raise_for_status()
                ical_text = response.text
        except Exception as e:
            print(f"Error fetching calendar: {e}")
            return []

        return self._parse_events_for_date(ical_text, date.today())

    async def get_upcoming_meetings(self, hours: int = 2) -> list[dict]:
        all_today = await self.get_todays_meetings()
        now = datetime.now(timezone.utc)
        cutoff = now + timedelta(hours=hours)

        upcoming = []
        for m in all_today:
            try:
                start = datetime.fromisoformat(m["start_time"])
                if start.tzinfo is None:
                    start = start.replace(tzinfo=timezone.utc)
                if now <= start <= cutoff:
                    upcoming.append(m)
            except Exception:
                continue
        return upcoming

    def _parse_events_for_date(self, ical_text: str, target_date: date) -> list[dict]:
        try:
            cal = Calendar.from_ical(ical_text)
        except Exception as e:
            print(f"Error parsing iCal: {e}")
            return []

        start_dt = datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc)
        end_dt = start_dt + timedelta(days=1)

        events = recurring_ical_events.of(cal).between(start_dt, end_dt)
        meetings = []

        for event in events:
            dtstart = event.get("DTSTART")
            dtend = event.get("DTEND")

            start_val = dtstart.dt if dtstart else None
            end_val = dtend.dt if dtend else None

            is_all_day = isinstance(start_val, date) and not isinstance(start_val, datetime)

            start_time = start_val.isoformat() if start_val else ""
            end_time = end_val.isoformat() if end_val else ""

            attendees = []
            attendee_prop = event.get("ATTENDEE")
            if attendee_prop:
                if not isinstance(attendee_prop, list):
                    attendee_prop = [attendee_prop]
                for a in attendee_prop:
                    email_addr = str(a).replace("mailto:", "").replace("MAILTO:", "")
                    name = a.params.get("CN", email_addr) if hasattr(a, "params") else email_addr
                    attendees.append({
                        "email": email_addr,
                        "name": str(name),
                        "status": str(a.params.get("PARTSTAT", "NEEDS-ACTION")) if hasattr(a, "params") else "",
                    })

            organizer = event.get("ORGANIZER")
            organizer_email = str(organizer).replace("mailto:", "").replace("MAILTO:", "") if organizer else ""

            description = str(event.get("DESCRIPTION", ""))
            location = str(event.get("LOCATION", ""))

            meet_link = ""
            for text in [description, location]:
                if "meet.google.com" in text:
                    match = re.search(r"https://meet\.google\.com/[a-z\-]+", text)
                    if match:
                        meet_link = match.group(0)
                        break

            meetings.append({
                "id": str(event.get("UID", "")),
                "title": str(event.get("SUMMARY", "(No Title)")),
                "description": description[:500],
                "start_time": start_time,
                "end_time": end_time,
                "location": location,
                "meet_link": meet_link,
                "attendees": attendees,
                "organizer": organizer_email,
                "status": str(event.get("STATUS", "CONFIRMED")),
                "is_all_day": is_all_day,
            })

        meetings.sort(key=lambda m: m.get("start_time", ""))
        return meetings

    def is_configured(self) -> bool:
        return bool(self.ical_url)

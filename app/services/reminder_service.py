import json
import uuid
from datetime import datetime, timezone
from pathlib import Path


REMINDERS_PATH = Path("config/reminders.json")


class ReminderService:
    """Local reminder/event storage — persisted as JSON."""

    def __init__(self):
        self._ensure_file()

    def _ensure_file(self):
        REMINDERS_PATH.parent.mkdir(parents=True, exist_ok=True)
        if not REMINDERS_PATH.exists():
            REMINDERS_PATH.write_text("[]")

    def _load(self) -> list[dict]:
        try:
            return json.loads(REMINDERS_PATH.read_text())
        except Exception:
            return []

    def _save(self, reminders: list[dict]):
        REMINDERS_PATH.write_text(json.dumps(reminders, indent=2))

    def get_all(self) -> list[dict]:
        return self._load()

    def get_by_date(self, date_str: str) -> list[dict]:
        """Get reminders for a specific date (YYYY-MM-DD)."""
        return [r for r in self._load() if r.get("date") == date_str]

    def get_by_month(self, year: int, month: int) -> list[dict]:
        """Get reminders for a specific month."""
        prefix = f"{year}-{month:02d}"
        return [r for r in self._load() if r.get("date", "").startswith(prefix)]

    def add(self, title: str, date: str, time: str = "", description: str = "", color: str = "#6366f1") -> dict:
        """Add a new reminder."""
        reminders = self._load()
        reminder = {
            "id": str(uuid.uuid4())[:8],
            "title": title,
            "date": date,
            "time": time,
            "description": description,
            "color": color,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        reminders.append(reminder)
        self._save(reminders)
        return reminder

    def delete(self, reminder_id: str) -> bool:
        reminders = self._load()
        filtered = [r for r in reminders if r.get("id") != reminder_id]
        if len(filtered) < len(reminders):
            self._save(filtered)
            return True
        return False

    def get_dates_with_reminders(self, year: int, month: int) -> list[str]:
        """Return list of dates that have reminders in given month."""
        reminders = self.get_by_month(year, month)
        return list(set(r.get("date", "") for r in reminders))

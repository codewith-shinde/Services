from datetime import datetime, timezone
from typing import Optional


class NotificationEngine:
    """In-app notification engine — tracks important emails and upcoming meetings."""

    def __init__(self):
        self.notifications: list[dict] = []
        self._seen_ids: set[str] = set()

    def process_emails(self, analyzed_emails: list[dict]) -> list[dict]:
        """Generate notifications for important emails."""
        new_notifications = []
        for email in analyzed_emails:
            email_id = email.get("id", "")
            if email_id in self._seen_ids:
                continue

            importance = email.get("importance", "MEDIUM")
            if importance in ("CRITICAL", "HIGH"):
                notif = {
                    "id": f"email-{email_id}",
                    "type": "email",
                    "severity": "critical" if importance == "CRITICAL" else "warning",
                    "title": f"Important Email: {email.get('subject', 'No Subject')}",
                    "message": f"From: {email.get('from', 'Unknown')}\n{email.get('summary', email.get('snippet', ''))}",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "read": False,
                    "data": {
                        "email_id": email_id,
                        "importance": importance,
                        "needs_reply": email.get("needs_reply", False),
                        "category": email.get("category", ""),
                    },
                }
                new_notifications.append(notif)
                self.notifications.insert(0, notif)
                self._seen_ids.add(email_id)

            # Also notify if reply is needed regardless of importance
            elif email.get("needs_reply") and email_id not in self._seen_ids:
                notif = {
                    "id": f"email-reply-{email_id}",
                    "type": "email",
                    "severity": "info",
                    "title": f"Reply Needed: {email.get('subject', 'No Subject')}",
                    "message": f"From: {email.get('from', 'Unknown')}",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "read": False,
                    "data": {"email_id": email_id, "needs_reply": True},
                }
                new_notifications.append(notif)
                self.notifications.insert(0, notif)
                self._seen_ids.add(email_id)

        return new_notifications

    def process_meetings(self, meetings: list[dict]) -> list[dict]:
        """Generate notifications for today's meetings."""
        new_notifications = []
        for meeting in meetings:
            meeting_id = meeting.get("id", "")
            notif_id = f"meeting-{meeting_id}"
            if notif_id in self._seen_ids:
                continue

            notif = {
                "id": notif_id,
                "type": "meeting",
                "severity": "info",
                "title": f"Meeting Today: {meeting.get('title', 'No Title')}",
                "message": f"Time: {meeting.get('start_time', 'TBD')}\nLocation: {meeting.get('location', meeting.get('meet_link', 'N/A'))}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "read": False,
                "data": {
                    "meeting_id": meeting_id,
                    "start_time": meeting.get("start_time", ""),
                    "meet_link": meeting.get("meet_link", ""),
                },
            }
            new_notifications.append(notif)
            self.notifications.insert(0, notif)
            self._seen_ids.add(notif_id)

        return new_notifications

    def get_all_notifications(self) -> list[dict]:
        return self.notifications

    def get_unread_count(self) -> int:
        return sum(1 for n in self.notifications if not n.get("read"))

    def mark_as_read(self, notif_id: str) -> bool:
        for n in self.notifications:
            if n["id"] == notif_id:
                n["read"] = True
                return True
        return False

    def mark_all_read(self):
        for n in self.notifications:
            n["read"] = True

    def clear(self):
        self.notifications.clear()
        self._seen_ids.clear()

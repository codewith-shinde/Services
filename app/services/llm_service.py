import re


# Keywords for rule-based email classification
_CRITICAL_KW = {"urgent", "asap", "immediately", "critical", "emergency", "action required", "escalation", "outage", "downtime", "p0", "p1", "incident"}
_HIGH_KW = {"important", "deadline", "due today", "due tomorrow", "approval", "review needed", "blocking", "high priority", "eod", "end of day"}
_REPLY_KW = {"please reply", "respond", "rsvp", "your input", "your feedback", "awaiting your", "please confirm", "action needed", "let me know", "can you", "could you", "thoughts?", "?"}
_PROMO_KW = {"unsubscribe", "opt out", "view in browser", "no longer wish", "email preferences", "promotional", "% off", "discount", "deal", "sale", "coupon", "free trial"}
_NEWSLETTER_KW = {"newsletter", "weekly digest", "daily digest", "roundup", "this week in", "top stories"}
_MEETING_KW = {"meeting", "invite", "calendar", "schedule", "call", "zoom", "teams", "google meet", "agenda"}


class LLMService:
    """Rule-based email analysis — no external LLM needed."""

    async def summarize_email(self, email: dict) -> dict:
        """Classify and summarize an email using keyword rules."""
        subject = (email.get("subject") or "").lower()
        body = (email.get("body") or email.get("snippet") or "").lower()
        text = f"{subject} {body}"
        from_addr = (email.get("from") or "").lower()

        # Determine importance
        importance = "MEDIUM"
        if any(kw in text for kw in _CRITICAL_KW):
            importance = "CRITICAL"
        elif any(kw in text for kw in _HIGH_KW):
            importance = "HIGH"
        elif any(kw in text for kw in _PROMO_KW) or any(kw in text for kw in _NEWSLETTER_KW):
            importance = "LOW"

        # Determine category
        category = "fyi-info"
        if any(kw in text for kw in _PROMO_KW):
            category = "promotion"
        elif any(kw in text for kw in _NEWSLETTER_KW):
            category = "newsletter"
        elif any(kw in text for kw in _MEETING_KW):
            category = "meeting-request"
        elif "deadline" in text or "due" in text:
            category = "deadline"
        elif "approv" in text:
            category = "approval-needed"
        elif importance == "CRITICAL":
            category = "urgent-action"

        # Needs reply?
        needs_reply = any(kw in text for kw in _REPLY_KW) and importance in ("CRITICAL", "HIGH", "MEDIUM")

        # Build summary from snippet/body
        snippet = email.get("snippet") or email.get("body") or ""
        summary = snippet[:200].strip()
        if len(snippet) > 200:
            summary = summary.rsplit(" ", 1)[0] + "..."

        return {
            "id": email.get("id"),
            "subject": email.get("subject"),
            "from": email.get("from"),
            "date": email.get("date"),
            "snippet": email.get("snippet"),
            "body": email.get("body"),
            "is_unread": email.get("is_unread", False),
            "summary": summary,
            "importance": importance,
            "category": category,
            "needs_reply": needs_reply,
        }

    async def summarize_meetings(self, meetings: list[dict]) -> str:
        """Create a simple meeting briefing."""
        if not meetings:
            return "No meetings scheduled for today."

        lines = [f"You have {len(meetings)} meeting(s) today:\n"]
        for i, m in enumerate(meetings, 1):
            time_str = m.get("start_time", "TBD")
            if "T" in time_str:
                time_str = time_str.split("T")[1][:5]
            title = m.get("title", "No Title")
            lines.append(f"{i}. {time_str} — {title}")
            if m.get("meet_link"):
                lines.append(f"   Join: {m['meet_link']}")
        return "\n".join(lines)

    async def generate_daily_digest(self, emails: list[dict], meetings: list[dict]) -> str:
        """Generate a combined daily digest."""
        lines = []

        # Email summary
        important = [e for e in emails if e.get("importance") in ("CRITICAL", "HIGH")]
        lines.append(f"--- EMAILS: {len(emails)} total, {len(important)} important ---\n")
        if important:
            for e in important[:5]:
                lines.append(f"[{e.get('importance')}] {e.get('subject', 'No Subject')}")
                if e.get("summary"):
                    lines.append(f"  {e['summary'][:100]}")
        else:
            lines.append("No high-priority emails.")

        lines.append(f"\n--- MEETINGS: {len(meetings)} today ---\n")
        if meetings:
            for m in meetings:
                time_str = m.get("start_time", "")
                if "T" in time_str:
                    time_str = time_str.split("T")[1][:5]
                lines.append(f"{time_str} — {m.get('title', 'No Title')}")
        else:
            lines.append("No meetings today.")

        reply_needed = [e for e in emails if e.get("needs_reply")]
        if reply_needed:
            lines.append(f"\n--- ACTION NEEDED: {len(reply_needed)} email(s) need a reply ---")
            for e in reply_needed[:3]:
                lines.append(f"  - {e.get('subject', 'No Subject')}")

        return "\n".join(lines)

    async def check_health(self) -> bool:
        """Always healthy — no external dependency."""
        return True

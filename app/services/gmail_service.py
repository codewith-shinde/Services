import imaplib
import email
import re
from datetime import datetime, timezone
from email.header import decode_header
from email.utils import parsedate_to_datetime
from typing import Optional

from config.settings import settings


class GmailService:
    """Read-only Gmail via IMAP — free, no Google Cloud billing needed."""

    def __init__(self):
        self.server = settings.IMAP_SERVER
        self.port = settings.IMAP_PORT
        self.email_addr = settings.GMAIL_EMAIL
        self.password = settings.GMAIL_APP_PASSWORD

    def _connect(self) -> imaplib.IMAP4_SSL:
        mail = imaplib.IMAP4_SSL(self.server, self.port)
        mail.login(self.email_addr, self.password)
        return mail

    def get_recent_emails(self, max_results: int = 20) -> list[dict]:
        """Fetch recent emails from inbox."""
        mail = self._connect()
        try:
            mail.select("INBOX", readonly=True)
            _, data = mail.search(None, "ALL")
            email_ids = data[0].split()
            email_ids = email_ids[-max_results:]
            email_ids.reverse()

            emails = []
            for eid in email_ids:
                parsed = self._fetch_and_parse(mail, eid)
                if parsed:
                    emails.append(parsed)
            return emails
        finally:
            mail.logout()

    def get_unread_emails(self, max_results: int = 20) -> list[dict]:
        """Fetch unread emails from inbox."""
        mail = self._connect()
        try:
            mail.select("INBOX", readonly=True)
            _, data = mail.search(None, "UNSEEN")
            email_ids = data[0].split()
            email_ids = email_ids[-max_results:]
            email_ids.reverse()

            emails = []
            for eid in email_ids:
                parsed = self._fetch_and_parse(mail, eid)
                if parsed:
                    parsed["is_unread"] = True
                    emails.append(parsed)
            return emails
        finally:
            mail.logout()

    def _fetch_and_parse(self, mail: imaplib.IMAP4_SSL, email_id: bytes) -> Optional[dict]:
        """Fetch and parse a single email."""
        try:
            _, msg_data = mail.fetch(email_id, "(RFC822 FLAGS)")
            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)

            subject = self._decode_header(msg.get("Subject", "(No Subject)"))
            from_addr = self._decode_header(msg.get("From", "Unknown"))
            to_addr = self._decode_header(msg.get("To", ""))

            date_str = msg.get("Date", "")
            try:
                date_val = parsedate_to_datetime(date_str)
            except Exception:
                date_val = datetime.now(timezone.utc)

            body = self._extract_body(msg)

            flags_data = msg_data[0][0].decode() if isinstance(msg_data[0][0], bytes) else str(msg_data[0][0])
            is_unread = "\\Seen" not in flags_data

            return {
                "id": email_id.decode() if isinstance(email_id, bytes) else str(email_id),
                "subject": subject,
                "from": from_addr,
                "to": to_addr,
                "date": date_val.isoformat(),
                "snippet": body[:200],
                "body": body[:3000],
                "is_unread": is_unread,
            }
        except Exception as e:
            print(f"Error parsing email {email_id}: {e}")
            return None

    def _decode_header(self, header: str) -> str:
        if not header:
            return ""
        decoded_parts = decode_header(header)
        result = []
        for part, charset in decoded_parts:
            if isinstance(part, bytes):
                result.append(part.decode(charset or "utf-8", errors="replace"))
            else:
                result.append(str(part))
        return " ".join(result)

    def _extract_body(self, msg: email.message.Message) -> str:
        body = ""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    try:
                        charset = part.get_content_charset() or "utf-8"
                        payload = part.get_payload(decode=True)
                        if payload:
                            body = payload.decode(charset, errors="replace")
                            break
                    except Exception:
                        continue
        else:
            try:
                charset = msg.get_content_charset() or "utf-8"
                payload = msg.get_payload(decode=True)
                if payload:
                    body = payload.decode(charset, errors="replace")
            except Exception:
                body = ""

        body = re.sub(r"<[^>]+>", "", body)
        body = re.sub(r"\n{3,}", "\n\n", body)
        return body.strip()

    def check_connection(self) -> bool:
        try:
            mail = self._connect()
            mail.logout()
            return True
        except Exception:
            return False

import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Gmail IMAP (free)
    GMAIL_EMAIL: str = os.getenv("GMAIL_EMAIL", "")
    GMAIL_APP_PASSWORD: str = os.getenv("GMAIL_APP_PASSWORD", "")
    IMAP_SERVER: str = "imap.gmail.com"
    IMAP_PORT: int = 993

    # Google Calendar iCal (free)
    GOOGLE_CALENDAR_ICAL_URL: str = os.getenv("GOOGLE_CALENDAR_ICAL_URL", "")

    # App
    APP_HOST: str = os.getenv("APP_HOST", "0.0.0.0")
    APP_PORT: int = int(os.getenv("APP_PORT", "8000"))
    CHECK_INTERVAL_MINUTES: int = int(os.getenv("CHECK_INTERVAL_MINUTES", "5"))


settings = Settings()

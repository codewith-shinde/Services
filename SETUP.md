# AI Mail & Calendar Assistant — Setup Guide (100% Free)

No Google Cloud Console. No billing. No API keys to pay for.

## Step 1: Install Ollama (Free Local AI)

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2
ollama serve
```

## Step 2: Gmail App Password (Free)

1. Go to your Google Account: https://myaccount.google.com/
2. Go to **Security** → Enable **2-Step Verification** (if not already)
3. Go to **Security** → **2-Step Verification** → scroll to **App passwords** (at the bottom)
4. Select app: **Mail**, Select device: **Other** → name it "AI Assistant"
5. Click **Generate** → copy the **16-character password**

## Step 3: Google Calendar iCal URL (Free, Optional)

1. Open Google Calendar (calendar.google.com)
2. Click the gear icon → **Settings**
3. Click your calendar name on the left
4. Scroll to **"Secret address in iCal format"**
5. Copy the URL

## Step 4: Configure .env

```bash
cp .env.example .env
```

Edit `.env`:
```
GMAIL_EMAIL=your_email@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
GOOGLE_CALENDAR_ICAL_URL=https://calendar.google.com/calendar/ical/...
```

## Step 5: Install & Run

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run.py
```

Open **http://localhost:8000** — that's it!

## What It Does
- Reads & summarizes your emails with AI (CRITICAL/HIGH/MEDIUM/LOW)
- Shows today's meetings with attendees and Meet links
- Notifies you about important emails needing attention
- Daily digest: one-click AI briefing
- Auto-refreshes every 5 minutes in background
- 100% local AI via Ollama — nothing leaves your machine
- Runs continuously until you stop it
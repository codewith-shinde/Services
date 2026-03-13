const Imap = require("imap");
const { simpleParser } = require("mailparser");

// Keywords for rule-based classification
const CRITICAL_KW = ["urgent", "asap", "immediately", "critical", "emergency", "action required", "outage", "incident"];
const HIGH_KW = ["important", "deadline", "due today", "approval", "review needed", "blocking", "high priority"];
const PROMO_KW = ["unsubscribe", "opt out", "view in browser", "% off", "discount", "sale", "coupon", "free trial"];

function classifyEmail(subject, body) {
  const text = `${subject} ${body}`.toLowerCase();
  let importance = "MEDIUM";
  let category = "general";

  if (CRITICAL_KW.some((kw) => text.includes(kw))) {
    importance = "CRITICAL";
    category = "urgent";
  } else if (HIGH_KW.some((kw) => text.includes(kw))) {
    importance = "HIGH";
    category = "important";
  } else if (PROMO_KW.some((kw) => text.includes(kw))) {
    importance = "LOW";
    category = "promotion";
  }

  return { importance, category };
}

function fetchEmails(gmailEmail, gmailAppPassword, maxResults = 15) {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: gmailEmail,
      password: gmailAppPassword,
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    });

    const emails = [];

    imap.once("ready", () => {
      imap.openBox("INBOX", true, (err) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        imap.search(["ALL", ["SINCE", new Date(Date.now() - 7 * 86400000)]], (err, uids) => {
          if (err) {
            imap.end();
            return reject(err);
          }

          if (!uids || uids.length === 0) {
            imap.end();
            return resolve([]);
          }

          const latest = uids.slice(-maxResults).reverse();
          const f = imap.fetch(latest, { bodies: "", struct: true });

          f.on("message", (msg, seqno) => {
            msg.on("body", (stream) => {
              simpleParser(stream, (err, parsed) => {
                if (err) return;

                const subject = parsed.subject || "(No Subject)";
                const body = parsed.text || "";
                const snippet = body.slice(0, 300);
                const { importance, category } = classifyEmail(subject, body);

                emails.push({
                  message_id: parsed.messageId || `msg-${seqno}`,
                  subject,
                  sender: parsed.from ? parsed.from.text : "Unknown",
                  date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
                  snippet,
                  body: body.slice(0, 5000),
                  is_unread: !parsed.flags || !parsed.flags.includes("\\Seen"),
                  importance,
                  category,
                });
              });
            });
          });

          f.once("end", () => {
            imap.end();
            // Small delay to let parsers finish
            setTimeout(() => resolve(emails), 500);
          });

          f.once("error", (err) => {
            imap.end();
            reject(err);
          });
        });
      });
    });

    imap.once("error", reject);
    imap.connect();
  });
}

module.exports = { fetchEmails, classifyEmail };

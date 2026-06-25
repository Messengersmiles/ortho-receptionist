const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const twilio = require("twilio");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/conversation-relay" });

// ===== CONFIG =====
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const publicHost = process.env.PUBLIC_HOST; // example: ortho-receptionist-uc4w.onrender.com
const client = twilio(accountSid, authToken);

const twilioNumber = "+17144770304";
const officeLineTextNumber = "+17149420707";
const doctorEmergencyNumber = "+17145007127";
const bookingLink = "https://www.messenger-smiles.com/bookOnline";

const OFFICE_TIMEZONE = "America/Los_Angeles";

// Riley
const ELEVENLABS_VOICE = "hA4zGnmTwX2NQiTRMt7o";

// Set to "A" or "B" if you ever want to force the Tuesday lunch pattern manually.
// Leave as null to let it auto-calculate the A/B pattern.
// A starts Tuesday March 31, 2026.
const TUESDAY_LUNCH_PATTERN_OVERRIDE = null;

// In-memory call sessions by callSid
const sessions = new Map();

// ===== HELPERS =====
function formatPhoneNumber(number) {
  if (!number) return "";

  const raw = String(number).trim();

  if (/^\+\d{10,15}$/.test(raw)) return raw;

  const cleaned = raw.replace(/\D/g, "");

  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith("1")) return `+${cleaned}`;

  return "";
}

async function safeText(to, body) {
  try {
    const formattedTo = formatPhoneNumber(to);
    if (!formattedTo || !body) {
      console.log("Skipping text - invalid number or empty body:", to);
      return;
    }

    await client.messages.create({
      body,
      from: twilioNumber,
      to: formattedTo,
    });

    console.log(`Text sent to ${formattedTo}`);
  } catch (err) {
    console.error(`Failed to text ${to}:`, err.message);
  }
}

function getPartsInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const parts = formatter.formatToParts(date);
  const map = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  return {
    weekday: map.weekday,
    hour: Number(map.hour),
    minute: Number(map.minute),
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

function getTuesdayLunchPattern(now = new Date()) {
  if (
    TUESDAY_LUNCH_PATTERN_OVERRIDE === "A" ||
    TUESDAY_LUNCH_PATTERN_OVERRIDE === "B"
  ) {
    return TUESDAY_LUNCH_PATTERN_OVERRIDE;
  }

  const anchorTuesdayUtc = new Date("2026-03-31T12:00:00Z");
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const diffMs = now.getTime() - anchorTuesdayUtc.getTime();
  const weeksFromAnchor = Math.floor(diffMs / msPerWeek);

  return Math.abs(weeksFromAnchor) % 2 === 0 ? "A" : "B";
}

function isWithinTimeRange(currentMinutes, startHour, startMinute, endHour, endMinute) {
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return currentMinutes >= start && currentMinutes < end;
}

function isLunchHour(now = new Date()) {
  const parts = getPartsInTimeZone(now, OFFICE_TIMEZONE);
  const currentMinutes = parts.hour * 60 + parts.minute;

  if (parts.weekday === "Mon") {
    return isWithinTimeRange(currentMinutes, 13, 0, 13, 40);
  }

  if (parts.weekday === "Tue") {
    const pattern = getTuesdayLunchPattern(now);
    if (pattern === "A") {
      return isWithinTimeRange(currentMinutes, 12, 0, 13, 30);
    }
    return isWithinTimeRange(currentMinutes, 13, 0, 13, 40);
  }

  if (parts.weekday === "Wed" || parts.weekday === "Thu") {
    return isWithinTimeRange(currentMinutes, 12, 0, 13, 30);
  }

  return false;
}

function normalizeSpeech(text) {
  return (text || "").trim().replace(/\s+/g, " ");
}

function classifyIntent(text) {
  const t = (text || "").toLowerCase();

  if (
    t.includes("reschedule") ||
    t.includes("change appointment") ||
    t.includes("move appointment")
  ) {
    return "reschedule";
  }

  if (
    t.includes("schedule") ||
    t.includes("book appointment") ||
    t.includes("make appointment") ||
    t.includes("consultation") ||
    t.includes("consult")
  ) {
    return "schedule";
  }

  if (
    t.includes("comfort") ||
    t.includes("pokey wire") ||
    t.includes("broken bracket") ||
    t.includes("wire") ||
    t.includes("pain") ||
    t.includes("swelling") ||
    t.includes("trauma") ||
    t.includes("loose band")
  ) {
    return "comfort-visit";
  }

  if (
    t.includes("question") ||
    t.includes("insurance") ||
    t.includes("billing") ||
    t.includes("retainer") ||
    t.includes("account")
  ) {
    return "question";
  }

  return "other";
}

function looksEmergency(text) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("emergency") ||
    t.includes("bleeding") ||
    t.includes("severe swelling") ||
    t.includes("can't breathe") ||
    t.includes("trauma") ||
    t.includes("accident")
  );
}

function sendTextToken(ws, token, last = true) {
  ws.send(
    JSON.stringify({
      type: "text",
      token,
      last,
      interruptible: true,
      preemptible: true,
    })
  );
}

function endConversation(ws, handoffData = {}) {
  ws.send(
    JSON.stringify({
      type: "end",
      handoffData: JSON.stringify(handoffData),
    })
  );
}

async function finalizeAndNotify(session, ws) {
  const lines = [
    "📞 AI RECEPTIONIST",
    `Name: ${session.patientName || "Not captured"}`,
    `Caller: ${session.callerNumber || "Unknown"}`,
    `Request: ${session.intent || "Unknown"}`,
    `Details: ${session.reason || "None provided"}`,
  ];

  if (session.preferredTimes) {
    lines.push(`Preferred days/times: ${session.preferredTimes}`);
  }

  if (session.urgency) {
    lines.push(`Urgency: ${session.urgency}`);
  }

  lines.push("Next step: Follow up with patient");

  await safeText(officeLineTextNumber, lines.join("\n"));

  sendTextToken(
    ws,
    "Perfect. I've passed your information to our team, and someone will follow up with you shortly."
  );

  setTimeout(() => {
    endConversation(ws, {
      reason: "intake-complete",
      callSid: session.callSid,
      patientName: session.patientName,
      intent: session.intent,
    });
  }, 2500);
}

// ===== INBOUND CALL WEBHOOK =====
app.post("/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const connect = twiml.connect();

  connect.conversationRelay({
    url: `wss://${publicHost}/conversation-relay`,
    ttsProvider: "ElevenLabs",
    voice: ELEVENLABS_VOICE,
    interruptible: "speech",
    welcomeGreeting: isLunchHour()
      ? "Hi, thank you for calling Messenger Orthodontics. Our team is away from the desk for lunch right now, but I'm a virtual receptionist and I can help take your message."
      : "Hi, thank you for calling Messenger Orthodontics. Our team is currently with patients, but I'm a virtual receptionist and I can help take your message.",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== WEBSOCKET / CONVERSATION RELAY =====
wss.on("connection", (ws) => {
  let currentCallSid = null;

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "setup") {
        currentCallSid = msg.callSid;

        const session = {
          callSid: msg.callSid,
          callerNumber: formatPhoneNumber(msg.from || ""),
          patientName: "",
          intent: "",
          reason: "",
          preferredTimes: "",
          urgency: "",
          stage: "ask-name",
        };

        sessions.set(msg.callSid, session);

        sendTextToken(
          ws,
          "Please say the patient's first and last name."
        );
        return;
      }

      if (msg.type !== "prompt" || !msg.last || !currentCallSid) {
        return;
      }

      const session = sessions.get(currentCallSid);
      if (!session) return;

      const userText = normalizeSpeech(msg.voicePrompt || "");
      if (!userText) {
        if (session.stage === "ask-name") {
          sendTextToken(ws, "I'm sorry, I didn't catch that. Please say the patient's first and last name.");
        } else if (session.stage === "ask-reason") {
          sendTextToken(ws, "I'm sorry, I didn't catch that. Please briefly tell me what you need help with today.");
        } else if (session.stage === "ask-times") {
          sendTextToken(ws, "I'm sorry, I didn't catch that. What days and times usually work best for you?");
        } else if (session.stage === "ask-urgency") {
          sendTextToken(ws, "I'm sorry, I didn't catch that. Would you describe this as mild discomfort, urgent, or an emergency?");
        } else if (session.stage === "ask-question-details") {
          sendTextToken(ws, "I'm sorry, I didn't catch that. Please tell me your question, and I'll pass it along to the team.");
        } else {
          sendTextToken(ws, "I'm sorry, I didn't catch that. Please say that one more time.");
        }
        return;
      }

      if (session.stage === "ask-name") {
        session.patientName = userText;
        session.stage = "ask-reason";

        sendTextToken(
          ws,
          "Thank you. How can we help today? You can say schedule an appointment, reschedule, comfort visit, or ask a question."
        );
        return;
      }

      if (session.stage === "ask-reason") {
        session.reason = userText;
        session.intent = classifyIntent(userText);

        if (looksEmergency(userText)) {
          session.urgency = "Possible emergency";

          await safeText(
            doctorEmergencyNumber,
            `🚨 POSSIBLE ORTHO EMERGENCY
Name: ${session.patientName || "Not captured"}
Caller: ${session.callerNumber || "Unknown"}
Details: ${session.reason}`
          );

          await safeText(
            officeLineTextNumber,
            `🚨 POSSIBLE ORTHO EMERGENCY
Name: ${session.patientName || "Not captured"}
Caller: ${session.callerNumber || "Unknown"}
Details: ${session.reason}
Next step: Contact patient immediately`
          );

          sendTextToken(
            ws,
            "Thank you. I've marked this as urgent and sent it to the team right away. If this is a serious medical emergency, please hang up and call 9 1 1."
          );

          setTimeout(() => {
            endConversation(ws, {
              reason: "possible-emergency",
              callSid: session.callSid,
            });
          }, 3000);

          sessions.delete(session.callSid);
          return;
        }

        if (session.intent === "schedule" || session.intent === "reschedule") {
          session.stage = "ask-times";
          sendTextToken(
            ws,
            "Got it. What days and times usually work best for you?"
          );
          return;
        }

        if (session.intent === "comfort-visit") {
          session.stage = "ask-urgency";
          sendTextToken(
            ws,
            "Thanks. Would you describe this as mild discomfort, urgent, or an emergency?"
          );
          return;
        }

        if (session.intent === "question") {
          session.stage = "ask-question-details";
          sendTextToken(
            ws,
            "Of course. Please tell me your question, and I'll pass it along to the team."
          );
          return;
        }

        session.stage = "finish";
        await finalizeAndNotify(session, ws);
        sessions.delete(session.callSid);
        return;
      }

      if (session.stage === "ask-times") {
        session.preferredTimes = userText;
        session.stage = "finish";
        await finalizeAndNotify(session, ws);
        sessions.delete(session.callSid);
        return;
      }

      if (session.stage === "ask-urgency") {
        session.urgency = userText;
        session.stage = "finish";
        await finalizeAndNotify(session, ws);
        sessions.delete(session.callSid);
        return;
      }

      if (session.stage === "ask-question-details") {
        session.reason = userText;
        session.stage = "finish";
        await finalizeAndNotify(session, ws);
        sessions.delete(session.callSid);
        return;
      }
    } catch (err) {
      console.error("WebSocket message error:", err.message);
      try {
        sendTextToken(
          ws,
          "I'm sorry, something went wrong. Please call us again in a moment."
        );
        endConversation(ws, { reason: "server-error" });
      } catch (_) {}
    }
  });

  ws.on("close", () => {
    if (currentCallSid && sessions.has(currentCallSid)) {
      sessions.delete(currentCallSid);
    }
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
});

// ===== HEALTH CHECK =====
app.get("/", (req, res) => {
  res.send("Messenger Orthodontics Conversation Relay server is running.");
});

// ===== SERVER =====
const PORT = process.env.PORT || 5050;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
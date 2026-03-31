const express = require("express");
const twilio = require("twilio");

const app = express();
app.use(express.urlencoded({ extended: false }));

// ===== CONFIG =====
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const twilioNumber = "+17144770304";
const officeLineTextNumber = "+17149420707";
const doctorEmergencyNumber = "+17145007127";
const bookingLink = "https://www.messenger-smiles.com/bookOnline";

// ===== HELPERS =====
function formatPhoneNumber(number) {
  if (!number) return "";
  const cleaned = String(number).replace(/\D/g, "");
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith("1")) return `+${cleaned}`;
  if (String(number).startsWith("+")) return String(number);
  return `+${cleaned}`;
}

async function safeText(to, body) {
  try {
    if (!to || !body) return;
    await client.messages.create({
      body,
      from: twilioNumber,
      to: formatPhoneNumber(to),
    });
    console.log(`Text sent to ${to}`);
  } catch (err) {
    console.error(`Failed to text ${to}:`, err.message);
  }
}

function sayMessage(twiml, message) {
  twiml.say(
    {
      voice: "Google.en-US-Wavenet-F",
    },
    message
  );
}

function normalizeSpeech(text) {
  return (text || "").trim();
}

function classifyMenuChoice(input) {
  const text = (input || "").toLowerCase().trim();

  if (
    text === "1" ||
    text.includes("one") ||
    text.includes("new patient") ||
    text.includes("consult")
  ) {
    return "new-patient";
  }

  if (
    text === "2" ||
    text === "to" ||
    text === "too" ||
    text.includes("two") ||
    text.includes("comfort") ||
    text.includes("pokey wire") ||
    text.includes("broken bracket") ||
    text.includes("wire") ||
    text.includes("pain")
  ) {
    return "comfort-visit";
  }

  if (
    text === "3" ||
    text.includes("three") ||
    text.includes("schedule") ||
    text.includes("reschedule") ||
    text.includes("appointment")
  ) {
    return "schedule";
  }

  if (
    text === "4" ||
    text.includes("four") ||
    text.includes("other") ||
    text.includes("another")
  ) {
    return "other";
  }

  return "";
}

function hasSpeechOrDigits(req) {
  return !!(
    (req.body.SpeechResult && req.body.SpeechResult.trim()) ||
    (req.body.Digits && req.body.Digits.trim())
  );
}

function buildMainMenu(twiml) {
  const gather = twiml.gather({
    input: "speech dtmf",
    action: "/handle-main-menu",
    method: "POST",
    timeout: 4,
    numDigits: 1,
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
    hints:
      "new patient consultation, comfort visit, pokey wire, broken bracket, schedule, reschedule, another reason for my call",
  });

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "You can say or press 1 for new patient consultation, 2 for comfort visit, 3 for schedule or reschedule an appointment, or 4 for another reason for your call."
  );
}

function repeatQuestion(twiml, question, action, hints = "") {
  sayMessage(twiml, "I am sorry, I did not catch that.");

  const gather = twiml.gather({
    input: "speech",
    action,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
    ...(hints ? { hints } : {}),
  });

  gather.say({ voice: "Google.en-US-Wavenet-F" }, question);
}

// ===== MAIN MENU =====
app.post("/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  sayMessage(
    twiml,
    "Hi, welcome to Messenger Orthodontics. We are either helping another patient or on the other line, but I can gather your information and a team member will get back to you. How can I help you today?"
  );

  buildMainMenu(twiml);

  res.type("text/xml");
  res.send(twiml.toString());
});

// NEW ROUTE: skips welcome and goes straight to options
app.post("/main-menu-only", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  buildMainMenu(twiml);
  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/handle-main-menu", (req, res) => {
  const input = req.body.SpeechResult || req.body.Digits || "";
  const route = classifyMenuChoice(input);
  const twiml = new twilio.twiml.VoiceResponse();

  if (!hasSpeechOrDigits(req) || !route) {
    sayMessage(twiml, "I am sorry, I did not catch that.");
    buildMainMenu(twiml);
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  if (route === "new-patient") {
    twiml.redirect("/new-patient-age-group");
  } else if (route === "comfort-visit") {
    twiml.redirect("/comfort-visit-issue");
  } else if (route === "schedule") {
    twiml.redirect("/schedule-type");
  } else {
    twiml.redirect("/other-reason");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== NEW PATIENT FLOW =====
app.post("/new-patient-age-group", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const question =
    "Awesome. We are excited to meet you. Is this consultation for a child, teen, or adult?";

  const gather = twiml.gather({
    input: "speech",
    action: "/new-patient-concern",
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
    hints: "child, teen, adult",
  });

  gather.say({ voice: "Google.en-US-Wavenet-F" }, question);

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/new-patient-concern", (req, res) => {
  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    const twiml = new twilio.twiml.VoiceResponse();
    repeatQuestion(
      twiml,
      "Awesome. We are excited to meet you. Is this consultation for a child, teen, or adult?",
      "/new-patient-concern",
      "child, teen, adult"
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const ageGroup = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();
  const question =
    "What is the patient's main concern today? For example braces, Invisalign, crowding, spacing, or bite.";

  const gather = twiml.gather({
    input: "speech",
    action: `/new-patient-time?ageGroup=${encodeURIComponent(ageGroup)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
    hints: "braces, invisalign, crowding, spacing, bite",
  });

  gather.say({ voice: "Google.en-US-Wavenet-F" }, question);

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/new-patient-time", (req, res) => {
  const ageGroup = req.query.ageGroup || "";

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    const twiml = new twilio.twiml.VoiceResponse();
    repeatQuestion(
      twiml,
      "What is the patient's main concern today? For example braces, Invisalign, crowding, spacing, or bite.",
      `/new-patient-time?ageGroup=${encodeURIComponent(ageGroup)}`,
      "braces, invisalign, crowding, spacing, bite"
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const concern = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();
  const question =
    "What days or times usually work best for you for a consultation?";

  const gather = twiml.gather({
    input: "speech",
    action: `/new-patient-name?ageGroup=${encodeURIComponent(ageGroup)}&concern=${encodeURIComponent(concern)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  gather.say({ voice: "Google.en-US-Wavenet-F" }, question);

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/new-patient-name", (req, res) => {
  const ageGroup = req.query.ageGroup || "";
  const concern = req.query.concern || "";

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    const twiml = new twilio.twiml.VoiceResponse();
    repeatQuestion(
      twiml,
      "What days or times usually work best for you for a consultation?",
      `/new-patient-name?ageGroup=${encodeURIComponent(ageGroup)}&concern=${encodeURIComponent(concern)}`
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const preferredTimes = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();
  const question = "Please say the patient's first and last name.";

  const gather = twiml.gather({
    input: "speech",
    action: `/new-patient-finish?ageGroup=${encodeURIComponent(ageGroup)}&concern=${encodeURIComponent(concern)}&preferredTimes=${encodeURIComponent(preferredTimes)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  gather.say({ voice: "Google.en-US-Wavenet-F" }, question);

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/new-patient-finish", async (req, res) => {
  const ageGroup = req.query.ageGroup || "";
  const concern = req.query.concern || "";
  const preferredTimes = req.query.preferredTimes || "";

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    const twiml = new twilio.twiml.VoiceResponse();
    repeatQuestion(
      twiml,
      "Please say the patient's first and last name.",
      `/new-patient-finish?ageGroup=${encodeURIComponent(ageGroup)}&concern=${encodeURIComponent(concern)}&preferredTimes=${encodeURIComponent(preferredTimes)}`
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const patientName = normalizeSpeech(req.body.SpeechResult);
  const callerNumber = formatPhoneNumber(req.body.From || "");

  await safeText(
    officeLineTextNumber,
    `NEW PATIENT CONSULTATION
Name: ${patientName}
Caller: ${callerNumber}
Patient type: ${ageGroup}
Main concern: ${concern}
Preferred days/times: ${preferredTimes}
Next step: Text consult options and call patient ASAP`
  );

  if (callerNumber) {
    await safeText(
      callerNumber,
      `Thanks for calling Messenger Orthodontics${patientName ? ", " + patientName : ""}! If you prefer to look at our availability and book your new patient consultation online, feel free to do so here:
${bookingLink}

A team member will also be reaching out shortly.`
    );
  }

  const twiml = new twilio.twiml.VoiceResponse();
  sayMessage(
    twiml,
    "Thank you. I have sent your information to our team, and we will text you shortly."
  );
  twiml.redirect("/anything-else");

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== COMFORT VISIT FLOW =====
app.post("/comfort-visit-issue", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const question =
    "Please tell me the issue. For example pokey wire, broken bracket, loose band, pain, swelling, or trauma.";

  const gather = twiml.gather({
    input: "speech",
    action: "/comfort-visit-urgency",
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
    hints: "pokey wire, broken bracket, loose band, pain, swelling, trauma",
  });

  gather.say({ voice: "Google.en-US-Wavenet-F" }, question);

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/comfort-visit-urgency", (req, res) => {
  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    const twiml = new twilio.twiml.VoiceResponse();
    repeatQuestion(
      twiml,
      "Please tell me the issue. For example pokey wire, broken bracket, loose band, pain, swelling, or trauma.",
      "/comfort-visit-urgency",
      "pokey wire, broken bracket, loose band, pain, swelling, trauma"
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const issue = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();
  const question =
    "Would you describe this as mild discomfort, urgent, or an emergency?";

  const gather = twiml.gather({
    input: "speech",
    action: `/comfort-visit-name?issue=${encodeURIComponent(issue)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
    hints: "mild discomfort, urgent, emergency",
  });

  gather.say({ voice: "Google.en-US-Wavenet-F" }, question);

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/comfort-visit-name", (req, res) => {
  const issue = req.query.issue || "";

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    const twiml = new twilio.twiml.VoiceResponse();
    repeatQuestion(
      twiml,
      "Would you describe this as mild discomfort, urgent, or an emergency?",
      `/comfort-visit-name?issue=${encodeURIComponent(issue)}`,
      "mild discomfort, urgent, emergency"
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const urgency = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();
  const question = "Please say the patient's first and last name.";

  const gather = twiml.gather({
    input: "speech",
    action: `/comfort-visit-finish?issue=${encodeURIComponent(issue)}&urgency=${encodeURIComponent(urgency)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  gather.say({ voice: "Google.en-US-Wavenet-F" }, question);

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/comfort-visit-finish", async (req, res) => {
  const issue = req.query.issue || "";
  const urgency = req.query.urgency || "";

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    const twiml = new twilio.twiml.VoiceResponse();
    repeatQuestion(
      twiml,
      "Please say the patient's first and last name.",
      `/comfort-visit-finish?issue=${encodeURIComponent(issue)}&urgency=${encodeURIComponent(urgency)}`
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const patientName = normalizeSpeech(req.body.SpeechResult);
  const callerNumber = formatPhoneNumber(req.body.From || "");

  await safeText(
    officeLineTextNumber,
    `COMFORT VISIT
Name: ${patientName}
Caller: ${callerNumber}
Issue: ${issue}
Urgency: ${urgency}
Next step: Text or call- offer comfort visit`
  );

  const twiml = new twilio.twiml.VoiceResponse();
  sayMessage(twiml, "Thank you. I have sent your message to our team.");
  twiml.redirect("/anything-else");

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== SCHEDULE / RESCHEDULE FLOW =====
app.post("/schedule-type", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const question =
    "Are you trying to schedule a new appointment or reschedule an existing appointment?";

  const gather = twiml.gather({
    input: "speech",
    action: "/schedule-visit-kind",
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
    hints: "schedule, new appointment, reschedule, existing appointment",
  });

  gather.say({ voice: "Google.en-US-Wavenet-F" }, question);

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/schedule-visit-kind", (req, res) => {
  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    const twiml = new twilio.twiml.VoiceResponse();
    repeatQuestion(
      twiml,
      "Are you trying to schedule a new appointment or reschedule an existing appointment?",
      "/schedule-visit-kind",
      "schedule, new appointment, reschedule, existing appointment"
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const scheduleType = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();
  const question =
    "If this is a new appointment, is this for a regular adjustment appointment, an observation or check appointment, a short visit, or something else? If this is a reschedule please note that there is a 40 dollar cancellation fee for any missed or cancelled appointments within 48 hours of appointment.";

  const gather = twiml.gather({
    input: "speech",
    action: `/schedule-name?scheduleType=${encodeURIComponent(scheduleType)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
    hints:
      "regular adjustment appointment, observation appointment, check appointment, short visit, something else",
  });

  gather.say({ voice: "Google.en-US-Wavenet-F" }, question);

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/schedule-name", (req, res) => {
  const scheduleType = req.query.scheduleType || "";

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    const twiml = new twilio.twiml.VoiceResponse();
    repeatQuestion(
      twiml,
      "If this is a new appointment, is this for a regular adjustment appointment, an observation or check appointment, a short visit, or something else? If this is a reschedule please note that there is a 40 dollar cancellation fee for any missed or cancelled appointments within 48 hours of appointment.",
      `/schedule-name?scheduleType=${encodeURIComponent(scheduleType)}`,
      "regular adjustment appointment, observation appointment, check appointment, short visit, something else"
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const visitKind = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();
  const question = "Please say the patient's first and last name.";

  const gather = twiml.gather({
    input: "speech",
    action: `/schedule-preferred-time?scheduleType=${encodeURIComponent(scheduleType)}&visitKind=${encodeURIComponent(visitKind)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  gather.say({ voice: "Google.en-US-Wavenet-F" }, question);

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/schedule-preferred-time", (req, res) => {
  const scheduleType = req.query.scheduleType || "";
  const visitKind = req.query.visitKind || "";

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    const twiml = new twilio.twiml.VoiceResponse();
    repeatQuestion(
      twiml,
      "Please say the patient's first and last name.",
      `/schedule-preferred-time?scheduleType=${encodeURIComponent(scheduleType)}&visitKind=${encodeURIComponent(visitKind)}`
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const patientName = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();
  const question = "What days or times work best for you?";

  const gather = twiml.gather({
    input: "speech",
    action: `/schedule-finish?scheduleType=${encodeURIComponent(scheduleType)}&visitKind=${encodeURIComponent(visitKind)}&patientName=${encodeURIComponent(patientName)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  gather.say({ voice: "Google.en-US-Wavenet-F" }, question);

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/schedule-finish", async (req, res) => {
  const scheduleType = req.query.scheduleType || "";
  const visitKind = req.query.visitKind || "";
  const patientName = req.query.patientName || "";

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    const twiml = new twilio.twiml.VoiceResponse();
    repeatQuestion(
      twiml,
      "What days or times work best for you?",
      `/schedule-finish?scheduleType=${encodeURIComponent(scheduleType)}&visitKind=${encodeURIComponent(visitKind)}&patientName=${encodeURIComponent(patientName)}`
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const preferredTimes = normalizeSpeech(req.body.SpeechResult);
  const callerNumber = formatPhoneNumber(req.body.From || "");

  await safeText(
    officeLineTextNumber,
    `SCHEDULE / RESCHEDULE
Name: ${patientName}
Caller: ${callerNumber}
Request type: ${scheduleType}
Visit type: ${visitKind}
Preferred days/times: ${preferredTimes}
Next step: Text appointment options`
  );

  const twiml = new twilio.twiml.VoiceResponse();
  sayMessage(twiml, "Thank you. I have sent your request to our team.");
  twiml.redirect("/anything-else");

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== OTHER FLOW =====
app.post("/other-reason", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const question = "Please briefly tell me the reason for your call.";

  const gather = twiml.gather({
    input: "speech",
    action: "/other-name",
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  gather.say({ voice: "Google.en-US-Wavenet-F" }, question);

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/other-name", (req, res) => {
  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    const twiml = new twilio.twiml.VoiceResponse();
    repeatQuestion(
      twiml,
      "Please briefly tell me the reason for your call.",
      "/other-name"
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const reason = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();
  const question = "Please say your first and last name.";

  const gather = twiml.gather({
    input: "speech",
    action: `/other-finish?reason=${encodeURIComponent(reason)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  gather.say({ voice: "Google.en-US-Wavenet-F" }, question);

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/other-finish", async (req, res) => {
  const reason = req.query.reason || "";

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    const twiml = new twilio.twiml.VoiceResponse();
    repeatQuestion(
      twiml,
      "Please say your first and last name.",
      `/other-finish?reason=${encodeURIComponent(reason)}`
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const patientName = normalizeSpeech(req.body.SpeechResult);
  const callerNumber = formatPhoneNumber(req.body.From || "");

  await safeText(
    officeLineTextNumber,
    `OTHER CALL
Name: ${patientName}
Caller: ${callerNumber}
Reason: ${reason}
Next step: Text follow-up`
  );

  const twiml = new twilio.twiml.VoiceResponse();
  sayMessage(twiml, "Thank you. I have sent your message to our team.");
  twiml.redirect("/anything-else");

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== ANYTHING ELSE =====
app.post("/anything-else", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech dtmf",
    action: "/anything-else-handle",
    method: "POST",
    numDigits: 1,
    timeout: 4,
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
    hints: "yes, no",
  });

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "Is there anything else I can help you with? Please say yes or no."
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/anything-else-handle", (req, res) => {
  const answer = (req.body.SpeechResult || req.body.Digits || "").toLowerCase();
  const twiml = new twilio.twiml.VoiceResponse();

  if (!hasSpeechOrDigits(req)) {
    sayMessage(twiml, "I am sorry, I did not catch that.");

    const gather = twiml.gather({
      input: "speech dtmf",
      action: "/anything-else-handle",
      method: "POST",
      numDigits: 1,
      timeout: 4,
      speechTimeout: "auto",
      enhanced: true,
      speechModel: "phone_call",
      language: "en-US",
      hints: "yes, no",
    });

    gather.say(
      { voice: "Google.en-US-Wavenet-F" },
      "Is there anything else I can help you with? Please say yes or no."
    );

    res.type("text/xml");
    return res.send(twiml.toString());
  }

  if (answer.includes("yes") || answer === "1") {
    twiml.redirect("/main-menu-only");
  } else if (answer.includes("no") || answer === "2") {
    sayMessage(twiml, "Thank you for calling Messenger Orthodontics. Goodbye.");
    twiml.hangup();
  } else {
    sayMessage(twiml, "I am sorry, I did not catch that.");

    const gather = twiml.gather({
      input: "speech dtmf",
      action: "/anything-else-handle",
      method: "POST",
      numDigits: 1,
      timeout: 4,
      speechTimeout: "auto",
      enhanced: true,
      speechModel: "phone_call",
      language: "en-US",
      hints: "yes, no",
    });

    gather.say(
      { voice: "Google.en-US-Wavenet-F" },
      "Is there anything else I can help you with? Please say yes or no."
    );
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== SERVER =====
const PORT = 5050;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
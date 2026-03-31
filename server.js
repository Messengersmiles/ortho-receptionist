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

  const raw = String(number).trim();

  // already valid E.164 like +17149420707
  if (/^\+\d{10,15}$/.test(raw)) {
    return raw;
  }

  const cleaned = raw.replace(/\D/g, "");

  // US 10-digit number
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }

  // US 11-digit number starting with 1
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  }

  // anything else is invalid
  return "";
}

async function safeText(to, body) {
  try {
    const formattedTo = formatPhoneNumber(to);

    if (!formattedTo || !body) {
      console.log("Skipping text - invalid number:", to);
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

function yesNoValue(input) {
  const text = (input || "").toLowerCase().trim();

  if (
    text === "1" ||
    text.includes("yes") ||
    text.includes("yeah") ||
    text.includes("yep")
  ) {
    return "Yes";
  }

  if (
    text === "2" ||
    text.includes("no") ||
    text.includes("nope")
  ) {
    return "No";
  }

  return normalizeSpeech(input);
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
    text.includes("appointment")
  ) {
    return "schedule";
  }

  if (
    text === "4" ||
    text.includes("four") ||
    text.includes("reschedule")
  ) {
    return "reschedule";
  }

  if (
    text === "5" ||
    text.includes("five") ||
    text.includes("other") ||
    text.includes("question") ||
    text.includes("another reason")
  ) {
    return "other";
  }

  return "";
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
      "new patient consultation, comfort visit, pokey wire, broken bracket, schedule appointment, reschedule appointment, other questions",
  });

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "You can say or press 1 for new patient consultation, 2 for comfort visit, 3 to schedule an appointment, 4 to reschedule an existing appointment, or 5 for any other questions."
  );
}

function hasSpeechOrDigits(req) {
  return !!(
    (req.body.SpeechResult && req.body.SpeechResult.trim()) ||
    (req.body.Digits && req.body.Digits.trim())
  );
}

function repeatSpeechQuestion(twiml, question, action, hints = "") {
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

function repeatSpeechOrDtmfQuestion(twiml, question, action, hints = "") {
  sayMessage(twiml, "I am sorry, I did not catch that.");

  const gather = twiml.gather({
    input: "speech dtmf",
    action,
    method: "POST",
    numDigits: 1,
    timeout: 4,
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
    twiml.redirect("/schedule-appointment-type");
  } else if (route === "reschedule") {
    twiml.redirect("/reschedule-name");
  } else {
    twiml.redirect("/other-reason");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== NEW PATIENT FLOW =====
app.post("/new-patient-age-group", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

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

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "Awesome. We are excited to meet you. Is this consultation for a child, teen, or adult?"
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/new-patient-concern", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    repeatSpeechQuestion(
      twiml,
      "Awesome. We are excited to meet you. Is this consultation for a child, teen, or adult?",
      "/new-patient-concern",
      "child, teen, adult"
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const ageGroup = normalizeSpeech(req.body.SpeechResult);

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

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "What is the patient's main concern today? For example braces, Invisaline, crowding, spacing, or bite."
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/new-patient-time", (req, res) => {
  const ageGroup = req.query.ageGroup || "";
  const twiml = new twilio.twiml.VoiceResponse();

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    repeatSpeechQuestion(
      twiml,
      "What is the patient's main concern today? For example braces, Invisalign, crowding, spacing, or bite.",
      `/new-patient-time?ageGroup=${encodeURIComponent(ageGroup)}`,
      "braces, invisalign, crowding, spacing, bite"
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const concern = normalizeSpeech(req.body.SpeechResult);

  const gather = twiml.gather({
    input: "speech",
    action: `/new-patient-name?ageGroup=${encodeURIComponent(ageGroup)}&concern=${encodeURIComponent(concern)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "What days or times usually work best for you for a consultation?"
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/new-patient-name", (req, res) => {
  const ageGroup = req.query.ageGroup || "";
  const concern = req.query.concern || "";
  const twiml = new twilio.twiml.VoiceResponse();

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    repeatSpeechQuestion(
      twiml,
      "What days or times usually work best for you for a consultation?",
      `/new-patient-name?ageGroup=${encodeURIComponent(ageGroup)}&concern=${encodeURIComponent(concern)}`
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const preferredTimes = normalizeSpeech(req.body.SpeechResult);

  const gather = twiml.gather({
    input: "speech",
    action: `/new-patient-finish?ageGroup=${encodeURIComponent(ageGroup)}&concern=${encodeURIComponent(concern)}&preferredTimes=${encodeURIComponent(preferredTimes)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "Please say the patient's first and last name."
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/new-patient-finish", async (req, res) => {
  const ageGroup = req.query.ageGroup || "";
  const concern = req.query.concern || "";
  const preferredTimes = req.query.preferredTimes || "";
  const twiml = new twilio.twiml.VoiceResponse();

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    repeatSpeechQuestion(
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

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "Please tell me the issue. For example pokey wire, broken bracket, loose band, pain, swelling, or trauma."
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/comfort-visit-urgency", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    repeatSpeechQuestion(
      twiml,
      "Please tell me the issue. For example pokey wire, broken bracket, loose band, pain, swelling, or trauma.",
      "/comfort-visit-urgency",
      "pokey wire, broken bracket, loose band, pain, swelling, trauma"
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const issue = normalizeSpeech(req.body.SpeechResult);

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

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "Would you describe this as mild discomfort, urgent, or an emergency?"
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/comfort-visit-name", (req, res) => {
  const issue = req.query.issue || "";
  const twiml = new twilio.twiml.VoiceResponse();

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    repeatSpeechQuestion(
      twiml,
      "Would you describe this as mild discomfort, urgent, or an emergency?",
      `/comfort-visit-name?issue=${encodeURIComponent(issue)}`,
      "mild discomfort, urgent, emergency"
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const urgency = normalizeSpeech(req.body.SpeechResult);

  const gather = twiml.gather({
    input: "speech",
    action: `/comfort-visit-finish?issue=${encodeURIComponent(issue)}&urgency=${encodeURIComponent(urgency)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "Please say the patient's first and last name."
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/comfort-visit-finish", async (req, res) => {
  const issue = req.query.issue || "";
  const urgency = req.query.urgency || "";
  const twiml = new twilio.twiml.VoiceResponse();

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    repeatSpeechQuestion(
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

  sayMessage(twiml, "Thank you. I have sent your message to our team.");
  twiml.redirect("/anything-else");

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== SCHEDULE APPOINTMENT FLOW =====
app.post("/schedule-appointment-type", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    action: "/schedule-appointment-name",
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
    hints:
      "adjustment appointment, observation appointment, check appointment, short visit, consultation, retainer check",
  });

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "What type of appointment would you like to schedule? For example adjustment appointment, observation or check appointment, short visit, consultation, or something else."
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/schedule-appointment-name", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    repeatSpeechQuestion(
      twiml,
      "What type of appointment would you like to schedule? For example adjustment appointment, observation or check appointment, short visit, consultation, or something else.",
      "/schedule-appointment-name",
      "adjustment appointment, observation appointment, check appointment, short visit, consultation, retainer check"
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const appointmentType = normalizeSpeech(req.body.SpeechResult);

  const gather = twiml.gather({
    input: "speech",
    action: `/schedule-appointment-preferred-times?appointmentType=${encodeURIComponent(appointmentType)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "Please say the patient's first and last name."
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/schedule-appointment-preferred-times", (req, res) => {
  const appointmentType = req.query.appointmentType || "";
  const twiml = new twilio.twiml.VoiceResponse();

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    repeatSpeechQuestion(
      twiml,
      "Please say the patient's first and last name.",
      `/schedule-appointment-preferred-times?appointmentType=${encodeURIComponent(appointmentType)}`
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const patientName = normalizeSpeech(req.body.SpeechResult);

  const gather = twiml.gather({
    input: "speech",
    action: `/schedule-appointment-finish?appointmentType=${encodeURIComponent(appointmentType)}&patientName=${encodeURIComponent(patientName)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "What days and times work best for you?"
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/schedule-appointment-finish", async (req, res) => {
  const appointmentType = req.query.appointmentType || "";
  const patientName = req.query.patientName || "";
  const twiml = new twilio.twiml.VoiceResponse();

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    repeatSpeechQuestion(
      twiml,
      "What days and times work best for you?",
      `/schedule-appointment-finish?appointmentType=${encodeURIComponent(appointmentType)}&patientName=${encodeURIComponent(patientName)}`
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const preferredTimes = normalizeSpeech(req.body.SpeechResult);
  const callerNumber = formatPhoneNumber(req.body.From || "");

  await safeText(
    officeLineTextNumber,
    `SCHEDULE APPOINTMENT
Name: ${patientName}
Caller: ${callerNumber}
Appointment type: ${appointmentType}
Preferred days/times: ${preferredTimes}
Next step: Contact patient with appointment options`
  );

  sayMessage(twiml, "Thank you. I have sent your request to our team.");
  twiml.redirect("/anything-else");

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== RESCHEDULE FLOW =====
app.post("/reschedule-name", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    action: "/reschedule-preferred-times",
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "Any missed or cancelled appointments within 48 hours of appointment time will be subject to a 40 dollar fee. We would like to get you back in as soon as possible. Please say the patient's first and last name."
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/reschedule-preferred-times", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    repeatSpeechQuestion(
      twiml,
      "Any missed or cancelled appointments within 48 hours of appointment time will be subject to a 40 dollar fee. We would like to get you back in as soon as possible. Please say the patient's first and last name.",
      "/reschedule-preferred-times"
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const patientName = normalizeSpeech(req.body.SpeechResult);

  const gather = twiml.gather({
    input: "speech",
    action: `/reschedule-finish?patientName=${encodeURIComponent(patientName)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "What days and times work best for you?"
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/reschedule-finish", async (req, res) => {
  const patientName = req.query.patientName || "";
  const twiml = new twilio.twiml.VoiceResponse();

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    repeatSpeechQuestion(
      twiml,
      "What days and times work best for you?",
      `/reschedule-finish?patientName=${encodeURIComponent(patientName)}`
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const preferredTimes = normalizeSpeech(req.body.SpeechResult);
  const callerNumber = formatPhoneNumber(req.body.From || "");

  await safeText(
    officeLineTextNumber,
    `RESCHEDULE APPOINTMENT
Name: ${patientName}
Caller: ${callerNumber}
Preferred days/times: ${preferredTimes}
Next step: Contact patient as soon as possible to reschedule`
  );

  sayMessage(twiml, "Thank you. I have sent your request to our team.");
  twiml.redirect("/anything-else");

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== OTHER FLOW =====
app.post("/other-reason", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    action: "/other-name",
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "Please tell me your question."
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/other-name", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    repeatSpeechQuestion(
      twiml,
      "Please tell me your question.",
      "/other-name"
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  const reason = normalizeSpeech(req.body.SpeechResult);

  const gather = twiml.gather({
    input: "speech",
    action: `/other-finish?reason=${encodeURIComponent(reason)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "Please say your first and last name."
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/other-finish", async (req, res) => {
  const reason = req.query.reason || "";
  const twiml = new twilio.twiml.VoiceResponse();

  if (!req.body.SpeechResult || !req.body.SpeechResult.trim()) {
    repeatSpeechQuestion(
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
    `OTHER QUESTION
Name: ${patientName}
Caller: ${callerNumber}
Question: ${reason}
Next step: Follow up with patient`
  );

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
    repeatSpeechOrDtmfQuestion(
      twiml,
      "Is there anything else I can help you with? Please say yes or no.",
      "/anything-else-handle",
      "yes, no"
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
    repeatSpeechOrDtmfQuestion(
      twiml,
      "Is there anything else I can help you with? Please say yes or no.",
      "/anything-else-handle",
      "yes, no"
    );
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== SERVER =====
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`MESSENGER TEST VERSION - running on port ${PORT}`);
});
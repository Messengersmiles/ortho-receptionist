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
    text.includes("schedule appointment") ||
    text.includes("schedule an appointment") ||
    (text.includes("schedule") && !text.includes("reschedule"))
  ) {
    return "schedule";
  }

  if (
    text === "4" ||
    text.includes("four") ||
    text.includes("reschedule") ||
    text.includes("change my appointment")
  ) {
    return "reschedule";
  }

  return "other";
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
      "new patient consultation, comfort visit, pokey wire, broken bracket, schedule an appointment, reschedule an existing appointment, another reason for my call",
  });

  gather.say(
    { voice: "Google.en-US-Wavenet-F" },
    "You can say or press 1 for new patient consultation, 2 for comfort visit, 3 to schedule an appointment, 4 to reschedule an existing appointment, or 5 for another reason for your call."
  );
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

  if (route === "new-patient") {
    twiml.redirect("/new-patient-age-group");
  } else if (route === "comfort-visit") {
    twiml.redirect("/comfort-visit-issue");
  } else if (route === "schedule") {
    twiml.redirect("/schedule-appt-type");
  } else if (route === "reschedule") {
    twiml.redirect("/reschedule-protocol");
  } else {
    twiml.redirect("/other-reason");
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== NEW PATIENT FLOW =====
app.post("/new-patient-age-group", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  const input = normalizeSpeech(req.body.SpeechResult);

  // ✅ If nothing heard → retry
  if (!input || input.length < 2) {
    sayMessage(
      twiml,
      "I did not catch that. Please say child, teenager, or adult."
    );

    twiml.gather({
      input: "speech",
      action: "/new-patient-age-group",
      method: "POST",
      speechTimeout: "auto",
      enhanced: true,
      speechModel: "phone_call",
      language: "en-US",
      hints: "child, teenager, adult",
    });

    res.type("text/xml");
    return res.send(twiml.toString());
  }

  // ✅ Continue flow
  sayMessage(
    twiml,
    "What is the patient's main concern today? For example braces, Invisalign, new retainers, crowding, spacing, or bite."
  );

  twiml.gather({
    input: "speech",
    action: `/new-patient-time?ageGroup=${encodeURIComponent(input)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/new-patient-concern", (req, res) => {
  const ageGroup = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();

  sayMessage(
    twiml,
    "What is the patient's main concern today? For example braces, Invisalign, new retainers, crowding, spacing, or bite."
  );

  twiml.gather({
    input: "speech",
    action: `/new-patient-time?ageGroup=${encodeURIComponent(ageGroup)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
    hints: "braces, invisalign, new retainers, crowding, spacing, bite",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/new-patient-time", (req, res) => {
  const ageGroup = req.query.ageGroup || "";
  const concern = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();

  sayMessage(
    twiml,
    "What days or times usually work best for you for a consultation?"
  );

  twiml.gather({
    input: "speech",
    action: `/new-patient-name?ageGroup=${encodeURIComponent(ageGroup)}&concern=${encodeURIComponent(concern)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/new-patient-name", (req, res) => {
  const ageGroup = req.query.ageGroup || "";
  const concern = req.query.concern || "";
  const preferredTimes = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();

  sayMessage(twiml, "Please say the patient's first and last name.");

  twiml.gather({
    input: "speech",
    action: `/new-patient-finish?ageGroup=${encodeURIComponent(ageGroup)}&concern=${encodeURIComponent(concern)}&preferredTimes=${encodeURIComponent(preferredTimes)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/new-patient-finish", async (req, res) => {
  const ageGroup = req.query.ageGroup || "";
  const concern = req.query.concern || "";
  const preferredTimes = req.query.preferredTimes || "";
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

  sayMessage(
    twiml,
    "Please tell me the issue. For example pokey wire, broken bracket, loose band, pain, swelling, or trauma. Be as descript as you would like."
  );

  twiml.gather({
    input: "speech",
    action: "/comfort-visit-urgency",
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
    hints: "pokey wire, broken bracket, loose band, pain, swelling, trauma",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/comfort-visit-urgency", (req, res) => {
  const issue = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();

  sayMessage(
    twiml,
    "Would you describe this as mild discomfort, urgent, or an emergency?"
  );

  twiml.gather({
    input: "speech",
    action: `/comfort-visit-name?issue=${encodeURIComponent(issue)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
    hints: "mild discomfort, urgent, emergency",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/comfort-visit-name", (req, res) => {
  const issue = req.query.issue || "";
  const urgency = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();

  sayMessage(twiml, "Please say the patient's first and last name.");

  twiml.gather({
    input: "speech",
    action: `/comfort-visit-finish?issue=${encodeURIComponent(issue)}&urgency=${encodeURIComponent(urgency)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/comfort-visit-finish", async (req, res) => {
  const issue = req.query.issue || "";
  const urgency = req.query.urgency || "";
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

  let patientText =
    `Thanks for calling Messenger Orthodontics. We received your message and a team member will text you shortly.`;

  const lowerUrgency = urgency.toLowerCase();
  const lowerIssue = issue.toLowerCase();

  if (
    lowerUrgency.includes("emergency") ||
    lowerIssue.includes("trauma") ||
    lowerIssue.includes("bleeding") ||
    lowerIssue.includes("swelling")
  ) {
    patientText =
      `Thanks for calling Messenger Orthodontics. For emergencies like trauma, bleeding, or swelling, Dr. Messenger is always available on her cell phone at (714) 500-7127. We have also sent your message to our team and someone will text you shortly.`;
  }

  const twiml = new twilio.twiml.VoiceResponse();
  sayMessage(twiml, "Thank you. I have sent your message to our team.");
  twiml.redirect("/anything-else");

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== SCHEDULE APPOINTMENT FLOW =====
app.post("/schedule-appt-type", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  sayMessage(
    twiml,
    "What type of appointment would you like to schedule? For example a regular adjustment appointment, an observation or check appointment, a short visit, or something else."
  );

  twiml.gather({
    input: "speech",
    action: "/schedule-name",
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
    hints:
      "regular adjustment appointment, observation appointment, retainer check, or something else",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/schedule-name", (req, res) => {
  const visitKind = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();

  sayMessage(twiml, "Please say the patient's first and last name.");

  twiml.gather({
    input: "speech",
    action: `/schedule-preferred-time?visitKind=${encodeURIComponent(visitKind)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/schedule-preferred-time", (req, res) => {
  const visitKind = req.query.visitKind || "";
  const patientName = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();

  sayMessage(twiml, "What days or times work best for you?");

  twiml.gather({
    input: "speech",
    action: `/schedule-finish?visitKind=${encodeURIComponent(visitKind)}&patientName=${encodeURIComponent(patientName)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/schedule-finish", async (req, res) => {
  const visitKind = req.query.visitKind || "";
  const patientName = req.query.patientName || "";
  const preferredTimes = normalizeSpeech(req.body.SpeechResult);
  const callerNumber = formatPhoneNumber(req.body.From || "");

  await safeText(
    officeLineTextNumber,
    `SCHEDULE APPOINTMENT
Name: ${patientName}
Caller: ${callerNumber}
Appointment type: ${visitKind}
Preferred days/times: ${preferredTimes}
Next step: Text or call with appointment options`
  );

  const twiml = new twilio.twiml.VoiceResponse();
  sayMessage(twiml, "Thank you. I have sent your request to our team.");
  twiml.redirect("/anything-else");

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== RESCHEDULE APPOINTMENT FLOW =====
app.post("/reschedule-protocol", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  sayMessage(
    twiml,
    "Please note there is a 40 dollar fee for missed or cancelled appointments within 48 hours of your appointment. We would like to get you back on the schedule as soon as possible. What was the reason for the cancellation?"
  );

  twiml.gather({
    input: "speech",
    action: "/reschedule-name",
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/reschedule-name", (req, res) => {
  const cancellationReason = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();

  sayMessage(twiml, "Please say the patient's first and last name.");

  twiml.gather({
    input: "speech",
    action: `/reschedule-preferred-time?cancellationReason=${encodeURIComponent(cancellationReason)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/reschedule-preferred-time", (req, res) => {
  const cancellationReason = req.query.cancellationReason || "";
  const patientName = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();

  sayMessage(twiml, "What days or times work best for you?");

  twiml.gather({
    input: "speech",
    action: `/reschedule-finish?cancellationReason=${encodeURIComponent(cancellationReason)}&patientName=${encodeURIComponent(patientName)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/reschedule-finish", async (req, res) => {
  const cancellationReason = req.query.cancellationReason || "";
  const patientName = req.query.patientName || "";
  const preferredTimes = normalizeSpeech(req.body.SpeechResult);
  const callerNumber = formatPhoneNumber(req.body.From || "");

  await safeText(
    officeLineTextNumber,
    `RESCHEDULE APPOINTMENT
Name: ${patientName}
Caller: ${callerNumber}
Reason for cancellation: ${cancellationReason}
Preferred days/times: ${preferredTimes}
Next step: Text rescheduling options and reappoint as soon as possible- reinterate need to come in ASAP to keep treatment on track`
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

  sayMessage(
    twiml,
    "Please briefly tell me the reason for your call."
  );

  twiml.gather({
    input: "speech",
    action: "/other-name",
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/other-name", (req, res) => {
  const reason = normalizeSpeech(req.body.SpeechResult);
  const twiml = new twilio.twiml.VoiceResponse();

  sayMessage(twiml, "Please say your first and last name.");

  twiml.gather({
    input: "speech",
    action: `/other-finish?reason=${encodeURIComponent(reason)}`,
    method: "POST",
    speechTimeout: "auto",
    enhanced: true,
    speechModel: "phone_call",
    language: "en-US",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/other-finish", async (req, res) => {
  const reason = req.query.reason || "";
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

  if (answer.includes("yes") || answer === "1") {
    twiml.redirect("/main-menu-only");
  } else {
    sayMessage(twiml, "Thank you for calling Messenger Orthodontics. Goodbye.");
    twiml.hangup();
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== SERVER =====
const PORT = 5050;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

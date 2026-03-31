TEST


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
const atHomeSolutionsLink = "https://www.messenger-smiles.com/copy-of-what-to-expect";
const atHomeSolutionsPassword = "family";

// Tuesday schedule anchor:
// Week of Tuesday 2026-03-31 = 11 AM to 5 PM
// Following week = 9 AM to 5 PM, then alternating weekly
const tuesdayAnchorDate = new Date("2026-03-31T12:00:00-07:00");

// ===== HELPERS =====
function formatPhoneNumber(num) {
  if (!num) return "";
  const cleaned = String(num).replace(/\D/g, "");
  if (cleaned.length === 10) return "+1" + cleaned;
  if (cleaned.length === 11) return "+" + cleaned;
  return "+" + cleaned;
}

async function sendText(to, body) {
  try {
    await client.messages.create({
      body,
      from: twilioNumber,
      to: formatPhoneNumber(to)
    });
    console.log("Text sent to:", to);
  } catch (e) {
    console.log("Text failed:", e.message);
  }
}

async function sendPatienceText(caller) {
  if (!caller) return;
  await sendText(
    caller,
    "Thank you for your patience. A team member will get back to you."
  );
}

function getPacificDateParts() {
  const now = new Date();

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short"
  }).format(now);

  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      hour12: false
    }).format(now),
    10
  );

  const year = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric"
    }).format(now),
    10
  );

  const month = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "numeric"
    }).format(now),
    10
  );

  const day = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      day: "numeric"
    }).format(now),
    10
  );

  return { weekday, hour, year, month, day };
}

function getCurrentPacificDate() {
  const { year, month, day } = getPacificDateParts();
  return new Date(year, month - 1, day);
}

function getTuesdayHoursText() {
  const today = getCurrentPacificDate();
  const diffMs = today.getTime() - new Date(
    tuesdayAnchorDate.getFullYear(),
    tuesdayAnchorDate.getMonth(),
    tuesdayAnchorDate.getDate()
  ).getTime();

  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  const isElevenToFiveWeek = diffWeeks % 2 === 0;

  return isElevenToFiveWeek ? "11 A M to 5 P M" : "9 A M to 5 P M";
}

function isOfficeOpenNow() {
  const { weekday, hour } = getPacificDateParts();
  const tuesdayHours = getTuesdayHoursText();

  if (weekday === "Mon") return hour >= 11 && hour < 17;
  if (weekday === "Tue") {
    if (tuesdayHours === "11 A M to 5 P M") return hour >= 11 && hour < 17;
    return hour >= 9 && hour < 17;
  }
  if (weekday === "Wed") return hour >= 9 && hour < 17;
  if (weekday === "Thu") return hour >= 9 && hour < 17;

  return false;
}

function askAnythingElse(twiml) {
  const gather = twiml.gather({
    input: "speech",
    speechTimeout: "auto",
    action: "/anything-else",
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say(
    { voice: "alice" },
    "Is there anything else I can help you with?"
  );

  return twiml;
}

function buildVoiceMenuTwiml() {
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    speechTimeout: "auto",
    action: "/route",
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say(
    { voice: "alice" },
    "Hi, thanks for calling Messenger Orthodontics. You can say new patient consultation, comfort visit, schedule or reschedule an appointment, insurance question, financial question, office location and hours, emergency, or another reason for my call."
  );

  twiml.redirect({ method: "POST" }, "/voice");
  return twiml;
}

// ===== MAIN MENU =====
app.get("/", (req, res) => {
  res.send("Server is live");
});

app.all("/voice", (req, res) => {
  res.type("text/xml");
  res.send(buildVoiceMenuTwiml().toString());
});

// ===== RETURN TO MAIN MENU =====
app.post("/anything-else", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const speech = (req.body.SpeechResult || "").toLowerCase();

  if (
    speech.includes("yes") ||
    speech.includes("yeah") ||
    speech.includes("sure") ||
    speech.includes("okay")
  ) {
    twiml.redirect({ method: "POST" }, "/voice");
  } else {
    twiml.say(
      { voice: "alice" },
      "Thank you so much for calling Messenger Orthodontics. Goodbye."
    );
    twiml.hangup();
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== MAIN ROUTER =====
app.post("/route", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const speech = (req.body.SpeechResult || "").toLowerCase();

  console.log("Speech:", speech);

  if (
    speech.includes("new") ||
    speech.includes("consult") ||
    speech.includes("consultation") ||
    speech.includes("patient")
  ) {
    const gather = twiml.gather({
      input: "speech",
      action: "/new-type",
      method: "POST",
      actionOnEmptyResult: true
    });

    gather.say(
      { voice: "alice" },
      "Great. Is this for a child or an adult?"
    );

    res.type("text/xml");
    return res.send(twiml.toString());
  }

  if (
    speech.includes("comfort") ||
    speech.includes("pokey") ||
    speech.includes("wire") ||
    speech.includes("broken bracket") ||
    speech.includes("bracket")
  ) {
    const gather = twiml.gather({
      input: "speech",
      action: "/comfort-name",
      method: "POST",
      actionOnEmptyResult: true
    });

    gather.say(
      { voice: "alice" },
      "I can help with that. Please say the patient's full name."
    );

    res.type("text/xml");
    return res.send(twiml.toString());
  }

  if (speech.includes("reschedule") || speech.includes("cancel")) {
    const gather = twiml.gather({
      input: "speech",
      action: "/reschedule-name",
      method: "POST",
      actionOnEmptyResult: true
    });

    gather.say(
      { voice: "alice" },
      "I can help with that. Please say the patient's full name."
    );

    res.type("text/xml");
    return res.send(twiml.toString());
  }

  if (speech.includes("schedule")) {
    const gather = twiml.gather({
      input: "speech",
      action: "/schedule-name",
      method: "POST",
      actionOnEmptyResult: true
    });

    gather.say(
      { voice: "alice" },
      "I can help with that. Please say the patient's full name."
    );

    res.type("text/xml");
    return res.send(twiml.toString());
  }

  if (speech.includes("insurance")) {
    const gather = twiml.gather({
      input: "speech",
      action: "/insurance-another-question",
      method: "POST",
      actionOnEmptyResult: true
    });

    gather.say(
      { voice: "alice" },
      "We take all P P O insurances. Do you have another insurance question? Please say yes or no."
    );

    res.type("text/xml");
    return res.send(twiml.toString());
  }

  if (
    speech.includes("financial") ||
    speech.includes("balance") ||
    speech.includes("receipt") ||
    speech.includes("ledger") ||
    speech.includes("h s a")
  ) {
    const gather = twiml.gather({
      input: "speech",
      action: "/financial-question-type",
      method: "POST",
      actionOnEmptyResult: true
    });

    gather.say(
      { voice: "alice" },
      "Please let us know if you are looking for remaining balance, H S A financial ledger, a copy of the most recent receipt, or something else."
    );

    res.type("text/xml");
    return res.send(twiml.toString());
  }

  if (
    speech.includes("location") ||
    speech.includes("hours") ||
    speech.includes("office")
  ) {
    const tuesdayHours = getTuesdayHoursText();

    twiml.say(
      { voice: "alice" },
      `We are located in Beachmont Plaza next to Whole Foods in Huntington Beach. Our office hours are Monday 11 A M to 5 P M, Tuesday ${tuesdayHours}, Wednesday 9 A M to 5 P M, and Thursday 9 A M to 5 P M.`
    );

    askAnythingElse(twiml);

    res.type("text/xml");
    return res.send(twiml.toString());
  }

  if (
    speech.includes("emergency") ||
    speech.includes("trauma") ||
    speech.includes("bleeding") ||
    speech.includes("swelling")
  ) {
    const gather = twiml.gather({
      input: "speech",
      action: "/after-hours-emergency",
      method: "POST",
      actionOnEmptyResult: true
    });

    gather.say(
      { voice: "alice" },
      "Please say the patient's full name."
    );

    res.type("text/xml");
    return res.send(twiml.toString());
  }

  if (
    speech.includes("another reason") ||
    speech.includes("another") ||
    speech.includes("other") ||
    speech.includes("something else")
  ) {
    const gather = twiml.gather({
      input: "speech",
      action: "/other-reason-name",
      method: "POST",
      actionOnEmptyResult: true
    });

    gather.say(
      { voice: "alice" },
      "Please say the patient's full name."
    );

    res.type("text/xml");
    return res.send(twiml.toString());
  }

  twiml.say(
    { voice: "alice" },
    "Thank you for your patience. A team member will get back to you."
  );
  askAnythingElse(twiml);

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== NEW PATIENT FLOW =====
app.post("/new-type", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const type = (req.body.SpeechResult || "").toLowerCase();

  if (type.includes("child")) {
    twiml.say(
      { voice: "alice" },
      "Great. The American Association of Orthodontists recommends an orthodontic exam by age seven."
    );
  } else {
    twiml.say(
      { voice: "alice" },
      "Great. We see a lot of adults in our office and offer several cosmetic options."
    );
  }

  const gather = twiml.gather({
    input: "speech",
    action: "/new-name",
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say({ voice: "alice" }, "What is the patient's full name?");

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/new-name", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const name = req.body.SpeechResult || "";

  const gather = twiml.gather({
    input: "speech",
    action: `/new-dob?name=${encodeURIComponent(name)}`,
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say({ voice: "alice" }, "What is the date of birth?");

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/new-dob", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const name = req.query.name || "";
  const dob = req.body.SpeechResult || "";

  const gather = twiml.gather({
    input: "speech",
    action: `/new-concern?name=${encodeURIComponent(name)}&dob=${encodeURIComponent(dob)}`,
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say({ voice: "alice" }, "What is the patient's primary concern?");

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/new-concern", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const name = req.query.name || "";
  const dob = req.query.dob || "";
  const concern = req.body.SpeechResult || "";

  const gather = twiml.gather({
    input: "speech",
    action: `/new-insurance?name=${encodeURIComponent(name)}&dob=${encodeURIComponent(dob)}&concern=${encodeURIComponent(concern)}`,
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say({ voice: "alice" }, "Do you have orthodontic insurance?");

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/new-insurance", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const name = req.query.name || "";
  const dob = req.query.dob || "";
  const concern = req.query.concern || "";
  const insurance = req.body.SpeechResult || "";
  const caller = formatPhoneNumber(req.body.From || "");

  await sendText(
    officeLineTextNumber,
    `NEW PATIENT LEAD
Name: ${name}
DOB: ${dob}
Concern: ${concern}
Orthodontic insurance: ${insurance}
Caller number: ${caller}`
  );

  const gather = twiml.gather({
    input: "speech",
    action: "/book-online-preference",
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say(
    { voice: "alice" },
    "Would you prefer to book online? Please say yes or no."
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/book-online-preference", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const speech = (req.body.SpeechResult || "").toLowerCase();
  const caller = formatPhoneNumber(req.body.From || "");

  if (speech.includes("yes")) {
    if (caller) {
      await sendText(
        caller,
        `Thanks for calling Messenger Orthodontics! You can book online here: ${bookingLink}`
      );
      await sendPatienceText(caller);
    }

    twiml.say(
      { voice: "alice" },
      "Perfect. I just sent you the booking link by text. Thank you for your patience. A team member will get back to you."
    );
    askAnythingElse(twiml);

    res.type("text/xml");
    return res.send(twiml.toString());
  }

  await sendPatienceText(caller);

  twiml.say(
    { voice: "alice" },
    "Thank you for your patience. A team member will get back to you."
  );
  askAnythingElse(twiml);

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== COMFORT VISIT FLOW =====
app.post("/comfort-name", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const name = req.body.SpeechResult || "";

  const gather = twiml.gather({
    input: "speech",
    action: `/comfort-concern?name=${encodeURIComponent(name)}`,
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say(
    { voice: "alice" },
    "What is the concern? For example, pokey wire, broken bracket, or something else."
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/comfort-concern", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const name = req.query.name || "";
  const concern = req.body.SpeechResult || "";
  const caller = formatPhoneNumber(req.body.From || "");

  await sendText(
    officeLineTextNumber,
    `COMFORT VISIT REQUEST
Name: ${name}
Concern: ${concern}
Caller: ${caller}`
  );

  if (caller) {
    await sendText(
      caller,
      `Messenger Orthodontics: We would like to get you in as soon as possible. We will text you with our soonest available times for today and tomorrow. A team member will get back to you shortly. In the meantime, here is the link for at home solutions: ${atHomeSolutionsLink} Password: ${atHomeSolutionsPassword}`
    );
    await sendPatienceText(caller);
  }

  twiml.say(
    { voice: "alice" },
    "We would like to get you in as soon as possible. We will text you with our soonest available times for today and tomorrow. Thank you for your patience. A team member will get back to you shortly. In the meantime, I just sent you the link for our at home solutions."
  );
  askAnythingElse(twiml);

  res.type("text/xml");
  res.send(twiml.toString());
});

// ===== SCHEDULE FLOW =====
app.post("/schedule-name", (req, res) => {
  const name = req.body.SpeechResult || "";
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    action: `/schedule-time?name=${encodeURIComponent(name)}`,
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say({ voice: "alice" }, "What days and times do you prefer?");
  res.type("text/xml").send(twiml.toString());
});

app.post("/schedule-time", async (req, res) => {
  const name = req.query.name || "";
  const time = req.body.SpeechResult || "";
  const caller = formatPhoneNumber(req.body.From || "");

  await sendText(
    officeLineTextNumber,
    `NEW APPOINTMENT REQUEST
Name: ${name}
Preferred times: ${time}
Caller: ${caller}`
  );

  await sendPatienceText(caller);

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(
    { voice: "alice" },
    "We will check the schedule and get back to you with available times and dates. Thank you for your patience. A team member will get back to you."
  );
  askAnythingElse(twiml);

  res.type("text/xml").send(twiml.toString());
});

// ===== RESCHEDULE FLOW =====
app.post("/reschedule-name", (req, res) => {
  const name = req.body.SpeechResult || "";
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    action: `/reschedule-dob?name=${encodeURIComponent(name)}`,
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say({ voice: "alice" }, "What is the date of birth?");
  res.type("text/xml").send(twiml.toString());
});

app.post("/reschedule-dob", (req, res) => {
  const name = req.query.name || "";
  const dob = req.body.SpeechResult || "";
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    action: `/reschedule-confirm?name=${encodeURIComponent(name)}&dob=${encodeURIComponent(dob)}`,
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say(
    { voice: "alice" },
    "Are you sure? We do charge a cancellation fee for any cancellations within forty eight hours of your appointment. Please say yes or no."
  );

  res.type("text/xml").send(twiml.toString());
});

app.post("/reschedule-confirm", async (req, res) => {
  const name = req.query.name || "";
  const dob = req.query.dob || "";
  const speech = (req.body.SpeechResult || "").toLowerCase();
  const caller = formatPhoneNumber(req.body.From || "");
  const twiml = new twilio.twiml.VoiceResponse();

  if (speech.includes("yes")) {
    const gather = twiml.gather({
      input: "speech",
      action: `/reschedule-reason?name=${encodeURIComponent(name)}&dob=${encodeURIComponent(dob)}`,
      method: "POST",
      actionOnEmptyResult: true
    });

    gather.say({ voice: "alice" }, "What is the reason for cancellation?");
    return res.type("text/xml").send(twiml.toString());
  }

  await sendPatienceText(caller);

  twiml.say({ voice: "alice" }, "Okay. We will keep your appointment as scheduled. Thank you for your patience. A team member will get back to you.");
  askAnythingElse(twiml);
  res.type("text/xml").send(twiml.toString());
});

app.post("/reschedule-reason", (req, res) => {
  const name = req.query.name || "";
  const dob = req.query.dob || "";
  const reason = req.body.SpeechResult || "";
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    action: `/reschedule-time?name=${encodeURIComponent(name)}&dob=${encodeURIComponent(dob)}&reason=${encodeURIComponent(reason)}`,
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say({ voice: "alice" }, "What days and times do you prefer for the next appointment?");
  res.type("text/xml").send(twiml.toString());
});

app.post("/reschedule-time", async (req, res) => {
  const name = req.query.name || "";
  const dob = req.query.dob || "";
  const reason = req.query.reason || "";
  const time = req.body.SpeechResult || "";
  const caller = formatPhoneNumber(req.body.From || "");

  await sendText(
    officeLineTextNumber,
    `RESCHEDULE REQUEST
Name: ${name}
DOB: ${dob}
Reason for cancellation: ${reason}
Preferred times: ${time}
Caller: ${caller}`
  );

  await sendPatienceText(caller);

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(
    { voice: "alice" },
    "We will check the schedule and get back to you with available times and dates. Thank you for your patience. A team member will get back to you."
  );
  askAnythingElse(twiml);

  res.type("text/xml").send(twiml.toString());
});

// ===== INSURANCE QUESTION FLOW =====
app.post("/insurance-another-question", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const speech = (req.body.SpeechResult || "").toLowerCase();
  const caller = formatPhoneNumber(req.body.From || "");

  if (speech.includes("yes")) {
    const gather = twiml.gather({
      input: "speech",
      action: "/insurance-question-detail",
      method: "POST",
      actionOnEmptyResult: true
    });

    gather.say(
      { voice: "alice" },
      "Please let us know what your question is."
    );

    res.type("text/xml");
    return res.send(twiml.toString());
  }

  await sendPatienceText(caller);

  twiml.say(
    { voice: "alice" },
    "Okay. Thank you for your patience. A team member will get back to you."
  );
  askAnythingElse(twiml);
  res.type("text/xml").send(twiml.toString());
});

app.post("/insurance-question-detail", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const question = req.body.SpeechResult || "";

  const gather = twiml.gather({
    input: "speech",
    action: `/insurance-name?question=${encodeURIComponent(question)}`,
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say({ voice: "alice" }, "What is the patient's full name?");
  res.type("text/xml").send(twiml.toString());
});

app.post("/insurance-name", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const question = req.query.question || "";
  const name = req.body.SpeechResult || "";

  const gather = twiml.gather({
    input: "speech",
    action: `/insurance-dob?question=${encodeURIComponent(question)}&name=${encodeURIComponent(name)}`,
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say({ voice: "alice" }, "What is the date of birth?");
  res.type("text/xml").send(twiml.toString());
});

app.post("/insurance-dob", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const question = req.query.question || "";
  const name = req.query.name || "";
  const dob = req.body.SpeechResult || "";
  const caller = formatPhoneNumber(req.body.From || "");

  await sendText(
    officeLineTextNumber,
    `INSURANCE QUESTION
Name: ${name}
DOB: ${dob}
Question: ${question}
Caller: ${caller}`
  );

  await sendPatienceText(caller);

  twiml.say(
    { voice: "alice" },
    "Thank you for your patience. A team member will get back to you."
  );
  askAnythingElse(twiml);
  res.type("text/xml").send(twiml.toString());
});

// ===== FINANCIAL QUESTION FLOW =====
app.post("/financial-question-type", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const financialType = req.body.SpeechResult || "";

  const gather = twiml.gather({
    input: "speech",
    action: `/financial-name?financialType=${encodeURIComponent(financialType)}`,
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say({ voice: "alice" }, "What is the patient's full name?");
  res.type("text/xml").send(twiml.toString());
});

app.post("/financial-name", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const financialType = req.query.financialType || "";
  const name = req.body.SpeechResult || "";

  const gather = twiml.gather({
    input: "speech",
    action: `/financial-dob?financialType=${encodeURIComponent(financialType)}&name=${encodeURIComponent(name)}`,
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say({ voice: "alice" }, "What is the date of birth?");
  res.type("text/xml").send(twiml.toString());
});

app.post("/financial-dob", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const financialType = req.query.financialType || "";
  const name = req.query.name || "";
  const dob = req.body.SpeechResult || "";
  const caller = formatPhoneNumber(req.body.From || "");

  await sendText(
    officeLineTextNumber,
    `FINANCIAL QUESTION
Name: ${name}
DOB: ${dob}
Request: ${financialType}
Caller: ${caller}`
  );

  await sendPatienceText(caller);

  twiml.say(
    { voice: "alice" },
    "Thank you for your patience. A team member will get back to you."
  );
  askAnythingElse(twiml);
  res.type("text/xml").send(twiml.toString());
});

// ===== OTHER REASON FLOW =====
app.post("/other-reason-name", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const name = req.body.SpeechResult || "";

  const gather = twiml.gather({
    input: "speech",
    action: `/other-reason-dob?name=${encodeURIComponent(name)}`,
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say({ voice: "alice" }, "What is the date of birth?");
  res.type("text/xml").send(twiml.toString());
});

app.post("/other-reason-dob", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const name = req.query.name || "";
  const dob = req.body.SpeechResult || "";

  const gather = twiml.gather({
    input: "speech",
    action: `/other-reason-detail?name=${encodeURIComponent(name)}&dob=${encodeURIComponent(dob)}`,
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say({ voice: "alice" }, "Please tell us the reason for your call.");
  res.type("text/xml").send(twiml.toString());
});

app.post("/other-reason-detail", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const name = req.query.name || "";
  const dob = req.query.dob || "";
  const reason = req.body.SpeechResult || "";
  const caller = formatPhoneNumber(req.body.From || "");

  await sendText(
    officeLineTextNumber,
    `OTHER REASON FOR CALL
Name: ${name}
DOB: ${dob}
Reason: ${reason}
Caller: ${caller}`
  );

  await sendPatienceText(caller);

  twiml.say(
    { voice: "alice" },
    "Thank you for your patience. A team member will get back to you."
  );
  askAnythingElse(twiml);
  res.type("text/xml").send(twiml.toString());
});

// ===== AFTER HOURS EMERGENCY FLOW =====
app.post("/after-hours-emergency", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const name = req.body.SpeechResult || "";

  const gather = twiml.gather({
    input: "speech",
    action: `/after-hours-emergency-concern?name=${encodeURIComponent(name)}`,
    method: "POST",
    actionOnEmptyResult: true
  });

  gather.say(
    { voice: "alice" },
    "Please briefly describe the emergency."
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/after-hours-emergency-concern", async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const name = req.query.name || "";
  const concern = (req.body.SpeechResult || "").toLowerCase();
  const caller = formatPhoneNumber(req.body.From || "");
  const officeOpen = isOfficeOpenNow();

  await sendText(
    officeLineTextNumber,
    `EMERGENCY CALL
Name: ${name}
Concern: ${concern}
Caller: ${caller}
Office currently open: ${officeOpen ? "Yes" : "No"}`
  );

  if (caller) {
    await sendText(
      caller,
      `Messenger Orthodontics: Dr. Messenger is always available on her cell phone for emergencies like trauma, bleeding, and swelling. You can call or text her at (714) 500-7127. At home solutions: ${atHomeSolutionsLink} Password: ${atHomeSolutionsPassword}`
    );
    await sendPatienceText(caller);
  }

  if (!officeOpen) {
    twiml.say(
      { voice: "alice" },
      "Dr. Messenger is always available on her cell phone for emergencies like trauma, bleeding, and swelling. You can call or text her at seven one four, five zero zero, seven one two seven. If this is a broken bracket or pokey wire, this can usually wait until regular business hours. Please see at home solutions I have texted to you. Thank you for your patience. A team member will get back to you."
    );
  } else {
    twiml.say(
      { voice: "alice" },
      "Our team will get back to you shortly. For emergencies like trauma, bleeding, or swelling, Dr. Messenger is also available on her cell phone at seven one four, five zero zero, seven one two seven. I have texted you the at home solutions link as well. Thank you for your patience. A team member will get back to you."
    );
  }

  askAnythingElse(twiml);

  res.type("text/xml");
  res.send(twiml.toString());
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

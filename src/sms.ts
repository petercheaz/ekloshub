function twilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim(),
  );
}

function normalizeE164(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  if (raw.trim().startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

export async function sendSms(to: string, text: string) {
  const dest = normalizeE164(to);
  if (!dest) {
    console.log(`\n--- SMS skipped (invalid phone: ${to}) ---\n${text}\n---\n`);
    return;
  }
  if (!twilioConfigured()) {
    console.log(
      `\n--- SMS to ${dest} (Twilio not configured; set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER) ---\n${text}\n---\n`,
    );
    return;
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!.trim();
  const token = process.env.TWILIO_AUTH_TOKEN!.trim();
  const from = process.env.TWILIO_FROM_NUMBER!.trim();
  const body = new URLSearchParams({ To: dest, From: from, Body: text.slice(0, 1600) });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error(`Twilio SMS failed (${response.status}): ${detail}`);
  }
}

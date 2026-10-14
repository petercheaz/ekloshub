import nodemailer, { type Transporter } from "nodemailer";

let cachedTransport: Transporter | null | undefined;

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim());
}

function getTransport() {
  if (cachedTransport !== undefined) {
    return cachedTransport;
  }
  if (!smtpConfigured()) {
    cachedTransport = null;
    return null;
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure,
    auth:
      process.env.SMTP_USER?.trim() && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER.trim(), pass: process.env.SMTP_PASS }
        : undefined,
  });
  return cachedTransport;
}

export async function sendMail(to: string, subject: string, text: string) {
  const transport = getTransport();
  if (!transport) {
    console.log(`\n--- Email to ${to} (SMTP not configured; set SMTP_HOST and SMTP_FROM) ---\nSubject: ${subject}\n\n${text}\n---\n`);
    return;
  }
  await transport.sendMail({
    from: process.env.SMTP_FROM!.trim(),
    to,
    subject,
    text,
  });
}

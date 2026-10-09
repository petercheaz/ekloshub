export async function sendMail(to: string, subject: string, text: string) {
  console.log(`\n--- Email to ${to} ---\nSubject: ${subject}\n\n${text}\n---\n`);
}

// Transactional email via Resend's REST API — one fetch, no SDK. Sends from
// website@vishnubharath.com (domain verified in Resend) to ALLOWED_EMAIL unless
// told otherwise. Needs the RESEND_API_KEY secret.

export type EmailEnv = { RESEND_API_KEY?: string; ALLOWED_EMAIL?: string } | undefined;

export const FROM = "vishnubharath.com <website@vishnubharath.com>";

/** Sends a plain-text email; resolves to Resend's email id, throws on failure. */
export async function sendEmail(
  env: EmailEnv,
  msg: { subject: string; text: string; to?: string },
): Promise<string> {
  const apiKey = env?.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const to = msg.to ?? env?.ALLOWED_EMAIL;
  if (!to) throw new Error("No recipient — set ALLOWED_EMAIL");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject: msg.subject, text: msg.text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const { id } = (await res.json()) as { id: string };
  return id;
}

function parseFromAddress(from) {
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim();
}

/**
 * SendGrid HTTP API — set SENDGRID_API_KEY and EMAIL_FROM.
 * @see https://docs.sendgrid.com/api-reference/mail-v3/mail-send
 */
export class SendGridEmailProvider {
  /**
   * @param {{ apiKey: string, from: string }} opts
   */
  constructor({ apiKey, from }) {
    this.apiKey = apiKey;
    this.from = from;
  }

  /**
   * @param {{ to: string, subject: string, text: string, html?: string }} mail
   */
  async send({ to, subject, text, html }) {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: parseFromAddress(this.from) },
        subject,
        content: [
          { type: "text/plain", value: text },
          ...(html ? [{ type: "text/html", value: html }] : [])
        ]
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`SendGrid failed (${res.status}): ${body.slice(0, 200)}`);
    }
  }
}

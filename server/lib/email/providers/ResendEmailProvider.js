/**
 * Resend.com API — set RESEND_API_KEY and EMAIL_FROM.
 */
export class ResendEmailProvider {
  /**
   * @param {{ apiKey: string, from: string }} config
   */
  constructor(config) {
    this.apiKey = config.apiKey;
    this.from = config.from;
  }

  async send({ to, subject, text, html }) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: this.from,
        to: [to],
        subject,
        text,
        html: html || undefined
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend failed: ${res.status} ${err}`);
    }
    const data = await res.json();
    return { ok: true, id: data.id };
  }
}

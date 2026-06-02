/**
 * Dev provider — logs reset links to console.
 */
export class ConsoleEmailProvider {
  async send({ to, subject, text, html }) {
    console.log("[EmailService:console]");
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  ${text}`);
    if (html) console.log(`  HTML: ${html.slice(0, 200)}…`);
    return { ok: true, id: `console-${Date.now()}` };
  }
}

import { ConsoleEmailProvider } from "./providers/ConsoleEmailProvider.js";
import { ResendEmailProvider } from "./providers/ResendEmailProvider.js";
import { SendGridEmailProvider } from "./providers/SendGridEmailProvider.js";

/**
 * EMAIL_PROVIDER=console|resend|sendgrid
 * RESEND_API_KEY / SENDGRID_API_KEY, EMAIL_FROM
 */
export function createEmailProviderFromEnv() {
  const kind = (process.env.EMAIL_PROVIDER || "console").toLowerCase();
  const from = process.env.EMAIL_FROM || "Inkling <noreply@example.com>";

  if (kind === "resend" && process.env.RESEND_API_KEY) {
    return new ResendEmailProvider({
      apiKey: process.env.RESEND_API_KEY,
      from
    });
  }
  if (kind === "sendgrid" && process.env.SENDGRID_API_KEY) {
    return new SendGridEmailProvider({
      apiKey: process.env.SENDGRID_API_KEY,
      from
    });
  }
  return new ConsoleEmailProvider();
}

import { createEmailProviderFromEnv } from "./createProvider.js";

/**
 * @typedef {object} SendMailOptions
 * @property {string} to
 * @property {string} subject
 * @property {string} text
 * @property {string} [html]
 */

/** @type {import('./providers/ConsoleEmailProvider.js').ConsoleEmailProvider | import('./providers/ResendEmailProvider.js').ResendEmailProvider | null} */
let provider = null;

export function setEmailProvider(impl) {
  provider = impl;
}

export function getEmailProvider() {
  if (!provider) {
    provider = createEmailProviderFromEnv();
  }
  return provider;
}

/**
 * @param {SendMailOptions} opts
 */
export async function sendMail(opts) {
  return getEmailProvider().send(opts);
}

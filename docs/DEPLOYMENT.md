# Inkling deployment

## Stack

- **Frontend:** static files (`index.html`, `src/`, CSS) + service worker
- **Backend:** Node 18+ `server/index.mjs`
- **Storage (dev/small deploy):** JSON files in `data/users/` (schema in `server/db/schema.sql` for SQL migration)

## Environment

Copy `.env.example` to `.env`:

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | HMAC signing for session tokens (required in production) |
| `PORT` | HTTP port (default 3080) |
| `APP_URL` | Public URL for password-reset links |
| `EMAIL_PROVIDER` | `console` (dev), `resend`, or `sendgrid` |
| `RESEND_API_KEY` | Resend API key when using `resend` |
| `SENDGRID_API_KEY` | SendGrid API key when using `sendgrid` |
| `EMAIL_FROM` | Verified sender address |

### EmailService providers

The `server/lib/email/` package is provider-agnostic:

- **ConsoleEmailProvider** — logs reset URLs to the server console (default)
- **ResendEmailProvider** — production-friendly HTTP API
- **SendGridEmailProvider** — SendGrid v3 mail send

To add SES or Gmail, implement the same `send({ to, subject, text, html })` interface in `server/lib/email/providers/` and register it in `createProvider.js`.

## Run locally

```bash
npm run dev
npm test
```

- Login: http://localhost:3080/login.html
- App: http://localhost:3080/index.html
- Account settings: http://localhost:3080/account-settings.html

## API overview

| Endpoint | Auth | Description |
|----------|------|-------------|
| POST `/api/auth/register` | No | Email, password, optional username |
| POST `/api/auth/login` | No | Returns token + user profile |
| POST `/api/auth/forgot-password` | No | Sends reset email |
| GET `/api/auth/reset-token?token=` | No | Validates reset token |
| POST `/api/auth/reset-password` | No | Sets new password |
| GET `/api/auth/me` | Bearer | Profile + settings |
| PUT `/api/auth/profile` | Bearer | Username, display name |
| PUT `/api/auth/settings` | Bearer | Notifications, theme, AI prefs |
| GET/PUT `/api/sync` | Bearer | Calendar bundle sync |
| GET/PUT `/api/notifications/schedules` | Bearer | Scheduled notifications |
| GET/POST `/api/notifications/history` | Bearer | History |
| POST `/api/feedback` | Bearer | AI thumbs up/down + category |
| GET `/api/feedback/summary` | Bearer | Analytics summary |
| POST `/api/wordweaver/remarks` | Bearer | LLM contextual insights for a day (`dayContext`) |

### WordWeaver AI remarks

Set `OPENAI_API_KEY` (and optionally `OPENAI_BASE_URL` / `OPENAI_MODEL`) in `.env`. Without a key, the server uses a **mock** provider (rule-based JSON). Responses are cached per user/date for 6 hours.

Custom 3D layouts sync to the account via `PUT /api/auth/settings` with `{ wordweaver: { customLayout, layoutMode, savedAt } }` (debounced while editing). On login, newer `savedAt` wins over local storage.

Mutating requests should send header `X-Inkling-Client: Inkling` (set automatically by `cloudSync.js`).

## Security checklist

- [ ] Strong `JWT_SECRET`
- [ ] HTTPS reverse proxy (nginx, Caddy, Cloudflare)
- [ ] Restrict `CORS_ORIGIN` to your domain
- [ ] Rate limits enabled (in-memory per IP on auth routes)
- [ ] Secure `data/` directory permissions
- [ ] Production email provider with SPF/DKIM

## Tests

```bash
node --test server/tests/auth.test.mjs
```

## Hard refresh after deploy

Bump `CACHE_VERSION` in `service-worker.js` so clients load new CSS/JS.

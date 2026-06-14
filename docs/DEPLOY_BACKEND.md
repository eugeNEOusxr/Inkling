# Deploy a real backend (so login works on eugeneousxr.github.io)

GitHub Pages is **static only** — it can't run the Node API, so login there fails
with "Request failed". The fix: host the `server/` somewhere, then point the
front-end's `apiUrl` at it.

The server is self-contained: **pure Node built-ins, zero npm deps**, start with
`node server/index.mjs`. Verified working locally (register → 201 + token, login
→ token).

---

## Architecture (keep the github.io URL)

```
Browser ── static files ──▶ GitHub Pages (eugeneousxr.github.io)
        ── /api/* (login) ─▶ Backend host (Render/Railway/Fly)  ← runs server/
```

Front-end on Pages, API on a Node host. The front-end calls the API cross-origin
(CORS is already handled by the server via `CORS_ORIGIN`).

---

## Env vars the server reads

| Var | Required | Notes |
|-----|----------|-------|
| `PORT` | host sets it | server listens on it (default 3080) |
| `JWT_SECRET` | **yes** | strong random string; signs auth tokens. NEVER commit it. |
| `CORS_ORIGIN` | **yes** | `https://eugeneousxr.github.io` (the front-end origin) |
| `APP_URL` | recommended | `https://eugeneousxr.github.io` (used in email links) |
| `NODE_ENV` | recommended | `production` |
| Email (`EMAIL_PROVIDER`, `RESEND_API_KEY`/`SENDGRID_API_KEY`, `EMAIL_FROM`) | optional | only for password-reset emails |
| LLM (`LLM_*` / `OPENAI_*`) | optional | only for server-side Inkling AI |

Generate a secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## Steps (Render free tier example)

1. **Put the code in a repo the host can deploy** (server/ is currently
   gitignored — you'll need it in a repo Render can read; a **private** repo is
   fine). Do NOT commit `.env` or any secret.
2. **Create a Web Service** on Render from that repo:
   - Runtime: **Node**
   - Build command: *(none — no deps)*
   - Start command: `node server/index.mjs`
3. **Set env vars** in Render's dashboard: `JWT_SECRET`, `CORS_ORIGIN=https://eugeneousxr.github.io`,
   `APP_URL=https://eugeneousxr.github.io`, `NODE_ENV=production`.
4. Deploy → note the URL, e.g. `https://inkling-api.onrender.com`.
5. **Point the front-end at it + redeploy Pages** (I can run this for you):
   ```bash
   INKLING_API_URL=https://inkling-api.onrender.com node scripts/write-runtime-config.mjs
   node scripts/build-web.mjs
   # then force-push dist/ to eugeNEOusxr.github.io main (the usual deploy)
   ```
   This bakes `apiUrl` into `inkling-config.js`, so the live site posts login to
   the backend instead of github.io.

---

## ⚠ Two things to decide

1. **Data persistence.** The server stores accounts as JSON files in
   `data/users/`. On most **free** tiers the filesystem is *ephemeral* — wiped on
   every deploy/restart/sleep, so **accounts would vanish**. For durability:
   - attach a **persistent disk** (Render/Fly, ~$1–7/mo) mounted at the data dir, **or**
   - migrate the user store to a real DB later (Postgres/SQLite-hosted).
   For testing it's fine as-is.
2. **Cold starts.** Free hosts sleep after ~15 min idle → first request ~30–50s.
   Fine for a demo; a cheap paid tier or a keep-alive ping avoids it.

---

## Alternative: one host for everything

The server also serves the static app (it serves files from the repo root + the
API). So you could deploy the **whole app** to Render (`node server/index.mjs`)
and use that single URL — no CORS, no separate Pages build. Trade-off: your
public URL becomes the Render URL instead of `eugeneousxr.github.io`.

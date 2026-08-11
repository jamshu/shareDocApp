# ShareDoc

Family notes + document vault. SvelteKit PWA on **Cloudflare Workers**, Odoo 19 backend.

## Develop

```sh
npm install
npm run dev
```

## Deploy (Cloudflare Workers)

```sh
npm run deploy          # vite build && wrangler deploy
```

Config lives in [`wrangler.toml`](wrangler.toml) — Worker name `sharedoc`, custom domain
`sharedoc.deedapp.net` (change the `routes` line for a different subdomain).

### Secrets (set once, not in wrangler.toml)

```sh
wrangler secret put ODOO_URL
wrangler secret put ODOO_DB
wrangler secret put ODOO_USERNAME
wrangler secret put ODOO_API_KEY
wrangler secret put ODOO_MODEL
wrangler secret put DOCS_ALLOWED_COMPANY_IDS      # optional
wrangler secret put PUBLIC_VAPID_PUBLIC_KEY       # web push (also a secret — served at runtime)
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_SUBJECT
```

### One-time zone setting

Cloudflare dashboard → **SSL/TLS → Edge Certificates → Always Use HTTPS: On**. Without it the
`Secure` session cookie is dropped over http and every `/api` call returns 401 after login.

## iPhone / Siri shortcut (quick-create a note)

The app exposes a deep-link page `/note/new` that runs under your logged-in session:

- `https://sharedoc.deedapp.net/note/new?q=<text>&go=1` — create immediately, open the note
- `https://sharedoc.deedapp.net/note/new?q=<text>` — prefill, tap **Create note**

Build the Shortcut: **Shortcuts app → + → Add Action → *Open URLs*** →
`https://sharedoc.deedapp.net/note/new?q=` followed by a *Dictated Text* / *Ask for Input*
variable, then `&go=1`. Rename it (e.g. "New ShareDoc note") and "Add to Siri". You must be
logged into the PWA in Safari first (auth is cookie-based).

### Search notes by voice

Same idea, different URL — opens the notes list filtered to what you dictate:

- `https://sharedoc.deedapp.net/?q=<text>`

Shortcut: **Open URLs** → `https://sharedoc.deedapp.net/?q=` + a *Dictated Text* variable. Name it
"Search ShareDoc", Add to Siri. Searches note titles + body.

## Uploads

Files store base64 in Odoo; cap is **25MB** per file (client + server). For larger files switch
the storage path to Cloudflare R2 with streaming.

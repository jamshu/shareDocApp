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

- `https://doc.deedapp.net/note/new?go=1&q=<text>` — create immediately, open the note
- `https://doc.deedapp.net/note/new?q=<text>` — prefill, tap **Create note**

Build the Shortcut: **Shortcuts app → + → Add Action → *Open URLs*** →
`https://doc.deedapp.net/note/new?q=` followed by a *Dictated Text* / *Ask for Input*
variable, then `&go=1`. Rename it (e.g. "New ShareDoc note") and "Add to Siri". You must be
logged into the PWA in Safari first (auth is cookie-based).

### Search notes by voice

Same idea, different URL — opens the notes list filtered to what you dictate:

- `https://doc.deedapp.net/?q=<text>`

Shortcut: **Open URLs** → `https://doc.deedapp.net/?q=` + a *Dictated Text* variable. Name it
"Search ShareDoc", Add to Siri. Searches note titles + body.

## iPhone / Apple Shortcut (upload a document)

Uploads a file straight into your private **Inbox** folder — no browser needed. Auth is a per-user
token carried in the URL (a bearer key; regenerate to revoke).

**First get your upload URL:** open the app → **Account → iPhone upload shortcut → Copy**. It looks
like `https://sharedoc.deedapp.net/api/inbox?token=<your-token>`.

**Build the Shortcut** (Shortcuts app → **+**):

1. Add **Select File** (or **Get File**) — the file to upload. (Use **Receive Files from Share
   Sheet** as input instead if you want it in the share sheet.)
2. Add **Get Contents of URL**. Paste your copied URL. To keep the real filename, append
   `&name=` and insert the file's **Name** variable, e.g.
   `https://sharedoc.deedapp.net/api/inbox?token=<token>&name=[Name]`.
3. Tap **Show More** on that action.
4. Set **Method** → **POST**.
5. Set **Request Body** → **File**.
6. Set the **File** field to the **File** variable from step 1.
7. (Optional) Add **Show Result** after it to see `{"ok":true,...}`.
8. Rename it (e.g. "Upload to ShareDoc"), then **Add to Siri**.

Run it (or "Hey Siri, Upload to ShareDoc") → pick a file → it lands in your **Inbox** in the app.
Files up to **25MB**. If the token leaks, **Account → Regenerate** revokes the old URL.

Quick test from a shell:

```sh
curl -X POST "https://sharedoc.deedapp.net/api/inbox?token=<token>&name=test.pdf" \
  --data-binary @test.pdf -H "Content-Type: application/pdf"
```

## Uploads

Files store base64 in Odoo; cap is **25MB** per file (client + server). For larger files switch
the storage path to Cloudflare R2 with streaming.

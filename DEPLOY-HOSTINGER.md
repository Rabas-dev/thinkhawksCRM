# Deploying to Hostinger (Business plan)

Business hosting runs Node apps through hPanel's **Node.js App Manager**
(built on Passenger), not a normal `npm run dev`/`next start`. Next.js is
configured (see `next.config.ts` → `output: "standalone"`) to produce a
self-contained `server.js` that Passenger can run directly.

## 1. Build locally, not on the server

Shared hosting CPU/RAM is tight and `next build` is heavy — build on your
own machine and upload the result, rather than building on Hostinger.

```bash
cd "C:\Users\Hp\Documents\GitHub\think-hawks-crm"
npm run build
```

This creates `.next/standalone/`. Before uploading, copy two more things
into it (the standalone build deliberately excludes them so it stays small):

```bash
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
```

`.next/standalone/` now contains everything needed to run: `server.js`, its
own `node_modules`, `.next/static`, and `public/`. That whole folder is what
you upload — you do **not** need to upload the rest of the project
(`src/`, root `node_modules`, etc.).

## 2. Create a subdomain (recommended: `crm.thinkhawks.com`)

In hPanel → **Domains → Subdomains**, create `crm` pointing at
`thinkhawks.com`. Give it a minute to propagate.

## 3. Set up the Node.js app

hPanel → **Advanced → Node.js** → **Create Application**:

- **Node.js version**: 20 or later (match what you built with — check with
  `node -v` locally; this project was built on Node 24)
- **Application mode**: Production
- **Application root**: a folder like `crm-app` (this is where you'll
  upload `.next/standalone`'s contents)
- **Application URL**: pick the `crm.thinkhawks.com` subdomain from step 2
- **Application startup file**: `server.js`

Click **Create**. hPanel will give you an "Enter to Node.js virtual
environment" SSH command — keep that for step 5.

## 4. Upload the build

Use hPanel's **File Manager** (or FTP/SFTP with the credentials from
**Files → FTP Accounts**) to upload the *contents* of
`.next/standalone/` (not the folder itself) into the application root you
set in step 3, so `server.js` ends up directly inside it.

## 5. Set environment variables

In the Node.js app's page in hPanel there's an **Environment variables**
section — add every key from your `.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://zqsfispcgrgcdnxmbeoq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your publishable key>
SUPABASE_SERVICE_ROLE_KEY=<your secret key>
SENDGRID_API_KEY=<your sendgrid key>
SENDGRID_FROM_EMAIL=crm@thinkhawks.com
SENDGRID_WEBHOOK_PUBLIC_KEY=<from SendGrid once you enable Signed Event Webhook Requests>
SENDGRID_INBOUND_TOKEN=<a random string you make up>
TELNYX_API_KEY=<once you have Telnyx>
TELNYX_WEBRTC_CONNECTION_ID=<once you have a Telnyx WebRTC Credential Connection>
TELNYX_PHONE_NUMBER=<once you have Telnyx>
TELNYX_WEBHOOK_TOKEN=<a random string you make up>
NEXT_PUBLIC_BASE_URL=https://crm.thinkhawks.com
```

Passenger sets `PORT` itself — don't add that one.

## 6. Start it

Back on the Node.js app's hPanel page, click **Restart**. Visit
`https://crm.thinkhawks.com` — you should see the login page. If it errors,
check the app's **Logs** tab in hPanel first.

## 7. Point SendGrid and Telnyx at the real domain

Now that `NEXT_PUBLIC_BASE_URL` is a real HTTPS URL, go back to the SendGrid
webhook setup and the Telnyx webhook setup in `SETUP.md` and use
`https://crm.thinkhawks.com/...` as the endpoint URLs instead of an ngrok
tunnel.

## Redeploying after a code change

Every time you change something:

```bash
cd "C:\Users\Hp\Documents\GitHub\think-hawks-crm"
npm run build
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
```

Then re-upload the contents of `.next/standalone/` over the existing app
folder (File Manager lets you overwrite), and hit **Restart** on the Node.js
app in hPanel.

## Reliability note for calling/messaging

Passenger-based apps on shared hosting sleep after a period of no traffic
and wake on the next request, adding a few seconds of delay to that first
request. For the dashboard UI this is barely noticeable. For Telnyx's
webhooks (call status, recordings, inbound messages) it means the very
first callback after idle time might time out. If that turns out to bite in
practice, the fix is either enabling any "always on" option Hostinger
offers for the Node app, or moving just the webhook routes (or the whole
app) to a platform built for always-on servers, like a small VPS or Vercel.

# Nucleus

A web app for running several construction businesses from one place: a combined owner dashboard, plus a CRM, jobs, invoicing/payments and scheduling for each business.

## What's here (Phase 1)

| Area | What it does |
|---|---|
| **All businesses dashboard** (`/`) | Combined KPIs across every active business: cash collected, sales won, pipeline, close rate, A/R and overdue, active jobs, gross margin. Also a 12-month revenue chart stacked by business, a per-business comparison table, leads by source, and the next 7 days of appointments. Date range picker. |
| **Business dashboard** (`/b/:slug`) | The same view filtered to one business. |
| **Leads** | Pipeline stages (New → Contacted → Site visit → Estimate sent → Won/Lost), stage totals, quick lead capture. Marking a lead **Won** creates its job automatically. |
| **Contacts** | Search, plus jobs count and lifetime value per customer. |
| **Jobs** | Status, contract value, estimated vs. actual cost, margin, billed vs. paid. |
| **Invoices** | A/R aging buckets, invoices per job (deposits, progress payments, final), record payments (card/ACH/check/cash/financing), void. |
| **Schedule** | Weekly calendar of site visits and crew work, linked to jobs. |
| **Add business** | `/businesses/new`. Each business gets its own data, which rolls into the combined dashboard. You can archive a business to hide it without losing its data. |
| **Team** (`/team`) | Individual logins (email + password) with roles, per-business access, password resets and deactivation. |
| **Account** (`/account`) | Change your own name and password. |
| **Website** (`/b/:slug/website`) | Connect each business's website: an embed code for a quote form, a shareable hosted form link, and a lead API for existing forms, Zapier or Make. Leads arrive in Leads with their source (Google, Facebook, etc.) worked out from ad and UTM tags. |

## Website lead capture

Each business has a public **form key**. You have three ways to connect a website:

1. **Embed:** `<script src="https://APP/embed.js" data-key="KEY" async></script>` adds a branded, self-resizing quote form (an iframe). It remembers the visitor's landing-page ad/UTM tags for the rest of their visit.
2. **Hosted link:** `https://APP/f/KEY`, for Google Business Profile, social bios, texts and emails. Add `?utm_source=...` to track each one.
3. **API:** `POST https://APP/api/public/leads/KEY`, JSON or a normal form post. Field names are flexible (`name`/`first_name`, `email`, `phone`, `service`, `message`, `budget`, `utm_*`). Include `_redirect` to send HTML-form visitors back to your own thank-you page.

Protection: an optional allowed-domains list, a hidden honeypot field, 5 submissions per visitor per 10 minutes, and a pause switch. If spam gets through, you can regenerate the key. A repeat customer, matched by email or phone, is attached to their existing contact.

Set `APP_URL` (e.g. `https://app.yourcompany.com`) so the snippets show your own domain rather than whichever address you opened the app from.

## Public websites (`site/`)

A separate app in `site/` is the **website template** for every business: one deployment serves each business on its own domain, with content edited in Nucleus (business → Website → Edit website content). See [`site/README.md`](site/README.md).

## AI website assistant

A chat on each business's website (business → **Website** → **AI assistant**). It:
- answers questions using that business's website content plus notes the owner adds
- offers real open times from the Nucleus **Schedule**, inside the booking hours. Defaults are Mon–Fri 9am–5pm, 30-minute visits, at least 12 hours' notice, up to 14 days ahead. It never offers or books a time that's already taken; bookings are serialized per business with a database lock.
- books **site visits** (or optional phone calls) and saves the customer as a lead, with the ad/UTM source and the chat transcript
- hands off to the team (saved as a lead marked "Needs follow-up") when the customer asks for a person, has an emergency, or asks something it can't answer
- doesn't quote prices or make up facts

How it's built: Claude (`claude-opus-5-5`, low effort, with server-side refusal fallbacks) on the Messages API with three strict tools (`get_available_times`, `book_appointment`, `handoff_to_team`), run in `src/lib/assistant.ts`. Each chat turn is one short serverless request (`POST /api/public/chat/{formKey}`). The full API conversation is stored append-only in `chat_conversations`, and the stable part of the system prompt is prompt-cached. Limits: 1,000 characters per message, 40 messages per chat, 10 new chats per visitor per hour.

Requires `ANTHROPIC_API_KEY` in the Nucleus project's environment variables.

## Inbox: phone calls, texts and email

Each business gets an **Inbox** tab:
- **Messages:** texts and emails in one list, with AI replies and staff replies. A staff reply pauses the AI for that conversation, and you can hand it back. "STOP" opt-outs are respected.
- **Calls:** answered, missed and voicemail calls, with voicemails playable in Nucleus.
- **Settings** (owner only): Twilio number, phones to ring, voicemail, missed-call text-back, AI text replies, email addresses, AI email replies, signature, and step-by-step setup with the exact webhook addresses.

How it works:
- **Calls (Twilio):** `POST /api/twilio/voice` rings every forwarding phone at once, after announcing which business the call is for. If nobody answers, `/voice/after` takes a voicemail and sends a missed-call text that the AI follows up.
- **Texts (Twilio):** `POST /api/twilio/sms` replies to Twilio immediately, then the AI (the same assistant as the website chat, in a short SMS style) replies in the background and can book site visits.
- **Email (Postmark):** `POST /api/email/inbound/{POSTMARK_INBOUND_TOKEN}`. The AI replies in the same thread (In-Reply-To), and never answers newsletters, auto-replies, bounces or itself.
- Every Twilio request is verified with Twilio's signature (needs `APP_URL` to match the address set in Twilio). Postmark is verified by the secret in the URL. One AI reply runs at a time per conversation.

Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `POSTMARK_SERVER_TOKEN`, `POSTMARK_INBOUND_TOKEN`, `APP_URL`, `ANTHROPIC_API_KEY`. US texting also needs A2P 10DLC registration in Twilio.

## Users and roles

| Role | Can see and do |
|---|---|
| **Owner** | Everything across all businesses, including Team, business settings, and adding or archiving businesses |
| **Manager** | Everything in the businesses assigned to them (dashboards, revenue, invoices, payments, job costs). No Team or business settings |
| **Staff** | Leads, contacts, jobs (no contract values, costs or margins) and schedule for their assigned businesses. No dashboards or invoices |

- **First run:** when there are no users, `/login` shows a setup screen. Enter the setup code (the `OWNER_PASSWORD` env var) to create the first owner account. After that, `OWNER_PASSWORD` isn't used for signing in.
- **Removing access:** deactivating someone on the Team page signs them out of every device immediately. Their records stay, attributed to them.
- **Password resets:** the owner sets a new password on the Team page, which signs that person out everywhere. Changing your own password on the Account page signs out your other devices.
- **Attribution:** leads, invoices, payments and appointments record who created them.
- Permissions are enforced on the server in every action and page (`src/lib/session.ts`), not just hidden in the UI.

## Running locally

Requires Node 20+ and Postgres 14+.

```bash
cp .env.example .env          # set DATABASE_URL, OWNER_PASSWORD, AUTH_SECRET
npm install
npm run db:migrate            # create tables
npm run db:seed               # optional: 2 demo businesses with 12 months of data
npm run dev                   # http://localhost:3000
```

The seed creates demo logins that all use the password `demo-password`: `owner@example.com`, `manager@example.com`, and `staff@example.com` (Business One only).

`npm run db:seed -- --reset` wipes all data, including users, and re-seeds. Before entering real data, run the reset and then delete the demo businesses (or don't seed at all).

## Stack

- **Next.js 15** (App Router, server components and server actions), **TypeScript**, **Tailwind CSS 4**
- **Postgres** via **Drizzle ORM** (`src/db/schema.ts`, migrations in `drizzle/`)
- Email + password accounts with roles: scrypt password hashes, HMAC-signed session cookies (`src/lib/auth.ts`, `src/lib/session.ts`, `src/middleware.ts`)

### Conventions

- Every business-owned table has `business_id`, and every query and action is scoped by it.
- Money is stored as **integer cents**.
- Schema changes: edit `src/db/schema.ts`, then `npm run db:generate && npm run db:migrate`. **Run `npm run db:migrate` against production (Neon, direct connection string) before deploying code that includes a new migration.**

## Layout

```
src/
  app/
    actions.ts               all server actions (create/update)
    login/                   sign-in
    (app)/page.tsx           combined dashboard
    (app)/b/[slug]/…         per-business pages
  components/                Dashboard, charts, KPI cards, forms
  db/                        schema, client, seed
  lib/metrics.ts             all KPI queries (shared by both dashboards)
```

## Roadmap

1. **Payments:** Stripe (one account per business via Connect), online invoice pay links, ACH, consumer financing.
2. **Estimates:** price book, line-item estimates with markup, good/better/best options, e-signature, deposit on signing.
3. **Website:** public site per business (services, service-area pages, gallery, reviews) with a quote form that posts straight into Leads with UTM attribution.
4. **Marketing:** SMS/email (Twilio, Resend), speed-to-lead auto-reply, estimate follow-up sequences, review requests, campaigns.
5. **Scheduling+:** online booking for site visits, Google Calendar sync, reminders.
6. **Analytics+:** marketing spend per source → cost per lead/ROI, QuickBooks sync.
7. **Accounts+:** "forgot password" emails and invites (needs an email provider), optional two-factor login.

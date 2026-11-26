# Nucleus

A web app for running several construction businesses from one place: a combined owner dashboard, plus a CRM, jobs, invoicing/payments and scheduling for each business.

## What's here (Phase 1)

| Area | What it does |
|---|---|
| **All businesses dashboard** (`/`) | Combined KPIs across every active business: cash collected, sales won, pipeline, close rate, A/R and overdue, active jobs, gross margin. Also a 12-month revenue chart stacked by business, a per-business comparison table, leads by source, and the next 7 days of appointments. Date range picker. |
| **Business dashboard** (`/b/:slug`) | The same view filtered to one business. |
| **Marketing** (on both dashboards) | Website visits and page views, where visitors come from, leads from the website and the visit-to-lead rate, phone calls (answered, missed, voicemail, answer rate), texts (received, AI replies, missed-call texts), emails, bookings made by the AI, and how new leads reached you. |
| **Leads** | Pipeline stages (New → Contacted → Site visit → Estimate sent → Won/Lost), stage totals, quick lead capture. Marking a lead **Won** creates its job automatically. |
| **Contacts** | Search, plus jobs count and lifetime value per customer. |
| **Jobs** | Status, contract value, estimated vs. actual cost, margin, billed vs. paid. |
| **Invoices** | A/R aging buckets, invoices per job (deposits, progress payments, final), record payments (card/ACH/check/cash/financing), void. |
| **Schedule** | Weekly calendar of site visits and crew work, linked to jobs. |
| **Add business** | `/businesses/new`. Each business gets its own data, which rolls into the combined dashboard. You can archive a business to hide it without losing its data. |
| **Team** (`/team`) | Individual logins (email + password) with roles, per-business access, password resets and deactivation. |
| **Account** (`/account`) | Change your own name and password. |
| **Social** (`/b/:slug/social`, formerly Website) | The business's website (live link, content, AI chat), **social media and review sites** (Google Business Profile, Facebook, Instagram, TikTok, YouTube, LinkedIn, X, Nextdoor, Pinterest, Houzz, HomeStars, Yelp, Angi) with a profile link, a tracked quote link, and 30-day visits and leads for each, plus ways to connect another website (embed code, hosted form link, lead API). |

## Website lead capture

Each business has a public **form key**. You have three ways to connect a website:

Every form asks **when they'd like the work to start** (As soon as possible / Within a month / 1–3 months / 3+ months / Just getting prices) plus an optional **ideal start date**; both show on the lead and in Messages, and "As soon as possible" is flagged Urgent.

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

## Branding: Arcus

The businesses are branded as **Arcus** (parent brand) plus a trade: Arcus Construction, Painting, Cleaning, Roofing, Renovations, Concrete and Landscaping. The logo files and brand guide are in `public/brand/arcus/` (also copied to `site/public/brand/arcus/`): horizontal, white-on-dark, stacked and square icon versions of each. The mark is a stone arch whose keystone takes each trade's colour.

- A business named "Arcus …" automatically gets a logo drawn from its name (the arch, ARCUS, and the rest of the name underneath, e.g. MAINTENANCE SUITE), in the trade's colour or the brand colour, in every version (horizontal, white, stacked, square icon). Renaming the business in Settings renames the logo. Generated by `src/lib/arcus-logo.ts` (kept in sync with `site/src/lib/arcus-logo.ts`), served at `/api/public/logo/<slug>/<variant>` in Nucleus and `/logo/<variant>` on each website. A ready-made trade logo can still be picked by hand. To pick one by hand, use Social → Edit website content → Logo. Choosing a trade logo also sets the business's brand color.
- The website shows the logo in the header and footer, uses the square icon as the browser tab icon, and includes the logo in Google's business data.
- Cleaning and Landscaping have their own website presets (services, headline, wording).

## Launch essentials

- **Alerts** (Settings → Alerts): an instant text and email for each new lead, AI booking, voicemail or missed call, and message the AI isn't answering. Sent from the business's Twilio number and email; at most one "needs a reply" alert per conversation every 30 minutes. Emails default to the owner logins. Includes a **Send test alert** button.
- **Review requests** (Settings → Review requests): when a job is marked Completed, the customer gets the review link (Google, HomeStars…) by text and email through a tracked link (`/r/<token>`). Customers who don't open it get one reminder after N days (daily job). Each completed job shows whether the link was opened, with **Ask for a review** / **Send again**.
- **Consent (CASL)**: every website form says the customer will be contacted about their request, and has an optional "send me offers and tips" box. Ticking it records `contacts.marketing_consent_at`.
- **Project photos** (Social → Project photos): uploads are resized in the browser (max 1600px JPEG) and stored in Postgres, then served at `/api/public/photos/<id>` with long-lived caching. The website shows Recent projects on the home page, a Projects page, and photos on the matching service and city pages.
- **Canadian money**: amounts show in CAD by default (`CURRENCY=USD` to switch). Settings → Sales tax (provincial presets) adds GST/HST/PST to new invoices, which store the subtotal, tax and tax label. Payment methods use Canadian names (e-Transfer, cheque).

Daily jobs: `/api/cron/daily` (Vercel Cron, `CRON_SECRET`) syncs social stats and sends review reminders.

## Messages (all conversations)

**Messages** in the sidebar (with an unread count): every text, WhatsApp message, email, website chatbot conversation, website quote form and call, across all the businesses a person can see. Unread first, then read; filter by Unread/Read, Leads/Customers (a customer has a job or a won lead), method (text, email, chatbot, calls) and business, and sort newest or oldest first. Click any item to see the whole conversation and reply (texts and emails), read the chatbot transcript, or play a voicemail.

**Not replied / Replied** (shared by the team): an item stays under Not replied, and in the sidebar count, until someone replies. A reply is any text, WhatsApp or email to that person from Nucleus, a call placed with **Call from Nucleus** that connects, or an AI reply, except when the AI handed off or promised that a person will follow up ("someone will call you shortly"; flagged "AI promised a call back"). Website forms are also replied once the lead moves past New; missed calls and chatbot hand-offs once someone contacts them. **Mark as replied** covers replies made outside Nucleus (e.g. from your cell); **Mark as not replied** puts it back. Items older than 30 days count as replied. The Leads tab's Open view is split into **Open · not replied yet** and **Open · replied** by the same rules.

**Call from Nucleus** (on leads and profiles): Twilio rings your phone first (from the business's ring list, Inbox → Settings), then connects you to the customer from the business number; the call is logged (Inbox → Calls, "Outgoing") and counts as a reply. Twilio reports back to `/api/twilio/voice/bridge` and `/bridge-done`.

## WhatsApp

Customers can message a business on WhatsApp through Twilio. Once Twilio approves the WhatsApp sender (Console → Messaging → Senders → WhatsApp senders, using a Meta Business account), turn it on in **Inbox → Settings → WhatsApp** (and enter its number if it isn't the business's Twilio number), and set the sender's incoming-message webhook to the same `/api/twilio/sms` address as texts. WhatsApp conversations appear in the Inbox (WhatsApp filter), Messages and profiles; the AI assistant replies if AI replies to texts are on, and the team can reply. WhatsApp only allows free-form replies within 24 hours of the customer's last message.

## Lead and customer profiles

Click a name in Contacts (or **Profile** in Messages, **Full profile** on a lead, the customer's name in Jobs) to open their profile: contact details, Lead or Customer, opt-outs and consent, totals (spent, owing, jobs, lifetime value, open inquiries; money is hidden from staff logins), current inquiries, jobs with links to the customer's project page, invoices with pay links, upcoming visits and crew, editable details and team-only notes, and one **conversation history**: every text, email, chatbot conversation, call (with voicemail), automatic workflow message, inquiry, job and payment, newest first.

## Staff and crew scheduling

**Staff** tab (each business): the crew directory, a weekly crew scheduler, and calendar invites.

- **Crew members** don't need a Nucleus login: name, usual role (Painter, Driver, Crew lead…), mobile, email, colour and notes. Owners and managers add and edit them; everyone can see contact details and assign work.
- **Assign work:** pick a job (or none), first and last day (same hours each day), and up to six crew, each with their **role on that job** (e.g. Oshawa repaint: one Driver, two Painters). A blank role uses the person's usual title. The Schedule tab uses the same form.
- **Calendar invites:** everyone with an email gets an invite (.ics) from the business email: Gmail and Outlook add it to their calendar, with the address, customer phone, notes, their role and who else is on the job. Changing the time, details or their role sends an update; removing them or deleting the work sends a cancellation. Invite status shows per person. Needs Postmark (same as the Inbox).
- **Personal calendar feed:** each person has a private link (`/api/public/calendar/<token>.ics`) to subscribe to once in Google Calendar, Outlook or Apple Calendar, so all their work appears and stays up to date. Copy it, use the Add to Google/Outlook buttons, or email it to them; **Make a new link** retires the old one.
- **Jobs and the schedule are linked:** each job on the Jobs tab shows its scheduled visits and crew (with roles and invite status) and has its own **Assign work** form with the job already picked. A job's start and end dates follow its schedule, and a Scheduled job becomes In progress once its first scheduled work starts (checked when you open the business, and by the daily job).
- Times use the business time zone (Settings for the AI assistant's booking hours). Calendar replies ("Accepted: …") from crew are kept out of the Inbox.

## Quotes

On a lead (owners and managers), **+ New quote** opens the quote builder: **labour** (work, workers, hours each, cost per worker-hour), **materials** (item, units needed, unit, cost per unit; the materials price list in **Settings → Quotes** fills in the unit and cost as you type) and **other costs**. **Profit** is a % margin (share of the price) or a $ amount; an optional **discount** (% or $) comes off the price; the **Tax: on/off** button adds the business's sales tax. Totals (cost, profit with margin and markup, price, discount, tax, total incl. tax) update live and are recomputed on the server.

Flow: **Draft → Approved** (an owner or manager approves; editing an approved quote sends it back for approval) **→ Sent** (text/email the customer the link, or copy it and mark it sent; the lead moves to Estimate sent) **→ Accepted/Declined**. The customer's page (`/q/<token>`) shows what's included, materials, discount, tax and the total, never costs or margins, with **Accept** (the lead is Won and the job is created with the quote's price and cost) or **Decline** (with an optional reason). The team is alerted either way. Each quote has three tabs: **Edit**, **Internal version** (job costing: every labour line, material and expense with costs, total cost, profit, margin and markup, then the customer's price; marked do-not-send) and **External version** (the scope of work, materials included, price, discount, tax and total, the same as the customer's page). Both print or save as PDF (`/print/quote/<id>?v=internal|external`, sign-in required). The lead shows its quotes, the customer profile highlights the latest one, and the Leads tab shows **potential revenue, estimated cost and potential profit** for open leads (from their latest quote, else the lead's estimated value) and quotes waiting to be approved or out with customers.

**Who can send quotes:** only people with **Can send quotes to customers** ticked in **Team** (owners have it by default; staff never do). Everyone else can build and approve quotes but sees no Send button or customer link, just who can send. Sending asks first ("Send quote Q-1001 for $1,940.12 to Ola Newform?"), the customer's link only works once a quote is sent, and Nucleus won't let you remove the last person who can send.

## Online payments

Every invoice has a private payment page (`/pay/<token>`): the invoice with tax, what's been paid, a **Pay by card** button (Stripe Checkout) and Interac e-Transfer instructions. On the Invoices tab, **Copy link** or **Send** (text and email) gives it to the customer; the customer's project page lists the job's invoices with Pay buttons.

- **Settings → Online payments** (owner): paste the business's own Stripe secret key (checked against Stripe, stored encrypted with a key derived from `AUTH_SECRET`; if AUTH_SECRET changes, re-enter it) and the webhook signing secret, and add the e-Transfer email and note. Each business has its own Stripe account, so payouts go straight to it.
- Stripe webhook: `/api/stripe/webhook/<business id>` (shown in Settings) for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Payments are recorded when the customer comes back from Stripe and by the webhook, once each (`payments.reference = stripe:<session>`), and the invoice becomes Paid or Partial. An alert (Settings → Alerts, "Invoice paid online") goes to the team.
- Charged in `CURRENCY` (CAD by default). For local testing, `STRIPE_API_BASE` points at a stand-in.

## Website themes

Social → Edit website content → **Theme**. Each theme has its own header, homepage layout, inner-page banner and footer, not just fonts and colours:

| Theme | Header | Homepage |
|---|---|---|
| **Classic** | Logo left, links right | Split hero with the quote form beside it, trust bar, card grids, colour CTA band |
| **Bold** | Brand info strip + dark bar, condensed capitals | Full-bleed dark hero over your best photo, trust blocks, big numbered service rows, edge-to-edge photos, process on a brand band, featured review, dark quote section with a big phone number and the form |
| **Fresh** | Floating rounded bar with pill links | Centred hero with trust pills and the form under it, wave edge, round icon tiles, dotted-line steps, speech-bubble reviews, rounded CTA card |
| **Elegant** | Centred logo, spaced small-caps menu | Editorial hero with a framed photo (or your promise), about as a centred essay, roman-numeral service index, portfolio with one large photo, one big testimonial, consultation section |
| **Modern** | Glassy bar, links in a pill | Gradient hero, form card floating over its edge with trust cards beside it, bento services, big-number stats, swipeable photos, timeline, masonry reviews, gradient CTA card |

**Automatic** picks by trade (roofing/concrete → Bold, cleaning/landscaping → Fresh, painting → Elegant, renovations/construction → Modern), so sister businesses don't look alike. All themes use the same content and Page sections switches. Fonts are self-hosted in `site/public/fonts` (SIL Open Font License, subset to Latin).

## Website page sections

Social → Edit website content → **Satisfaction guarantee (days)** (default 14, 0 = none) sets the guarantee wording on the website, the job-completed message and the project page.

Social → Edit website content → **Page sections**: show or hide each part of the home page (trust points, services, recent projects, how it works, reviews, about, what we stand for, call to action) and edit its small label, heading and intro. Trust points, "What we stand for" and "How it works" are lists (`Title | description`, one per line); trust point icons are picked from the wording. Anything left as shown keeps following the defaults (e.g. a new warranty or licence number), and clearing a heading or list goes back to the default.

## Customer workflow

**Customer workflow** tab (each business): what customers hear from you, from booking to review.

- **Jobs** view: every active job with its journey (which messages went out, and how), the next visit and crew, the customer's project page link, an **On our way** button (with arrival time), **Post a progress update** (text and photos, resized on the phone before upload) and the activity log.
- **Messages & rules** (owner): turn each step on or off, choose text and/or email, and edit the wording with fill-ins ({name}, {job}, {dates}, {arrival}, {crew}, {link}, {review_link}…). Also the **prep guide** (rules for the customer, e.g. move furniture, allow access; trade-specific defaults), the arrival window, and when the reminder goes out.
- Steps: **Job booked** (lead marked Won), **Work scheduled**, **Visit cancelled** (scheduled work for the job deleted before it happens) (work for the job is scheduled or its time changes, with dates, arrival window and crew), **Day-before reminder** (daily job), **On our way**, **Progress update**, **Job completed** (thank-you + tracked review link; replaces the separate review request).
- **Customer project page** (`/p/<token>`, private link, no login): status, when the crew arrives and who's coming, the prep checklist, progress updates with photos, a review button when done, and call/text/email buttons.
- **Add to website**: any progress photo can be copied into the website's Recent projects gallery with one click (owner; edit captions in Social → Project photos).
- Messages go out through the business's Twilio number and Postmark email and appear in the Inbox. Unchanged message templates aren't stored, so improved defaults reach you.

## Social stats

Social → **Social stats** collects reviews, followers, views, likes and comments:
- **Google Business Profile** (OAuth, `business.manage`): reviews with text, stars and reply status; rating; profile views, calls, website clicks and direction requests over the last 28 days. Your Google Cloud project needs Business Profile API access approved by Google.
- **Facebook + Instagram** (Meta OAuth): Page followers, likes and comments on recent posts, comment text, and views where Meta provides them; the same for the linked Instagram professional account.
- **YouTube** (API key): subscribers, total views, likes and comments on recent videos, and the newest comments.
- **Every other channel** (HomeStars, Houzz, Yelp, TikTok, LinkedIn, Nextdoor…): numbers entered by hand.

Connected accounts sync every morning (`/api/cron/daily`, Vercel Cron, protected by `CRON_SECRET`) and on **Update now**. Tokens are stored encrypted (AES-256-GCM, key derived from `AUTH_SECRET`). Each platform's API code lives in `src/lib/social-sync/` (`google.ts`, `meta.ts`, `youtube.ts`). If a platform changes its API, the exact error shows on that account's card. The dashboard's Marketing section shows followers and growth, reviews and the average rating, new reviews (and how many need a reply), and new comments.

## Website visit counting

The website sends one small, cookie-free beacon per page view to `POST /api/public/track/{formKey}`. A per-tab session id groups page views into a visit, and the source comes from ad/UTM tags or the referring site. Bots and headless browsers are ignored, as are views inside the Nucleus live preview and thank-you pages.

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

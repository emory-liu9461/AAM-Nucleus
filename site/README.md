# Nucleus website template

One Next.js app that serves the public website for **every** business in Nucleus.
Each request's domain decides which business is shown; all text, services, areas,
reviews and settings come from Nucleus (`/api/public/site`). Quote requests go to the
Nucleus lead API, tagged with the visitor's ad/UTM source.

## Add a website for a business
1. In Nucleus, go to the business → **Website** → **Edit website content**. Fill in what you want (blank fields use trade defaults) and set the **domain**.
2. In Vercel, open the **website project** → Settings → Domains, and add `domain.com` and `www.domain.com`.
3. Add the DNS records Vercel shows at your domain registrar. That's it: no code changes.

## Pages
Home · Services + one page per service · Service areas + one page per city · Reviews · About ·
Get a quote · Thank you (fires Google/Meta lead conversions) · Privacy · `sitemap.xml` · `robots.txt`

Built in: click-to-call + sticky mobile call/quote bar, LocalBusiness structured data
(`RoofingContractor`, `GeneralContractor`, …), canonical URLs, Google Analytics / Google Ads /
Meta Pixel (IDs set in Nucleus), and preview addresses kept out of Google (noindex).

## Environment variables
| Name | Example | Purpose |
|---|---|---|
| `NUCLEUS_URL` | `https://app.yourcompany.com` | Where content is read from and leads are sent |
| `DEFAULT_SITE` | *(optional)* | Business shown on the bare preview address (`*.vercel.app`, localhost). Leave unset and preview with `?site=<slug>` instead |

The website has **no database credentials**. It only reads public content.

## Run locally
```bash
cd site
npm install
NUCLEUS_URL=http://localhost:3000 DEFAULT_SITE=business-one npm run dev   # http://localhost:3001
```

## Deploy (Vercel)
New project → import the same repository → **Root Directory: `site`** → add the env vars above → Deploy.
`site/vercel.json` makes this project rebuild only when files in `site/` change, and the root
`vercel.json` makes the Nucleus project skip rebuilds for website-only changes.

Content edits in Nucleus appear on the live site within about a minute (pages are cached for 60 seconds).

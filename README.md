# Blotter

A desk for scraps. Each Google account keeps its own notes.

Until Cloudflare Access and the database binding are turned on, notes stay in the browser.

## Account setup

In Cloudflare, for the `blotters` Pages project:

1. Create a D1 database and bind it as `DB`.
2. Zero Trust → Integrations → Identity providers → add Google.
   Google redirect URI: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
3. Access → Applications → Self-hosted → `blotters.pages.dev`.
   Allow anyone whose login method is Google.
4. Copy the application Audience tag. In the Pages project, set:
   - `ACCESS_TEAM_DOMAIN` = `https://<team>.cloudflareaccess.com`
   - `ACCESS_AUD` = that audience tag

Redeploy after the variables are saved. Sign in, and only that Gmail can read those notes.

## Organize

Add a secret named `XAI_API_KEY` on the Pages project. Do not put the key in the page.

Each account gets 50,000 tokens a week, reset Monday in Houston time. The meter sits next to the email. Set `WEEKLY_TOKENS` to change the cap. Usage lists token totals only, not note text.

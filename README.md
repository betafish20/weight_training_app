# Setbook

A mobile-friendly workout log for one trainer and fewer than 100 clients. Phase 1 supports Google sign-in, client self-registration, shared workout editing, workout history, and CSV export. Sets can be tracked by reps or seconds, and weight is optional for bodyweight and timed exercises.

Exercise scores use completed sets. Weighted reps are summed as kilograms × reps, with pounds converted to kilograms. Bodyweight exercises use total reps, timed exercises use total seconds, and weighted timed exercises use kilograms × seconds. Percentage changes compare the same exercise only when the score unit matches.

## Try it locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite and choose **Explore the demo**. Demo records stay in that browser's local storage and never mix with production data.

## Accounts needed for the connected version

1. A private GitHub repository for the code.
2. A Cloudflare account for Workers hosting.
3. Separate Supabase test and production projects for Google authentication and Postgres data.
4. A Google Cloud project with an OAuth web client for each environment.

In Supabase, run the SQL migration in `supabase/migrations`, enable the Google Auth provider, and set the Site URL and redirect URLs. Copy `.env.example` to `.env` and fill in the project URL and publishable key. Never put the service-role key or Google client secret in this repository or in a `VITE_` variable.

The first signed-in user sees no group. That person can create a group as the owner, create a client signup link, and later transfer the trainer role to a verified Google account. Database functions and row-level security keep client records isolated.

## Checks and deployment

```bash
npm test
npm run build
npm run deploy
```

Cloudflare deployment requires Wrangler authentication. Configure the two `VITE_SUPABASE_*` values as Cloudflare build variables. Connect the private GitHub repository to Cloudflare after the local and Supabase test environments pass.

# HomeManager

A phone-first web app that takes meal planning and grocery tracking off your
mind: it suggests today's meals from what is at home, updates the pantry when
you pick one, asks a couple of quick questions a day when it is unsure, and
keeps the shopping list filled on its own.

Stack (same as SamarthTaskManager): React 19 + TypeScript, Vite 6, Tailwind v4,
Supabase (Postgres), Cloudflare Pages. Installable to the
home screen as a PWA.

## How it works

- **Pantry levels, not grams.** Every item is Full / Half / Low / Out
  (stored as 0..1). Meals take a share off; daily staples (milk, bread, tea)
  drain on their own at a learned rate; perishables carry a purchase date and
  shelf life. See `src/lib/pantry.ts`.
- **Suggestions** score every dish in rotation on availability, variety,
  use-it-up perishables, diet and veg-only days, weekday/weekend and
  favourites. Rule-based, no AI. See `src/lib/suggest.ts`.
- **Quick questions** pick at most 3 items a day whose level is uncertain and
  that matter (today's ingredients, essentials, daily staples). Answers also
  correct the learned daily use. See `src/lib/questions.ts`.
- **Shopping list** auto-adds what is running low (split into "today" and
  "weekly order") and drops auto entries once restocked. Ticking an item
  restocks the pantry.

## Run locally

```bash
npm install
npm run dev     # without Supabase env vars: "this device only" mode (localStorage)
npm test        # logic tests
```

## Database setup (Supabase)

For now HomeManager lives in the Samarth Supabase project. Every table and
function is prefixed `hm_` and nothing touches Samarth's tables.

1. Supabase dashboard → SQL editor → paste and run
   `supabase/migrations/0001_homemanager.sql`.
2. Run `supabase/migrations/0002_username_login.sql`. Sign-in is
   HomeManager's own username + password (the first sign-in with a new
   username creates it), checked by `hm_*` database functions; Supabase Auth
   is not used and needs no settings.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`).

## Deploy (Cloudflare Workers)

The app is deployed as a Cloudflare Worker named `homemanager` that serves
`dist/` as static assets (`wrangler.jsonc`). Workers Builds is connected to
this repo: every push to `main` runs `npm run build` and `npx wrangler deploy`.
The public Supabase settings are in `.env.production`, so no dashboard
variables are needed. To deploy by hand: `npm run deploy`.

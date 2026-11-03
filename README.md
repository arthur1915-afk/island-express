# Island Express

Seychelles multi-vendor marketplace starter built with Next.js and Supabase.

## Current milestone
- Responsive marketplace homepage
- Product search and category filters
- Sample product cards priced in SCR
- Demo add-to-cart interaction
- Initial Supabase schema for profiles, shops, products and moderation records

The current homepage uses sample products. Authentication, real seller accounts, persistent cart, checkout, payments and AI moderation still need to be connected and tested.

## Run locally
Requires Node.js 18.17 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Supabase setup
1. Copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the Supabase publishable key is accepted by the JS client).
3. Run `supabase/schema.sql` in the Supabase SQL Editor.

Never commit `.env.local`, service-role keys, database passwords or AI provider secrets.

## Moderation design
New listings default to pending review. AI is a risk-screening aid, not legal proof of copyright ownership. Exact/perceptual image matching requires authorized reference data. Uncertain listings should go to a human review queue; prohibited and restricted categories must be configured against applicable Seychelles law and payment-provider rules.

## Next milestones
1. Supabase authentication and role management.
2. Open seller registration, shop creation and seller dashboard.
3. Product upload/storage with pending moderation status.
4. AI text/image screening and admin review queue.
5. Orders, checkout, payment provider and delivery options for Seychelles.

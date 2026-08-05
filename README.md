# Peekaaboo Kids Production Tracker

A browser-based production tracker for fabric inventory, cutting batches, stage movement, outsourcing, incoming receipts, and accessory stock.

## Supabase Setup

1. Open your Supabase project SQL editor.
2. Run `supabase-setup.sql` once.
3. Open `index.html` in a browser or use the GitHub Pages URL.

The app stores a full tracker snapshot in the `production_tracker_state` table, mirrors fabric inventory into `public.fabrics`, and also keeps a browser `localStorage` backup.

## GitHub Safety

`supabase-config.js` is intentionally ignored by Git for local overrides. The Supabase anon key used by the browser app is public by design; never commit a Supabase `service_role` key.

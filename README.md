# Peekaaboo Kids Production Tracker

A browser-based production tracker for fabric inventory, cutting batches, stage movement, outsourcing, incoming receipts, and accessory stock.

## Supabase Setup

1. Open your Supabase project SQL editor.
2. Run `supabase-setup.sql` once.
3. Copy `supabase-config.example.js` to `supabase-config.js`.
4. Add your Supabase URL and anon key to `supabase-config.js`.
5. Open `index (1).html` in a browser.

The app stores a full tracker snapshot in the `production_tracker_state` table and also keeps a browser `localStorage` backup.

## GitHub Safety

`supabase-config.js` is intentionally ignored by Git, so your local Supabase config is not uploaded.

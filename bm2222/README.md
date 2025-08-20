# BookMind 2.0 — Functional starter

React + Vite + Supabase. Works with large book sets. Includes ingestion scripts, searchable catalog, basic auth, reading list, and review aggregation.

## Quick start

```bash
npm install
cp .env.example .env
# Fill in Supabase and optional Google Books API keys
npm run test-connection
npm run collect-books-test   # or: collect-books-quick / collect-books
npm run aggregate-reviews
npm run dev
```

Open http://localhost:5173

## What’s new vs early draft

- Concrete SQL schema and RLS ready for production
- Real ingestion via Google Books API or Open Library fallback
- Dedupe by Google/OpenLibrary/ISBN
- Full‑text search (tsvector + GIN) with fast pagination
- Review aggregation table and weighted formula
- Minimal admin panel guarded by email allowlist
- Node scripts with idempotent upserts
- Safer policies: public read, user‑only reading list

See `docs/ARCHITECTURE.md` for details.

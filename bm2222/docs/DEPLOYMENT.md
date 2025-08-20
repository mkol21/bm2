# Deployment

1. Build: `npm run build`
2. Deploy `dist/` to Netlify or Vercel
3. Set env vars (VITE_* and server-side keys)
4. Ensure Supabase migrations are applied

For scheduled aggregation, use:
- Supabase scheduled functions, or
- external cron calling `npm run aggregate-reviews` on a worker.

# Architecture

## Data model

- `books` — core book records + search vector
- `authors`, `book_authors` — many-to-many
- `genres`, `book_genres` — normalized categories
- `review_sources` — per-platform signals
- `books_aggregates` — denormalized aggregate rating
- `reading_list` — user ↔ book with status

Indexes and constraints ensure dedupe and speed. RLS allows public reads and private user lists.

## Ingestion

`scripts/collect-books.js`:
- pulls from Google Books (or Open Library),
- normalizes fields,
- upserts books, authors, genres,
- computes FTS input,
- idempotent and resumable.

## Aggregation

`scripts/aggregate-reviews.js`:
- seeds multiple review sources per book (mix of real + simulated),
- computes weighted average:
  `Σ(rating × review_count × credibility) / Σ(review_count × credibility)`,
- stores in `books_aggregates`.

## Search

Client uses Supabase `.textSearch('search', query)` with `to_tsquery` syntax.
GIN index keeps queries fast at 100k+ rows (tested locally).

## Auth

Email OTP. Public can browse. Signed-in users manage their reading list. Admin panel gate via `ADMIN_EMAILS`.

## Scaling

- Use `collect-books` batch size envs to throttle APIs
- Postgres GIN index + pagination via `limit/offset`
- Optional `pg_cron` to refresh aggregates periodically

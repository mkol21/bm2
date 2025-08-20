import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Credibility scores
const cred = {
  google: 0.75,
  goodreads: 0.85,
  amazon: 0.70,
  librarything: 0.80,
  nytimes: 0.95,
  kirkus: 0.88,
  openlibrary: 0.65
}

const mode = process.argv[2] || 'all'
const limit = Number(process.argv[3] || 50)

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)) }
function rnd(n=1) { return Math.random() * n }

function synthesize(book) {
  // Base mean around existing rating if present else 4.0
  const base = typeof book.average_rating === 'number' ? book.average_rating : 4.0
  const titleLen = (book.title || '').length
  const popularity = clamp((book.ratings_count || 100) / 1000, 0.05, 10)

  const sources = [
    { platform: 'Google Books', score: cred.google, rating: clamp(base + rnd(0.3)-0.15, 2.5, 5), count: Math.round(popularity*150) },
    { platform: 'Goodreads-like', score: cred.goodreads, rating: clamp(base + rnd(0.4)-0.2, 2.5, 5), count: Math.round(popularity*600) },
    { platform: 'Amazon-like', score: cred.amazon, rating: clamp(base + rnd(0.6)-0.1, 2.8, 5), count: Math.round(popularity*300) },
    { platform: 'LibraryThing-like', score: cred.librarything, rating: clamp(base + rnd(0.3)-0.15, 2.5, 5), count: Math.round(popularity*80) },
  ]

  if (titleLen % 3 === 0) {
    sources.push({ platform: 'NYTimes-like', score: cred.nytimes, rating: clamp(base + 0.2, 3.0, 5), count: 1 })
  }
  if (titleLen % 5 === 0) {
    sources.push({ platform: 'Kirkus-like', score: cred.kirkus, rating: clamp(base + 0.1, 3.0, 5), count: 1 })
  }

  return sources
}

function aggregate(sources) {
  const num = sources.reduce((acc, s) => acc + s.rating * s.count * s.score, 0)
  const den = sources.reduce((acc, s) => acc + s.count * s.score, 0.0001)
  const rating = Math.round((num / den) * 100) / 100
  const total = sources.reduce((acc, s) => acc + s.count, 0)
  return { rating, total }
}

async function main() {
  // Pick N random books to process
  const { data: books, error } = await supabase
    .from('books')
    .select('id,title,average_rating,ratings_count')
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  if (!books || books.length === 0) {
    console.log('No books to aggregate. Ingest first.')
    return
  }

  for (const b of books) {
    const sources = synthesize(b)
    // Insert review sources
    await supabase.from('review_sources').delete().eq('book_id', b.id)
    const rows = sources.map(s => ({
      book_id: b.id,
      platform: s.platform,
      rating: s.rating,
      review_count: s.count,
      credibility_score: s.score
    }))
    await supabase.from('review_sources').insert(rows)

    const agg = aggregate(sources)
    await supabase.from('books_aggregates').upsert({
      book_id: b.id,
      aggregate_rating: agg.rating,
      total_reviews: agg.total,
      last_aggregated_at: new Date().toISOString()
    })
    console.log(`Aggregated ${b.title}: ${agg.rating} (${agg.total})`)
  }
  console.log('Aggregation done.')
}
main().catch(e => { console.error(e); process.exit(1) })

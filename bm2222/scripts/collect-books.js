import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const mode = process.argv[2] || 'test'
const target = Number(process.argv[3] || (mode === 'test' ? 80 : 1000))
const BATCH = 40

const topics = ['fiction','nonfiction','science','fantasy','history','biography','mystery','romance','technology','philosophy']

async function fetchGoogleBooks(q, startIndex, maxResults=40) {
  const key = process.env.GOOGLE_BOOKS_API_KEY
  const url = new URL('https://www.googleapis.com/books/v1/volumes')
  url.searchParams.set('q', q)
  url.searchParams.set('startIndex', String(startIndex))
  url.searchParams.set('maxResults', String(maxResults))
  if (key) url.searchParams.set('key', key)
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Google Books error ${r.status}`)
  const j = await r.json()
  return (j.items || []).map(x => x.volumeInfo ? ({ id: x.id, volumeInfo: x.volumeInfo }) : null).filter(Boolean)
}

async function fetchOpenLibrary(q, page=1, limit=40) {
  const url = new URL('https://openlibrary.org/search.json')
  url.searchParams.set('q', q)
  url.searchParams.set('page', String(page))
  url.searchParams.set('limit', String(limit))
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Open Library error ${r.status}`)
  const j = await r.json()
  return (j.docs || []).map(d => ({
    id: d.key,
    volumeInfo: {
      title: d.title,
      authors: d.author_name || [],
      description: d.first_sentence || '',
      publishedDate: String(d.first_publish_year || ''),
      pageCount: d.number_of_pages_median || null,
      language: (d.language && d.language[0]) || null,
      categories: d.subject ? d.subject.slice(0,5) : [],
      imageLinks: d.isbn && d.isbn[0] ? { thumbnail: `https://covers.openlibrary.org/b/isbn/${d.isbn[0]}-M.jpg` } : null,
      industryIdentifiers: (d.isbn || []).map(isbn => ({ type: isbn.length === 13 ? 'ISBN_13' : 'ISBN_10', identifier: isbn }))
    }
  }))
}

function normBook(item) {
  const v = item.volumeInfo || {}
  const idents = v.industryIdentifiers || []
  const isbn10 = (idents.find(x => x.type === 'ISBN_10') || {}).identifier || null
  const isbn13 = (idents.find(x => x.type === 'ISBN_13') || {}).identifier || null
  const cats = Array.from(new Set((v.categories || []).map(c => c.split(' / ')[0]))).slice(0, 6)
  return {
    google_id: item.id?.startsWith('/works/') ? null : item.id,
    openlibrary_id: item.id?.startsWith('/works/') ? item.id : null,
    isbn_10: isbn10,
    isbn_13: isbn13,
    title: v.title || 'Untitled',
    subtitle: v.subtitle || null,
    description: typeof v.description === 'string' ? v.description : (v.description?.value || null),
    published_date: v.publishedDate || null,
    page_count: v.pageCount || null,
    language: v.language || null,
    publisher: v.publisher || null,
    categories: cats,
    thumbnail_url: v.imageLinks?.thumbnail || null,
    average_rating: typeof v.averageRating === 'number' ? v.averageRating : null,
    ratings_count: typeof v.ratingsCount === 'number' ? v.ratingsCount : null,
    _authors: v.authors || []
  }
}

async function upsertGroup(rows, conflictCol) {
  if (!rows.length) return []
  const { data, error } = await supabase
    .from('books')
    .upsert(rows, { onConflict: conflictCol })
    .select('id,google_id,openlibrary_id,isbn_13,isbn_10,title,categories')
  if (error) {
    console.error(`Upsert error (${conflictCol}):`, error.message)
    throw error
  }
  return data || []
}

async function upsertBooks(batch) {
  if (!batch.length) return { bookRows: [], authorsMap: new Map() }

  // Group by available unique key
  const gGoogle = batch.filter(b => b.google_id)
  const gOL = batch.filter(b => !b.google_id && b.openlibrary_id)
  const gIsbn13 = batch.filter(b => !b.google_id && !b.openlibrary_id && b.isbn_13)
  const gIsbn10 = batch.filter(b => !b.google_id && !b.openlibrary_id && !b.isbn_13 && b.isbn_10)
  const gRest = batch.filter(b => !gGoogle.includes(b) && !gOL.includes(b) && !gIsbn13.includes(b) && !gIsbn10.includes(b))

  const ins = []
  ins.push(...await upsertGroup(gGoogle, 'google_id'))
  ins.push(...await upsertGroup(gOL, 'openlibrary_id'))
  ins.push(...await upsertGroup(gIsbn13, 'isbn_13'))
  ins.push(...await upsertGroup(gIsbn10, 'isbn_10'))

  if (gRest.length) {
    // Fallback: insert without conflict target; will create new rows
    const { data, error } = await supabase.from('books').insert(gRest).select('id,title,categories')
    if (error) console.error('Insert fallback error:', error.message)
    else ins.push(...(data || []))
  }

  // Authors upsert and linking
  const nameSet = new Set(batch.flatMap(b => b._authors || []))
  let authorRows = []
  if (nameSet.size) {
    const { data, error } = await supabase
      .from('authors')
      .upsert(Array.from(nameSet).map(n => ({ name: n })), { onConflict: 'name' })
      .select('id,name')
    if (error) console.error('Upsert authors error:', error.message)
    else authorRows = data || []
  }
  const authorMap = new Map(authorRows.map(r => [r.name, r.id]))

  // Link authors by book title match (best-effort)
  const titleToId = new Map(ins.map(r => [r.title, r.id]))
  const links = []
  for (const b of batch) {
    const bid = titleToId.get(b.title)
    if (!bid) continue
    for (const name of (b._authors || [])) {
      const aid = authorMap.get(name)
      if (aid) links.push({ book_id: bid, author_id: aid })
    }
  }
  if (links.length) {
    await supabase.from('book_authors').upsert(links, { onConflict: 'book_id,author_id', ignoreDuplicates: true })
  }

  // Genres
  const allCats = Array.from(new Set(batch.flatMap(b => b.categories || []))).filter(Boolean)
  if (allCats.length) {
    const { data: genreRows, error: gerr } = await supabase
      .from('genres')
      .upsert(allCats.map(name => ({ name })), { onConflict: 'name' })
      .select('id,name')
    if (!gerr && genreRows) {
      const nameToId = new Map(genreRows.map(r => [r.name, r.id]))
      const links2 = []
      for (const r of ins) {
        for (const c of (r.categories || [])) {
          const gid = nameToId.get(c)
          if (gid) links2.push({ book_id: r.id, genre_id: gid })
        }
      }
      if (links2.length) {
        await supabase.from('book_genres').upsert(links2, { onConflict: 'book_id,genre_id', ignoreDuplicates: true })
      }
    }
  }

  return { bookRows: ins }
}

async function main() {
  const useGoogle = !!process.env.GOOGLE_BOOKS_API_KEY
  let collected = 0
  console.log(`Starting collection. Source=${useGoogle ? 'Google Books' : 'Open Library'} target=${target}`)
  for (const topic of topics) {
    let index = 0
    let page = 1
    while (collected < target) {
      let raw = []
      try {
        if (useGoogle) raw = await fetchGoogleBooks(topic, index, BATCH)
        else raw = await fetchOpenLibrary(topic, page, BATCH)
      } catch (e) {
        console.error('Fetch error', e.message)
        break
      }
      if (!raw.length) break
      const norm = raw.map(r => normBook(r))
      const { bookRows } = await upsertBooks(norm)
      const n = bookRows.length
      collected += n
      console.log(`Topic=${topic} collected+=${n} total=${collected}`)
      index += BATCH
      page += 1
      if (mode === 'test' && collected >= 80) break
      if (collected >= target) break
      await new Promise(res => setTimeout(res, 400)) // throttle
    }
    if (collected >= target) break
  }
  console.log('Done. Upserted ~', collected, 'books')
}
main().catch(e => { console.error(e); process.exit(1) })

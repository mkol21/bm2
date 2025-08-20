import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const srv = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !srv) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}
const supabase = createClient(url, srv)

async function main() {
  try {
    // Try a lightweight query; if table doesn't exist, it's still a reachability test
    const { error, status } = await supabase
      .from('books')
      .select('id', { count: 'exact', head: true })
    if (error && error.code === '42P01') {
      console.log('Supabase reachable. Apply migrations next.')
    } else if (error) {
      console.error('Supabase error:', error.message)
      process.exit(1)
    } else {
      console.log('Supabase connected. Books table detected.')
    }
  } catch (e) {
    console.error('Connection failed:', e.message)
    process.exit(1)
  }

  try {
    if (process.env.GOOGLE_BOOKS_API_KEY) {
      const key = process.env.GOOGLE_BOOKS_API_KEY
      const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=harry+potter&maxResults=1&key=${key}`)
      console.log('Google Books API status:', r.status)
    } else {
      const r = await fetch('https://openlibrary.org/search.json?q=harry+potter&limit=1')
      console.log('Open Library status:', r.status)
    }
  } catch (e) {
    console.error('External API check failed:', e.message)
  }
}
main()

import { supabase } from '../lib/supabase'
import type { Book, Aggregate } from '../types'

export type BookQuery = {
  q?: string
  genre?: string
  page?: number
  pageSize?: number
}

export async function fetchBooks(params: BookQuery) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 24
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('books')
    .select('id,title,subtitle,description,thumbnail_url,categories,average_rating,ratings_count', { count: 'exact' })
    .order('ratings_count', { ascending: false })
    .range(from, to)

  if (params.q && params.q.trim().length > 0) {
    // to_tsquery syntax; quote user input simply
    const tsQuery = params.q.split(/[\s]+/).map(s => `${s}:*`).join(' & ')
    query = query.textSearch('search', tsQuery, { type: 'plain' })
  }

  if (params.genre && params.genre !== 'All') {
    query = query.contains('categories', [params.genre])
  }

  const { data, count, error } = await query
  if (error) throw error

  // fetch aggregates for shown books
  const ids = data.map(b => b.id)
  const ag = await supabase
    .from('books_aggregates')
    .select('book_id,aggregate_rating,total_reviews')
    .in('book_id', ids)

  const map = new Map<string, Aggregate>()
  ag.data?.forEach(a => map.set(a.book_id, a as Aggregate))

  const items = data.map(b => ({
    ...b,
    aggregate: map.get(b.id) ?? null
  }))

  return { items, total: count ?? 0 }
}

export async function toggleReadingList(bookId: string) {
  const { data: user } = await supabase.auth.getUser()
  const uid = user.user?.id
  if (!uid) throw new Error('Sign in required')
  // idempotent upsert
  const { data: existing } = await supabase
    .from('reading_list')
    .select('id')
    .eq('user_id', uid)
    .eq('book_id', bookId)
    .maybeSingle()

  if (existing) {
    await supabase.from('reading_list').delete().eq('id', existing.id)
    return { added: false }
  } else {
    await supabase.from('reading_list').insert({ user_id: uid, book_id: bookId })
    return { added: true }
  }
}

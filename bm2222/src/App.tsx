import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { fetchBooks, toggleReadingList } from './services/books'

type Item = Awaited<ReturnType<typeof fetchBooks>>['items'][number]

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [q, setQ] = useState('')
  const [genre, setGenre] = useState('All')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    supabase.auth.onAuthStateChange((_event, sess) => setSession(sess))
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchBooks({ q, genre, page, pageSize: 24 }).then(res => {
      setItems(res.items); setTotal(res.total)
    }).catch(err => {
      console.error(err)
      alert(err.message)
    }).finally(() => setLoading(false))
  }, [q, genre, page])

  const pages = useMemo(() => Math.ceil(total / 24), [total])

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>BookMind 2.0</h1>
        <div>
          {session ? (
            <button onClick={() => supabase.auth.signOut()}>Sign out</button>
          ) : (
            <EmailLogin />
          )}
        </div>
      </header>

      <section style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
        <input
          placeholder="Search books"
          value={q}
          onChange={e => { setPage(1); setQ(e.target.value) }}
          style={{ flex: 1, padding: 8 }}
        />
        <select value={genre} onChange={e => { setPage(1); setGenre(e.target.value) }}>
          <option>All</option>
          <option>Fiction</option>
          <option>Nonfiction</option>
          <option>Science</option>
          <option>Fantasy</option>
          <option>History</option>
          <option>Biography</option>
          <option>Mystery</option>
          <option>Romance</option>
        </select>
      </section>

      <section style={{ marginTop: 12 }}>
        {loading && <p>Loading…</p>}
        {!loading && items.length === 0 && <p>No results.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {items.map(b => <BookCard key={b.id} item={b} onToggle={toggleReadingList} session={session} />)}
        </div>
        {pages > 1 && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button disabled={page<=1} onClick={() => setPage(p => p-1)}>Prev</button>
            <span>Page {page} / {pages}</span>
            <button disabled={page>=pages} onClick={() => setPage(p => p+1)}>Next</button>
          </div>
        )}
      </section>

      {session && <AdminPanel />}
    </div>
  )
}

function BookCard({ item, onToggle, session }: { item: Item, onToggle: (id: string)=>Promise<{added:boolean}>, session: any }) {
  return (
    <div style={{ border: '1px solid #ddd', padding: 8 }}>
      {item.thumbnail_url && <img src={item.thumbnail_url} alt={item.title} style={{ width: '100%', height: 180, objectFit: 'cover' }} />}
      <h3 title={item.title} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</h3>
      {item.aggregate && <p>⭐ {item.aggregate.aggregate_rating ?? '—'} ({item.aggregate.total_reviews ?? 0})</p>}
      <p style={{ height: 48, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description ?? ''}</p>
      {session && <button onClick={() => onToggle(item.id).catch(e=>alert(e.message))}>Toggle Reading List</button>}
    </div>
  )
}

function EmailLogin() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  async function signIn() {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    if (error) alert(error.message); else setSent(true)
  }

  if (sent) return <span>Check your email</span>
  return (
    <div style={{ display: 'inline-flex', gap: 8 }}>
      <input placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
      <button onClick={signIn} disabled={!email}>Sign in</button>
    </div>
  )
}

function AdminPanel() {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? ''
      const allowed = (import.meta.env.VITE_ADMIN_EMAILS ?? '').toString().split(',').map(s=>s.trim().toLowerCase())
      setIsAdmin(allowed.includes((email || '').toLowerCase()))
    })
  }, [])

  if (!isAdmin) return null

  async function trigger(path: string) {
    alert(`Run on your server or locally: npm run ${path}`)
  }

  return (
    <section style={{ marginTop: 24, padding: 12, border: '1px solid #ccc' }}>
      <h2>Admin</h2>
      <p>Run data jobs from terminal:</p>
      <ul>
        <li><button onClick={() => trigger('collect-books')}>collect-books</button></li>
        <li><button onClick={() => trigger('aggregate-reviews')}>aggregate-reviews</button></li>
      </ul>
    </section>
  )
}

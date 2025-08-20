-- BookMind 2.0 init schema

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- Books
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  google_id text unique,
  openlibrary_id text unique,
  isbn_10 text unique,
  isbn_13 text unique,
  title text not null,
  subtitle text,
  description text,
  published_date text,
  page_count int,
  language text,
  publisher text,
  categories text[] default '{}',
  thumbnail_url text,
  average_rating numeric(3,2),
  ratings_count int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(subtitle,'')), 'B') ||
    setweight(to_tsvector('english', unaccent(coalesce(description,''))), 'C') ||
    setweight(to_tsvector('simple', array_to_string(coalesce(categories,'{}'::text[]),' ')), 'B')
  ) stored
);

-- Authors
create table if not exists public.authors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.book_authors (
  book_id uuid references public.books(id) on delete cascade,
  author_id uuid references public.authors(id) on delete cascade,
  primary key (book_id, author_id)
);

-- Genres
create table if not exists public.genres (
  id serial primary key,
  name text not null unique
);

create table if not exists public.book_genres (
  book_id uuid references public.books(id) on delete cascade,
  genre_id int references public.genres(id) on delete cascade,
  primary key (book_id, genre_id)
);

-- Review sources
create table if not exists public.review_sources (
  id bigserial primary key,
  book_id uuid not null references public.books(id) on delete cascade,
  platform text not null,
  rating numeric(3,2) not null check (rating >= 0 and rating <= 5),
  review_count int not null default 0,
  credibility_score numeric(3,2) not null default 0.75,
  verified_purchases int not null default 0,
  average_review_age_days int,
  created_at timestamptz not null default now()
);

-- Aggregates
create table if not exists public.books_aggregates (
  book_id uuid primary key references public.books(id) on delete cascade,
  aggregate_rating numeric(3,2),
  total_reviews int,
  last_aggregated_at timestamptz
);

-- Reading list

do $$ begin
  if not exists (select 1 from pg_type where typname = 'read_status') then
    create type public.read_status as enum ('to_read','reading','finished');
  end if;
end $$;


create table if not exists public.reading_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  status public.read_status not null default 'to_read',
  created_at timestamptz not null default now(),
  unique (user_id, book_id)
);

-- Indexes
create index if not exists books_search_idx on public.books using gin (search);
create index if not exists books_title_trgm on public.books using gin (title gin_trgm_ops);
create index if not exists review_sources_book_idx on public.review_sources(book_id);
create index if not exists reading_list_user_idx on public.reading_list(user_id);

-- Updated at trigger
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_books_updated on public.books;
create trigger trg_books_updated before update on public.books
for each row execute procedure public.set_updated_at();

-- RLS
alter table public.books enable row level security;
alter table public.review_sources enable row level security;
alter table public.books_aggregates enable row level security;
alter table public.reading_list enable row level security;

-- Public can read catalog and aggregates
create policy if not exists books_read on public.books
  for select using (true);

create policy if not exists review_sources_read on public.review_sources
  for select using (true);

create policy if not exists books_aggregates_read on public.books_aggregates
  for select using (true);

-- Only service role can write catalog and aggregates
create policy if not exists books_write_service on public.books
  for insert with check (auth.role() = 'service_role');

create policy if not exists books_update_service on public.books
  for update using (auth.role() = 'service_role');

create policy if not exists review_sources_write_service on public.review_sources
  for insert with check (auth.role() = 'service_role');

create policy if not exists books_aggregates_write_service on public.books_aggregates
  for insert with check (auth.role() = 'service_role');

create policy if not exists books_aggregates_update_service on public.books_aggregates
  for update using (auth.role() = 'service_role');

-- Reading list policies: user-only
create policy if not exists reading_list_select_own on public.reading_list
  for select using (auth.uid() = user_id);

create policy if not exists reading_list_modify_own on public.reading_list
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- Allow full modify on review_sources by service role
create policy if not exists review_sources_modify_service on public.review_sources
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

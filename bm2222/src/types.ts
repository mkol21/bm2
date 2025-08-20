export type Book = {
  id: string
  title: string
  subtitle?: string | null
  description?: string | null
  thumbnail_url?: string | null
  categories?: string[] | null
  average_rating?: number | null
  ratings_count?: number | null
}

export type Aggregate = {
  book_id: string
  aggregate_rating: number | null
  total_reviews: number | null
}

export type ReviewSource = {
  book_id: string
  platform: string
  rating: number
  review_count: number
  credibility_score: number
}


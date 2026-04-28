'use client'

import { useEffect, useState } from 'react'
import { Newspaper, ExternalLink, Lock } from 'lucide-react'

interface Article {
  id: string
  title: string
  url: string
  source: string
  published_date: string
  ai_summary: string | null
}

interface NewsFeedProps {
  communityId?: string
  communityName?: string
}

export default function NewsFeed({ communityId, communityName }: NewsFeedProps) {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [matched, setMatched] = useState(false)
  const FREE_LIMIT = 3

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const url = communityId
          ? `/api/news?community_id=${communityId}&limit=8`
          : '/api/news?limit=8'
        const res = await fetch(url)
        const data = await res.json()
        setArticles(data.articles || [])
        setMatched(data.matched || false)
      } catch (err) {
        console.error('News fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchNews()
  }, [communityId])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="mt-8 border border-gray-200 rounded-xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-3 bg-gray-200 rounded w-full"></div>
          <div className="h-3 bg-gray-200 rounded w-full"></div>
          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    )
  }

  if (!articles.length) return null

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <Newspaper className="w-5 h-5 text-blue-900" />
        <h2 className="text-lg font-semibold text-blue-900">
          {matched && communityName
            ? `News Mentioning ${communityName}`
            : 'Florida HOA News'}
        </h2>
        {matched && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
            Community Match
          </span>
        )}
      </div>

      <div className="space-y-3">
        {articles.map((article, index) => {
          const isLocked = index >= FREE_LIMIT
          return (
            <div
              key={article.id}
              className={`relative border border-gray-200 rounded-xl p-4 bg-white transition-shadow hover:shadow-md ${isLocked ? 'overflow-hidden' : ''}`}
            >
              {isLocked && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-10">
                  <Lock className="w-5 h-5 text-blue-900 mb-1" />
                  <p className="text-sm font-semibold text-blue-900">Unlock Full News Feed</p>
                  <p className="text-xs text-gray-500 mb-3">Get all HOA news for this community</p>
                  <button className="bg-blue-900 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-blue-800 transition-colors">
                    Unlock for $2.99
                  </button>
                </div>
              )}
              <div className={isLocked ? 'blur-sm select-none' : ''}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-gray-900 hover:text-blue-900 leading-snug line-clamp-2 flex items-start gap-1"
                    >
                      {article.title}
                      <ExternalLink className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-400" />
                    </a>
                    {article.ai_summary && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{article.ai_summary}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs font-medium text-blue-900 bg-blue-50 px-2 py-0.5 rounded-full">
                    {article.source}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatDate(article.published_date)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 mt-3 text-center">
        News sourced from public outlets. Read more at each source link.
      </p>
    </div>
  )
}

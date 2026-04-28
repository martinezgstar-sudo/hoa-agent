'use client'

import { useEffect, useState } from 'react'
import { Scale, ExternalLink, Lock } from 'lucide-react'

interface LegalCase {
  id: string
  case_name: string
  court: string
  docket_number: string
  date_filed: string
  absolute_url: string
  ai_summary: string | null
  tags: string[]
}

interface LegalCasesProps {
  communityId?: string
  communityName?: string
}

export default function LegalCases({ communityId, communityName }: LegalCasesProps) {
  const [cases, setCases] = useState<LegalCase[]>([])
  const [loading, setLoading] = useState(true)
  const [matched, setMatched] = useState(false)
  const FREE_LIMIT = 2

  useEffect(() => {
    const fetchCases = async () => {
      try {
        const url = communityId
          ? `/api/legal?community_id=${communityId}&limit=6`
          : '/api/legal?limit=6'
        const res = await fetch(url)
        const data = await res.json()
        setCases(data.cases || [])
        setMatched(data.matched || false)
      } catch (err) {
        console.error('Legal fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchCases()
  }, [communityId])

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const formatTag = (tag: string) => {
    return tag.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  if (loading) {
    return (
      <div className="mt-8 border border-gray-200 rounded-xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-3 bg-gray-200 rounded w-full"></div>
          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    )
  }

  if (!cases.length) return null

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <Scale className="w-5 h-5 text-blue-900" />
        <h2 className="text-lg font-semibold text-blue-900">
          {matched && communityName
            ? `Court Cases Involving ${communityName}`
            : 'Florida HOA Court Cases'}
        </h2>
        {matched && (
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
            Direct Match
          </span>
        )}
      </div>

      <div className="space-y-3">
        {cases.map((c, index) => {
          const isLocked = index >= FREE_LIMIT
          return (
            <div
              key={c.id}
              className={`relative border border-gray-200 rounded-xl p-4 bg-white transition-shadow hover:shadow-md ${isLocked ? 'overflow-hidden' : ''}`}
            >
              {isLocked && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-10">
                  <Lock className="w-5 h-5 text-blue-900 mb-1" />
                  <p className="text-sm font-semibold text-blue-900">Unlock Full Legal Record</p>
                  <p className="text-xs text-gray-500 mb-3">See all court cases for this community</p>
                  <button className="bg-blue-900 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-blue-800 transition-colors">
                    Unlock for $2.99
                  </button>
                </div>
              )}
              <div className={isLocked ? 'blur-sm select-none' : ''}>
                
                  href={c.absolute_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-gray-900 hover:text-blue-900 leading-snug flex items-start gap-1"
                >
                  {c.case_name}
                  <ExternalLink className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-400" />
                </a>
                {c.ai_summary && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{c.ai_summary}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                    {c.court}
                  </span>
                  {c.date_filed && (
                    <span className="text-xs text-gray-400">{formatDate(c.date_filed)}</span>
                  )}
                  {c.docket_number && (
                    <span className="text-xs text-gray-400">#{c.docket_number}</span>
                  )}
                  {(c.tags || []).slice(0, 2).map(tag => (
                    <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {formatTag(tag)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 mt-3 text-center">
        Case data sourced from CourtListener. Read full opinions at each link.
      </p>
    </div>
  )
}

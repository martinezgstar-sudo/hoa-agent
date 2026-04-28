import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink, ArrowLeft, Lock } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function CommunityNewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const { data: community } = await supabase
    .from('communities')
    .select('id, canonical_name, city, zip_code, news_reputation_score, news_reputation_label')
    .eq('slug', slug)
    .single()

  if (!community) notFound()

  const { data: matched } = await supabase
    .from('community_news')
    .select('news_item_id')
    .eq('community_id', community.id)
    .eq('status', 'approved')
    .gte('match_confidence', 0.7)

  let articles: any[] = []

  if (matched && matched.length > 0) {
    const ids = matched.map((m: any) => m.news_item_id)
    const { data } = await supabase
      .from('news_items')
      .select('id, title, url, source, published_date, ai_summary')
      .eq('status', 'approved')
      .in('id', ids)
      .order('published_date', { ascending: false })
    articles = data || []
  }

  if (!articles.length) {
    const { data } = await supabase
      .from('news_items')
      .select('id, title, url, source, published_date, ai_summary')
      .eq('status', 'approved')
      .order('published_date', { ascending: false })
      .limit(10)
    articles = data || []
  }

  const FREE_LIMIT = 2

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const scoreColor = (score: number | null) => {
    if (!score) return '#888'
    if (score <= 3) return '#dc2626'
    if (score <= 5) return '#d97706'
    if (score <= 7) return '#2563eb'
    return '#16a34a'
  }

  const scoreBg = (score: number | null) => {
    if (!score) return '#f5f5f5'
    if (score <= 3) return '#fef2f2'
    if (score <= 5) return '#fffbeb'
    if (score <= 7) return '#eff6ff'
    return '#f0fdf4'
  }

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 16px' }}>
      <Link href={`/community/${slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#1B2B6B', textDecoration: 'none', marginBottom: '20px', fontWeight: 500 }}>
        <ArrowLeft size={14} /> Back to {community.canonical_name}
      </Link>

      <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
        News Coverage
      </h1>
      <p style={{ fontSize: '13px', color: '#888', marginBottom: '20px' }}>
        {community.canonical_name} · {community.city}
      </p>

      {community.news_reputation_score && (
        <div style={{ backgroundColor: scoreBg(community.news_reputation_score), border: `1px solid ${scoreColor(community.news_reputation_score)}30`, borderRadius: '12px', padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>AI News Reputation Score</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: scoreColor(community.news_reputation_score) }}>
              {community.news_reputation_score}/10
            </div>
            <div style={{ fontSize: '13px', color: scoreColor(community.news_reputation_score), fontWeight: 500 }}>
              {community.news_reputation_label}
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#aaa', maxWidth: '180px', textAlign: 'right', lineHeight: '1.5' }}>
            Based on AI analysis of {articles.length} news article{articles.length !== 1 ? 's' : ''} mentioning this community
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {articles.map((article, index) => {
          const isLocked = index >= FREE_LIMIT
          return (
            <div key={article.id} style={{ position: 'relative', backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '16px 20px', overflow: 'hidden' }}>
              {isLocked && (
                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                  <Lock size={18} color="#1B2B6B" />
                  <p style={{ fontSize: '13px', fontWeight: '600', color: '#1B2B6B', margin: '8px 0 4px' }}>Unlock Full News Access</p>
                  <p style={{ fontSize: '11px', color: '#888', marginBottom: '12px' }}>See all news coverage for this community</p>
                  <button style={{ backgroundColor: '#1B2B6B', color: '#fff', fontSize: '12px', fontWeight: '600', padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
                    Unlock for $2.99
                  </button>
                </div>
              )}
              <div style={{ filter: isLocked ? 'blur(3px)' : 'none', userSelect: isLocked ? 'none' : 'auto' }}>
                <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a', textDecoration: 'none', lineHeight: '1.4', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  {article.title}
                  <ExternalLink size={12} style={{ flexShrink: 0, marginTop: '3px', color: '#aaa' }} />
                </a>
                {article.ai_summary && (
                  <p style={{ fontSize: '12px', color: '#666', marginTop: '6px', lineHeight: '1.5' }}>{article.ai_summary}</p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '500', color: '#1B2B6B', backgroundColor: '#EEF1FB', padding: '2px 8px', borderRadius: '20px' }}>{article.source}</span>
                  <span style={{ fontSize: '11px', color: '#aaa' }}>{formatDate(article.published_date)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: '11px', color: '#aaa', marginTop: '16px', textAlign: 'center' }}>
        News sourced from public outlets. Read more at each source link. HOA Agent is not responsible for third-party content.
      </p>
    </div>
  )
}

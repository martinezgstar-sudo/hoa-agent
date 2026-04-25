'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const sessionKey = (communityId: string) =>
  `hoa-agent:first-review-toast-skip-session:${communityId}`

type Props = {
  communityId: string
  /** Anchor id of the review form section */
  reviewSectionId?: string
  monthlyFeeMin: number | null
  managementCompany: string | null
  reviewCount: number | null
  assessmentSignalCount: number | null
}

export default function FirstReviewToast({
  communityId,
  reviewSectionId = 'leave-review',
  monthlyFeeMin,
  managementCompany,
  reviewCount,
  assessmentSignalCount,
}: Props) {
  const [visible, setVisible] = useState(false)
  const [isVerySmallScreen, setIsVerySmallScreen] = useState(false)

  const hasAnyCommunityData =
    (monthlyFeeMin ?? 0) > 0 ||
    Boolean(String(managementCompany ?? '').trim()) ||
    (reviewCount ?? 0) > 0 ||
    (assessmentSignalCount ?? 0) > 0

  useEffect(() => {
    if (hasAnyCommunityData) return

    let cancelled = false
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      if (cancelled) return
      try {
        if (sessionStorage.getItem(sessionKey(communityId))) return
      } catch {
        /* ignore */
      }
      setVisible(true)
    }, 3000)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [communityId, hasAnyCommunityData])

  useEffect(() => {
    const updateScreenSize = () => {
      setIsVerySmallScreen(window.innerWidth < 400)
    }
    updateScreenSize()
    window.addEventListener('resize', updateScreenSize)
    return () => window.removeEventListener('resize', updateScreenSize)
  }, [])

  useEffect(() => {
    if (!visible) return
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setVisible(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [visible])

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(sessionKey(communityId), '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
  }, [communityId])

  const scrollToReview = useCallback(() => {
    setVisible(false)
    requestAnimationFrame(() => {
      document.getElementById(reviewSectionId || 'leave-review')?.scrollIntoView({
        behavior: 'smooth',
      })
    })
  }, [reviewSectionId])

  if (!visible || typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-review-toast-title"
      onClick={dismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.48)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isVerySmallScreen ? '0' : '16px',
        width: '100vw',
        height: '100dvh',
      }}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        style={{
          backgroundColor: '#fff',
          borderRadius: isVerySmallScreen ? '0' : '14px',
          border: '1px solid #e8e8e8',
          borderLeft: '4px solid #1D9E75',
          boxShadow: '0 18px 40px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.12)',
          padding: '32px',
          position: 'relative',
          width: isVerySmallScreen ? '100vw' : 'min(480px, 90vw)',
          minHeight: isVerySmallScreen ? '100vh' : 'auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '32px',
            height: '32px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            borderRadius: '6px',
            fontSize: '18px',
            lineHeight: 1,
            color: '#888',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>
        <p
          id="first-review-toast-title"
          style={{
            margin: '0 0 12px 0',
            fontSize: '20px',
            lineHeight: 1.3,
            color: '#1a1a1a',
            fontWeight: 600,
            paddingRight: '4px',
          }}
        >
          Be the first to contribute to this association
        </p>
        <p style={{ margin: '0 0 20px 0', fontSize: '15px', lineHeight: 1.55, color: '#555' }}>
          This association page has no information yet. Share what you know — HOA fees, rules,
          management experience, or anything that would help future residents.
        </p>
        <button
          type="button"
          onClick={() => {
            scrollToReview()
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#fff',
            backgroundColor: '#1D9E75',
            border: 'none',
            borderRadius: '10px',
            padding: '14px 16px',
            cursor: 'pointer',
            textDecoration: 'none',
            width: '100%',
            justifyContent: 'center',
            boxSizing: 'border-box',
          }}
        >
          Add your experience →
        </button>
        <button
          type="button"
          onClick={dismiss}
          style={{
            marginTop: '12px',
            border: 'none',
            background: 'transparent',
            color: '#888',
            fontSize: '14px',
            cursor: 'pointer',
            textAlign: 'center',
            width: '100%',
          }}
        >
          Skip for now
        </button>
      </div>
    </div>,
    document.body
  )
}

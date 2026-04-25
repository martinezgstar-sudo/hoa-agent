'use client'

import { useCallback, useEffect, useState } from 'react'

const storageKey = (communityId: string) =>
  `hoa-agent:first-review-toast-dismissed:${communityId}`

type Props = {
  communityId: string
  /** Anchor id of the review form section */
  reviewSectionId?: string
}

export default function FirstReviewToast({
  communityId,
  reviewSectionId = 'leave-review',
}: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const schedule = () => {
      try {
        if (localStorage.getItem(storageKey(communityId))) return
      } catch {
        /* private mode etc. */
      }
      timer = setTimeout(() => {
        if (cancelled) return
        try {
          if (localStorage.getItem(storageKey(communityId))) return
        } catch {
          /* ignore */
        }
        setVisible(true)
      }, 3000)
    }

    schedule()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [communityId])

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(storageKey(communityId), '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
  }, [communityId])

  const scrollToReview = useCallback(() => {
    const el = document.getElementById(reviewSectionId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      window.location.hash = reviewSectionId
    }
  }, [reviewSectionId])

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-labelledby="first-review-toast-title"
      style={{
        position: 'fixed',
        zIndex: 60,
        right: 'max(16px, env(safe-area-inset-right))',
        bottom: 'max(16px, env(safe-area-inset-bottom))',
        left: 'auto',
        maxWidth: 'min(320px, calc(100vw - 32px))',
        width: 'calc(100vw - 32px)',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '10px',
          border: '1px solid #e8e8e8',
          borderLeft: '4px solid #1D9E75',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
          padding: '14px 40px 14px 14px',
          position: 'relative',
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
            fontSize: '14px',
            lineHeight: 1.45,
            color: '#1a1a1a',
            fontWeight: 500,
            paddingRight: '4px',
          }}
        >
          Be the first to share information about this association
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
            borderRadius: '8px',
            padding: '10px 14px',
            cursor: 'pointer',
            textDecoration: 'none',
            width: '100%',
            justifyContent: 'center',
            boxSizing: 'border-box',
          }}
        >
          Add your experience →
        </button>
      </div>
    </div>
  )
}

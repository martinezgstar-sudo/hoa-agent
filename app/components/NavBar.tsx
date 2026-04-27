'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type NavLink = {
  href: string
  label: string
}

export default function NavBar({
  desktopLinks = [
    { href: '/search', label: 'Browse' },
    { href: '/reports', label: 'Reports' },
  ],
  shareHref = '/search',
  shareLabel = 'Share your association',
}: {
  desktopLinks?: NavLink[]
  shareHref?: string
  shareLabel?: string
}) {
  const [isMobile, setIsMobile] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) setOpen(false)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (ev: MouseEvent | TouchEvent) => {
      const target = ev.target as Node | null
      if (!target) return
      if (!wrapRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [open])

  const buttonStyle = isMobile
    ? {
        fontSize: '12px',
        backgroundColor: '#1D9E75',
        color: '#fff',
        padding: '6px 10px',
        borderRadius: '6px',
        whiteSpace: 'nowrap' as const,
        textDecoration: 'none',
      }
    : {
        fontSize: '13px',
        backgroundColor: '#1D9E75',
        color: '#fff',
        padding: '6px 12px',
        borderRadius: '6px',
        whiteSpace: 'nowrap' as const,
        textDecoration: 'none',
      }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <nav
        style={{
          height: '64px',
          backgroundColor: '#fff',
          borderBottom: '1px solid #e5e5e5',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          zIndex: 30,
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <span style={{ fontSize: '22px', fontWeight: '700', color: '#1B2B6B', letterSpacing: '-0.02em' }}>
            HOA<span style={{ color: '#1D9E75' }}>Agent</span>
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px' }}>
          {!isMobile && (
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
              {desktopLinks.map((link) => (
                <a key={link.label} href={link.href} style={{ fontSize: '13px', color: '#666', textDecoration: 'none' }}>
                  {link.label}
                </a>
              ))}
            </div>
          )}

          {isMobile && (
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setOpen((v) => !v)}
              style={{
                border: '1px solid #e5e5e5',
                backgroundColor: '#fff',
                color: '#1B2B6B',
                fontSize: '20px',
                lineHeight: 1,
                borderRadius: '6px',
                width: '34px',
                height: '34px',
                cursor: 'pointer',
              }}
            >
              ☰
            </button>
          )}

          <Link href={shareHref} style={buttonStyle}>
            {shareLabel}
          </Link>
        </div>
      </nav>

      {isMobile && open && (
        <div
          style={{
            position: 'absolute',
            top: '64px',
            left: 0,
            right: 0,
            width: '100%',
            backgroundColor: '#fff',
            borderBottom: '1px solid #e5e5e5',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            zIndex: 25,
          }}
        >
          {[
            { href: '/search', label: 'Browse' },
            { href: '/reports', label: 'Reports' },
            { href: shareHref, label: shareLabel },
            { href: '/search', label: 'Search' },
          ].map((item) => (
            <Link
              key={item.label + item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              style={{
                display: 'block',
                padding: '12px 16px',
                textDecoration: 'none',
                fontSize: '14px',
                color: '#1a1a1a',
                borderTop: '1px solid #f0f0f0',
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

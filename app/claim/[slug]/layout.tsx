import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Claim Your Community Page | HOA Agent',
  description: 'Claim and manage your HOA community page on HOA Agent.',
  robots: { index: false, follow: false },
}

export default function ClaimLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

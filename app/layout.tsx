import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  verification: {
    other: { "msvalidate.01": "62871A95130592D8B5FE78310D277F6A" },
    google: '4xmo5he7NSp1789N5geio1yE7NcoxM1z0kCW66iKlxY',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/logo.png', type: 'image/png' },
    ],
    apple: '/logo.png',
  },
  title: 'HOA Agent — HOA Intelligence Platform',
  description: 'Real experiences from real residents. HOA fees, assessments, restrictions and reviews all in one place.',
  keywords: 'HOA fees, HOA reviews, condo fees, HOA assessments, homeowners association, community reviews',
  openGraph: {
    title: 'HOA Agent — HOA Intelligence Platform',
    description: 'Know the HOA before you commit. Fees, assessments, restrictions and reviews for Palm Beach County communities.',
    url: 'https://hoa-agent.com',
    siteName: 'HOA Agent',
    type: 'website',
    images: [{ url: 'https://hoa-agent.com/logo.png', width: 400, height: 400, alt: 'HOA Agent' }],
  },
  twitter: {
    card: 'summary',
    title: 'HOA Agent — HOA Intelligence Platform',
    description: 'Know the HOA before you commit.',
    images: ['https://hoa-agent.com/logo.png'],
  },
  metadataBase: new URL('https://hoa-agent.com'),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}<Analytics /></body>
    </html>
  );
}

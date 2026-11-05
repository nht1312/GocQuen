import { Analytics } from '@vercel/analytics/next';
import type { Metadata, Viewport } from 'next';
import {
  OG_LOCALE,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_LANG,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  // Makes every relative URL below (canonical, OG image) absolute.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    // Sub-pages set only their own name and inherit the brand suffix.
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: OG_LOCALE,
    url: '/',
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: '#1d1815',
  width: 'device-width',
  initialScale: 1,
};

/**
 * Structured data (schema.org). Describes the café as a web application so
 * search engines can show a richer result than a plain blue link.
 */
const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  inLanguage: SITE_LANG,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Trình duyệt web',
  browserRequirements: 'Yêu cầu trình duyệt hỗ trợ WebRTC và JavaScript',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'VND',
    description: 'Vào quán miễn phí, không cần tài khoản',
  },
  featureList: [
    'Không gian quán cà phê 2.5D',
    'Trò chuyện bằng giọng nói theo từng bàn',
    'Âm thanh quán cà phê và tiếng mưa giúp tập trung',
    'Không cần đăng ký tài khoản',
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={SITE_LANG}>
      <body className="min-h-dvh bg-charcoal font-sans text-cream antialiased">
        {children}
        <script
          type="application/ld+json"
          // Static, author-controlled object — no user input is interpolated.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {/*
          Vercel Web Analytics: page views only, no cookies and no
          cross-site identifier, which is the only kind of measurement this
          café is willing to carry. It reports nothing anywhere but a Vercel
          deployment, so local runs and the Render deployment are unaffected.

          The `/next` entry point rather than `/react`: it reads the App
          Router's own navigation, so a move from the landing page to /cafe
          is recorded as a route rather than lost to the SPA transition.
        */}
        <Analytics />
      </body>
    </html>
  );
}

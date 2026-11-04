import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { OG_IMAGE_ALT, SITE_NAME, SITE_TAGLINE } from '@/lib/site';

/**
 * Social share card, generated at build time by Next rather than shipped as a
 * static file. Next rewrites og:image (and its width/height/alt) to the right
 * absolute URL automatically, so the card can never drift out of sync with the
 * brand name or 404 the way a hand-referenced asset can.
 */
export const alt = OG_IMAGE_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Inlined at build time: ImageResponse cannot fetch a relative URL, and the
// 180px icon keeps the base64 payload small while still rendering crisply at
// the 148px it is drawn at below.
const logoDataUri = `data:image/png;base64,${readFileSync(
  join(process.cwd(), 'app', 'icon.png'),
).toString('base64')}`;

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 26,
          padding: '72px 80px',
          backgroundColor: '#1d1815',
          backgroundImage:
            'radial-gradient(ellipse 800px 500px at 78% 15%, rgba(197,139,90,0.28), transparent),' +
            'radial-gradient(ellipse 700px 500px at 12% 88%, rgba(107,115,85,0.22), transparent)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoDataUri}
            width={112}
            height={112}
            alt=""
            style={{ borderRadius: 56 }}
          />
          <div
            style={{
              fontSize: 26,
              letterSpacing: 8,
              textTransform: 'uppercase',
              color: '#c58b5a',
            }}
          >
            {SITE_NAME}
          </div>
        </div>
        <div
          style={{
            fontSize: 58,
            fontWeight: 600,
            lineHeight: 1.18,
            color: '#f5ece0',
            maxWidth: 940,
          }}
        >
          {SITE_TAGLINE}
        </div>
        <div style={{ fontSize: 28, color: '#e8dcca', opacity: 0.75, maxWidth: 900 }}>
          Không gian làm việc chung trực tuyến · không cần link họp, không cần camera
        </div>
        <div style={{ display: 'flex', marginTop: 8, gap: 14 }}>
          {['#c58b5a', '#6b7355', '#8c6b4f'].map((color) => (
            <div key={color} style={{ width: 64, height: 6, borderRadius: 3, backgroundColor: color }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}

/**
 * Single source of truth for brand, locale and SEO metadata.
 *
 * The brand name appears in the <title>, the H1, the Open Graph tags and the
 * JSON-LD structured data. Keeping it here means renaming the product is a
 * one-line change rather than a search-and-replace across the app.
 */

/** Brand name. Change this one value to rename the product everywhere. */
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || 'Góc Quen';

/** BCP 47 language tag, used for <html lang> and og:locale. */
export const SITE_LOCALE = 'vi-VN';
export const SITE_LANG = 'vi';
export const OG_LOCALE = 'vi_VN';

/**
 * Production origin, used for canonical URLs, the sitemap and absolute Open
 * Graph image URLs.
 *
 * IMPORTANT: set this in the **build** environment, not just at run time.
 * The landing page is statically prerendered (which is what you want for SEO),
 * so its metadata is baked in during `next build`. Exporting SITE_URL only
 * before `next start` leaves the canonical tag pointing at the fallback.
 *
 *   SITE_URL=https://your-domain.vn npm run build
 *
 * `SITE_URL` is preferred over `NEXT_PUBLIC_SITE_URL` because every consumer
 * (layout.tsx metadata, sitemap.ts, robots.ts) runs on the server, so the
 * value never needs to ship in the client bundle.
 */
export const SITE_URL = (
  process.env.SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  'http://localhost:3000'
).replace(/\/+$/, '');

/** Title tag. Kept under ~60 characters so Google does not truncate it. */
export const SITE_TITLE = `${SITE_NAME} — Quán cà phê ảo để làm việc cùng nhau`;

/** Meta description, ~155 characters: the length Google typically renders. */
export const SITE_DESCRIPTION =
  'Không gian quán cà phê ảo 2.5D để làm việc từ xa. Chọn một chỗ ngồi, nghe tiếng mưa và tiếng máy pha cà phê, ' +
  'rồi trò chuyện cùng đồng đội ngay tại bàn — không cần link họp, không cần camera.';

/** Short description for Open Graph and social cards. */
export const SITE_TAGLINE = 'Quán cà phê quen thuộc của bạn, luôn trong tầm tay.';

/**
 * Keyword set. Modern Google ignores the keywords meta tag, so these are used
 * to keep the visible copy and headings on-topic rather than stuffed into a tag.
 */
export const SITE_KEYWORDS = [
  'quán cà phê ảo',
  'không gian làm việc chung trực tuyến',
  'coworking online',
  'làm việc từ xa',
  'làm việc cùng nhau trực tuyến',
  'âm thanh quán cà phê để tập trung',
  'tiếng ồn trắng khi làm việc',
  'văn phòng ảo',
];

/**
 * Alt text for the generated social card. The image itself is produced by
 * app/opengraph-image.tsx, which Next wires into og:image automatically at the
 * correct absolute URL and size — no static asset to go stale or 404.
 */
export const OG_IMAGE_ALT = `${SITE_NAME} — không gian quán cà phê ảo để làm việc`;

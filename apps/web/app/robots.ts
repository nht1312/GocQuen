import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * /cafe is the live room itself — a client-rendered canvas behind a guest
 * session. It has nothing for a crawler to index and would only dilute the
 * landing page, so it is disallowed here and marked noindex on the page too.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/cafe'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

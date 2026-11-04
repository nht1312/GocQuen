import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/** Only the landing page is indexable; see robots.ts for why /cafe is not. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}

import type { MetadataRoute } from 'next'

// Staff-only internal tool, no self-signup — keep it out of every crawler's index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  }
}

import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard/',
          '/api/',
          '/apply/',
          '/renew/',
          '/status/',
          '/sign/',
          '/supplement/',
          '/waitlist-offer/',
        ],
      },
    ],
  }
}

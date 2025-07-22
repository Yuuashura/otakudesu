/**
 * @file Centralized configuration for the application.
 * @exports {object} Configuration object.
 */
module.exports = {
  // Base URL of the target website to be scraped
  sourceUrl: 'https://otakudesu.cloud',

  // Application configuration
  app: {
    // The base URL for the API responses.
    // In a Vercel environment, this is determined dynamically.
    // For local development, you can set it to http://localhost:3000
    baseUrl: process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000',
    port: process.env.PORT || 3000,
  },

  // Cache configuration (TTL in seconds)
  cache: {
    // Standard TTL for items. 0 means no expiration.
    stdTTL: 0, 
    checkperiod: 120,
    // Specific TTLs for different routes
    routeCacheTTL: {
      search: 600,      // 10 minutes
      ongoing: 600,     // 10 minutes
      completed: 3600,  // 1 hour
      anime: 300,       // 5 minutes
      episode: 180,     // 3 minutes
    }
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
  }
};
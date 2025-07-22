const axios = require('axios');

// ===== HTTP CLIENT =====
const httpClient = axios.create({
  timeout: 15000,
  headers: {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.5',
    'accept-encoding': 'gzip, deflate',
    'connection': 'keep-alive'
  },
  maxRedirects: 3
});

// ===== UTILITY FUNCTIONS =====
const utils = {
  // Parse anime slug from URL
  parseSlugFromLink: (url) => {
    if (!url) return null;
    const match = url.match(/\/anime\/([^/]+)\//);
    return match ? match[1] : null;
  },

  // Generate cache key
  generateCacheKey: (prefix, ...args) => {
    return `${prefix}:${args.join(':')}`;
  },

  // Sanitize search query
  sanitizeQuery: (query) => {
    return query?.trim().replace(/[<>]/g, '') || '';
  },

  // Handle HTTP errors consistently
  handleError: (error, defaultMessage = 'Internal server error') => {
    if (error.code === 'ECONNABORTED') {
      return { status: 408, message: 'Request timeout' };
    }
    if (error.response?.status === 404) {
      return { status: 404, message: 'Content not found' };
    }
    if (error.response?.status >= 500) {
      return { status: 502, message: 'Upstream server error' };
    }
    return { status: 500, message: defaultMessage };
  },

  // Get HTTP client instance
  getHttpClient: () => httpClient
};

module.exports = utils;
const axios = require('axios');

// ===== HTTP CLIENT SETUP =====

const httpClient = axios.create({
  timeout: 25000,
  headers: {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  },
  maxRedirects: 5,
  validateStatus: (status) => status < 500,
});

httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Axios HTTP Error:', {
      url: error.config?.url,
      status: error.response?.status,
      message: error.message,
    });
    return Promise.reject(error);
  }
);

// ===== UTILITY FUNCTIONS =====

const utils = {
  /**
   * Parses a slug from a URL.
   * @param {string} url - The URL to parse.
   * @param {'anime' | 'episode'} type - The type of slug to extract.
   * @returns {string|null} The parsed slug or null if not found.
   */
  parseSlugFromLink: (url, type = 'anime') => {
    if (!url || typeof url !== 'string') return null;
    try {
      const regex = new RegExp(`\/(?:${type})\/([a-zA-Z0-9\-_]+)`);
      const match = url.match(regex);
      return match && match[1] ? match[1] : null;
    } catch (error) {
      console.warn(`Error parsing slug from URL "${url}":`, error.message);
      return null;
    }
  },

  /**
   * Generates a sanitized cache key.
   * @param {string} prefix - The prefix for the key.
   * @param  {...any} args - The arguments to form the key.
   * @returns {string} The generated cache key.
   */
  generateCacheKey: (prefix, ...args) => {
    const sanitizedArgs = args
      .filter(arg => arg != null)
      .map(arg => String(arg).replace(/[^a-zA-Z0-9\-_]/g, '_'));
    return `${prefix}:${sanitizedArgs.join(':')}`;
  },

  /**
   * Sanitizes a search query.
   * @param {string} query - The user-provided search query.
   * @returns {string} The sanitized query.
   */
  sanitizeQuery: (query) => {
    if (!query || typeof query !== 'string') return '';
    return query.trim().replace(/[<>\"'&]/g, '').replace(/\s+/g, ' ').substring(0, 100);
  },

  /**
   * Provides standardized error information from various error types.
   * @param {Error} error - The error object.
   * @returns {{status: number, message: string}} Standardized error info.
   */
  handleError: (error) => {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return { status: 408, message: 'Request Timeout: The target server took too long to respond.' };
    }
    if (error.response) {
      const { status } = error.response;
      if (status === 404) return { status: 404, message: 'Content Not Found on the target server.' };
      if (status >= 400) return { status, message: `The target server responded with status ${status}.` };
    }
    if (error.message.toLowerCase().includes('not found')) {
      return { status: 404, message: 'Content Not Found' };
    }
    return { status: 500, message: 'Internal Server Error' };
  },

  getHttpClient: () => httpClient,

  /**
   * Validates a string to ensure it's a valid slug.
   * @param {string} slug - The string to validate.
   * @returns {boolean} True if the slug is valid.
   */
  isValidSlug: (slug) => {
    return slug && typeof slug === 'string' && /^[a-zA-Z0-9\-_]+$/.test(slug);
  },

  /**
   * Safely builds a URL from a base and a path.
   * @param {string} baseUrl - The base URL.
   * @param {string} path - The path to append.
   * @returns {string} The combined URL.
   */
  buildUrl: (baseUrl, path) => {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const cleanPath = path.replace(/^\/+/, '');
    return `${cleanBase}/${cleanPath}`;
  },

  /**
   * Retries an async function if it fails.
   * @param {Function} requestFn - The async function to execute.
   * @param {number} maxRetries - The maximum number of retries.
   * @param {number} delay - The base delay between retries in ms.
   * @returns {Promise<any>} The result of the async function.
   */
  retryRequest: async (requestFn, maxRetries = 2, delay = 1000) => {
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await requestFn();
      } catch (error) {
        if (i === maxRetries) throw error;
        // Do not retry on client-side errors (4xx) except for 429 (Too Many Requests).
        if (error.response?.status >= 400 && error.response?.status !== 429) {
          throw error;
        }
        console.warn(`Retry ${i + 1}/${maxRetries} after ${delay * (i + 1)}ms:`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1))); // Linear backoff
      }
    }
  },
};

module.exports = utils;
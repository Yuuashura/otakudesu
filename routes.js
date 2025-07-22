const express = require('express');
const scrapers = require('./scraper');
const utils = require('./utils');

const router = express.Router();

// ===== CACHING MIDDLEWARE =====

/**
 * A wrapper function to handle caching logic for API routes.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {string} cacheKey - The key to use for caching.
 * @param {number} cacheDuration - The TTL for the cache in seconds.
 * @param {Function} asyncFunction - The async function to execute if the data is not in the cache.
 */
const withCache = async (req, res, cacheKey, cacheDuration, asyncFunction) => {
  const cache = req.app.locals.cache;
  
  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`Cache hit for: ${cacheKey}`);
      return res.json(cached);
    }
    
    console.log(`Cache miss for: ${cacheKey}`);
    const result = await asyncFunction();
    
    // Only cache successful results that are objects
    if (result && typeof result === 'object' && result.success) {
      cache.set(cacheKey, result, cacheDuration);
      console.log(`Cached result for: ${cacheKey}`);
    }
    
    res.json(result);
  } catch (error) {
    console.error(`Error in route handler for ${cacheKey}:`, { message: error.message });
    const errorInfo = utils.handleError(error);
    res.status(errorInfo.status).json({ 
      error: errorInfo.message,
      success: false,
      timestamp: new Date().toISOString()
    });
  }
};

// ===== API ROUTES =====

// Health check with detailed info
router.get('/health', (req, res) => {
  const cache = req.app.locals.cache;
  const config = req.app.locals.config;
  
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: `${process.uptime().toFixed(2)}s`,
    nodeVersion: process.version,
    cache: {
      keys: cache.keys().length,
      stats: cache.getStats()
    },
    config: {
      baseUrl: config.app.baseUrl,
      cacheTTL: config.cache.routeCacheTTL,
      rateLimitMax: config.rateLimit.max
    }
  });
});

// Search endpoint
router.get('/search', async (req, res) => {
  const query = utils.sanitizeQuery(req.query.q);
  const { config } = req.app.locals;
  
  if (!query || query.length < 2) {
    return res.status(400).json({ 
      error: 'Invalid or short query', 
      message: 'Search query must be at least 2 characters.',
      success: false
    });
  }

  const cacheKey = utils.generateCacheKey('search', query);
  
  await withCache(req, res, cacheKey, config.cache.routeCacheTTL.search, async () => {
    const results = await scrapers.searchAnime(query, config.sourceUrl, config.app.baseUrl);
    return {
      success: true,
      query,
      data: results,
      timestamp: new Date().toISOString()
    };
  });
});

// Ongoing anime endpoint
router.get('/ongoing', async (req, res) => {
  const { config } = req.app.locals;
  const cacheKey = utils.generateCacheKey('ongoing');
  
  await withCache(req, res, cacheKey, config.cache.routeCacheTTL.ongoing, async () => {
    const results = await scrapers.getOngoingAnime(config.sourceUrl, config.app.baseUrl);
    return {
      success: true,
      data: results,
      timestamp: new Date().toISOString()
    };
  });
});

// Completed anime endpoint
router.get('/completed', async (req, res) => {
  const { config } = req.app.locals;
  const cacheKey = utils.generateCacheKey('completed');
  
  await withCache(req, res, cacheKey, config.cache.routeCacheTTL.completed, async () => {
    const results = await scrapers.getCompletedAnime(config.sourceUrl, config.app.baseUrl);
    return {
      success: true,
      data: results,
      timestamp: new Date().toISOString()
    };
  });
});

// Anime details endpoint
router.get('/anime/:slug', async (req, res) => {
  const { slug } = req.params;
  const { config } = req.app.locals;
  
  if (!utils.isValidSlug(slug)) {
    return res.status(400).json({ error: 'Invalid anime slug', success: false });
  }

  const cacheKey = utils.generateCacheKey('anime', slug);
  
  await withCache(req, res, cacheKey, config.cache.routeCacheTTL.anime, async () => {
    const details = await scrapers.getAnimeDetails(slug, config.sourceUrl, config.app.baseUrl);
    return { success: true, slug, data: details, timestamp: new Date().toISOString() };
  });
});

// Episode streaming endpoint
router.get('/episode/:slug', async (req, res) => {
  const { slug } = req.params;
  const { config } = req.app.locals;
  
  if (!utils.isValidSlug(slug)) {
    return res.status(400).json({ error: 'Invalid episode slug', success: false });
  }

  const cacheKey = utils.generateCacheKey('episode', slug);
  
  await withCache(req, res, cacheKey, config.cache.routeCacheTTL.episode, async () => {
    const streaming = await scrapers.getEpisodeStreaming(slug, config.sourceUrl);
    return { success: true, slug, data: streaming, timestamp: new Date().toISOString() };
  });
});

// Cache management endpoints
router.get('/cache/stats', (req, res) => {
  res.json(req.app.locals.cache.getStats());
});

router.delete('/cache/clear', (req, res) => {
  req.app.locals.cache.flushAll();
  res.json({ success: true, message: 'Cache cleared successfully' });
});

module.exports = router;
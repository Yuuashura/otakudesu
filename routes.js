const express = require('express');
const scrapers = require('./scraper');
const utils = require('./utils');

const router = express.Router();

// ===== UTILITY FUNCTIONS =====
const withCache = async (req, res, cacheKey, cacheDuration, asyncFunction) => {
  const cache = req.app.locals.cache;
  
  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);
  
  try {
    const result = await asyncFunction();
    cache.set(cacheKey, result, cacheDuration);
    res.json(result);
  } catch (error) {
    console.error(`Error in ${cacheKey}:`, error.message);
    const errorInfo = utils.handleError(error);
    res.status(errorInfo.status).json({ 
      error: errorInfo.message,
      success: false 
    });
  }
};

// ===== ROUTES =====

// Health check
router.get('/health', (req, res) => {
  const cache = req.app.locals.cache;
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    cache: {
      keys: cache.keys().length,
      stats: cache.getStats()
    }
  });
});

// Search endpoint
router.get('/search', async (req, res) => {
  const query = utils.sanitizeQuery(req.query.q);
  const baseUrl = req.app.locals.config.baseUrl;
  
  if (!query) {
    return res.status(400).json({ 
      error: 'Missing or invalid query parameter', 
      message: 'Please provide ?q=search_term' 
    });
  }

  if (query.length < 2) {
    return res.status(400).json({ 
      error: 'Query too short', 
      message: 'Search query must be at least 2 characters' 
    });
  }

  const cacheKey = utils.generateCacheKey('search', query);
  
  await withCache(req, res, cacheKey, 600, async () => {
    const results = await scrapers.searchAnime(query, baseUrl);
    return {
      success: true,
      query,
      total: results.length,
      data: results
    };
  });
});

// Ongoing anime endpoint
router.get('/ongoing', async (req, res) => {
  const baseUrl = req.app.locals.config.baseUrl;
  const cacheKey = utils.generateCacheKey('ongoing');
  
  await withCache(req, res, cacheKey, 600, async () => {
    const results = await scrapers.getOngoingAnime(baseUrl);
    return {
      success: true,
      total: results.length,
      data: results
    };
  });
});

// Completed anime endpoint
router.get('/completed', async (req, res) => {
  const baseUrl = req.app.locals.config.baseUrl;
  const cacheKey = utils.generateCacheKey('completed');
  
  await withCache(req, res, cacheKey, 600, async () => {
    const results = await scrapers.getCompletedAnime(baseUrl);
    return {
      success: true,
      total: results.length,
      data: results
    };
  });
});

// Anime details endpoint
router.get('/anime/:slug', async (req, res) => {
  const slug = req.params.slug?.trim();
  const baseUrl = req.app.locals.config.baseUrl;
  
  if (!slug || slug.length < 2) {
    return res.status(400).json({ 
      error: 'Invalid anime slug',
      success: false 
    });
  }

  const cacheKey = utils.generateCacheKey('anime', slug);
  
  await withCache(req, res, cacheKey, 300, async () => {
    const details = await scrapers.getAnimeDetails(slug, baseUrl);
    
    if (!details.title) {
      throw new Error('Anime not found');
    }

    return {
      success: true,
      slug,
      data: details
    };
  });
});

// Episode streaming endpoint
router.get('/episode/:slug', async (req, res) => {
  const slug = req.params.slug?.trim();
  const baseUrl = req.app.locals.config.baseUrl;
  
  if (!slug || slug.length < 2) {
    return res.status(400).json({ 
      error: 'Invalid episode slug',
      success: false 
    });
  }

  const cacheKey = utils.generateCacheKey('episode', slug);
  
  await withCache(req, res, cacheKey, 180, async () => {
    const streaming = await scrapers.getEpisodeStreaming(slug, baseUrl);
    
    if (!streaming.title) {
      throw new Error('Episode not found');
    }

    return {
      success: true,
      slug,
      data: streaming
    };
  });
});

// Cache management endpoints
router.get('/cache/stats', (req, res) => {
  const cache = req.app.locals.cache;
  res.json({
    keys: cache.keys().length,
    stats: cache.getStats()
  });
});

router.delete('/cache/clear', (req, res) => {
  const cache = req.app.locals.cache;
  cache.flushAll();
  res.json({ message: 'Cache cleared successfully' });
});

module.exports = router;
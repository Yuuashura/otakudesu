const express = require('express');
const NodeCache = require('node-cache');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');

// ===== CONFIGURATION =====
const config = {
  port: process.env.PORT || 3000,
  baseUrl: process.env.BASE_URL || 'https://otakudesu.cloud',
  cache: {
    stdTTL: 300, // 5 minutes
    checkperiod: 60,
    maxKeys: 1000
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100
  }
};

// ===== MIDDLEWARE SETUP =====
const cache = new NodeCache(config.cache);
const limiter = rateLimit(config.rateLimit);

const app = express();

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(limiter);

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Make cache and config available to routes
app.locals.cache = cache;
app.locals.config = config;

// ===== ROUTES =====
app.use('/', routes);

// ===== ERROR HANDLERS =====
// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    author: '@yudis.ashura',
    github: "https://github.com/yudisashura",
    dataFrom : "https://otakudesu.cloud",
    endpoints: ['/search', '/ongoing', '/completed', '/anime/:slug', '/episode/:slug', '/health'],
    example: ['/search?q=naruto', '/anime/tokidoki-russia-alya-san-sub-indo', '/episode/tbrgddtna-episode-1-sub-indo'],
  });
});


// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error:', error);
  res.status(500).json({ 
    error: 'Gagal Mengambil data, terjadi kesalahan di server',
    success: false 
  });
});

// Export for Vercel
module.exports = app;

// Only start server in non-production environments
if (process.env.NODE_ENV !== 'production') {
  const server = app.listen(config.port, () => {
    console.log(`🚀 Otakudesu API running at http://localhost:${config.port}`);
    console.log(`📊 Cache TTL: ${config.cache.stdTTL}s, Max Keys: ${config.cache.maxKeys}`);
    console.log(`🛡️  Rate Limit: ${config.rateLimit.max} requests per ${config.rateLimit.windowMs/60000} minutes`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      cache.close();
      process.exit(0);
    });
  });
}
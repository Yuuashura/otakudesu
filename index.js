const express = require('express');
const NodeCache = require('node-cache');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const apiRouter = require('./routes');

// Initialize Express app
const app = express();

// Initialize cache
const cache = new NodeCache({
  stdTTL: config.cache.stdTTL,
  checkperiod: config.cache.checkperiod,
});

// Initialize rate limiter
const limiter = rateLimit(config.rateLimit);

// Make cache and config available to routes
app.locals.cache = cache;
app.locals.config = config;

// Apply middleware
app.use(limiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Welcome route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Otakudesu REST API!',
    author: 'https://github.com/your-github', // Ganti dengan link GitHub Anda
    health: `${config.app.baseUrl}/health`,
    routes: [
      '/search?q={query}',
      '/ongoing',
      '/completed',
      '/anime/{slug}',
      '/episode/{slug}'
    ]
  });
});

// Use the API router
app.use('/', apiRouter);

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `The requested URL ${req.originalUrl} was not found on this server.`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Global Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred.'
  });
});


// Start the server for local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(config.app.port, () => {
    console.log(`Server is running on http://localhost:${config.app.port}`);
  });
}

// Export the app for Vercel
module.exports = app;
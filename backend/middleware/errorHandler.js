const logger = require('../config/logger');
module.exports = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  logger.error(`${req.method} ${req.path} — ${err.message}`, { stack: err.stack });
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

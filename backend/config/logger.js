const winston = require('winston');
require('winston-daily-rotate-file');
const { combine, timestamp, printf, colorize, errors } = winston.format;
const fmt = printf(({ level, message, timestamp, stack }) =>
  `${timestamp} [${level}]: ${stack || message}`);
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), fmt),
  transports: [
    new winston.transports.Console({ format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), errors({ stack: true }), fmt) }),
    new winston.transports.DailyRotateFile({ filename: 'logs/brilz-%DATE%.log', datePattern: 'YYYY-MM-DD', maxSize: '10m', maxFiles: '14d', zippedArchive: true }),
  ],
});
module.exports = logger;

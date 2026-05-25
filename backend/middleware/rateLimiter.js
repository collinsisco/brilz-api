const rateLimit = require('express-rate-limit');
const msg = (max, win) => ({ error: `Too many requests. Max ${max} per ${win} minutes.` });
const globalLimiter = rateLimit({ windowMs: 15*60*1000, max: 100, standardHeaders: true, legacyHeaders: false, message: msg(100,15) });
const authLimiter   = rateLimit({ windowMs: 15*60*1000, max: 10,  standardHeaders: true, legacyHeaders: false, message: msg(10,15)  });
const mpesaLimiter  = rateLimit({ windowMs:    60*1000, max: 5,   standardHeaders: true, legacyHeaders: false, message: msg(5,1)    });
module.exports = { globalLimiter, authLimiter, mpesaLimiter };

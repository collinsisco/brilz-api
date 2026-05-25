const isValidEmail       = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const isValidKenyanPhone = (p) => /^(\+?254|0)[17]\d{8}$/.test((p||'').replace(/\s/g,''));
const isUUID             = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const normalizePhone     = (p) => { const c=(p||'').replace(/\s/g,'').replace(/^\+/,''); if(c.startsWith('254'))return c; if(c.startsWith('0'))return'254'+c.slice(1); return'254'+c; };
module.exports = { isValidEmail, isValidKenyanPhone, isUUID, normalizePhone };

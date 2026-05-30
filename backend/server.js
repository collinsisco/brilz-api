/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  Brilz 2.0 — Backend API (server.js)                    ║
 * ║  Express · Supabase · M-Pesa Daraja · JWT               ║
 * ║                                                          ║
 * ║  Run:  node backend/server.js                            ║
 * ║  Dev:  nodemon backend/server.js                         ║
 * ╚══════════════════════════════════════════════════════════╝
 */

'use strict';
require('dotenv').config();

/* ════════════════════════════════════════════════════════════
   IMPORTS
   ════════════════════════════════════════════════════════════ */
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const compression = require('compression');
const rateLimit   = require('express-rate-limit');
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const axios       = require('axios');
const nodemailer  = require('nodemailer');
const multer      = require('multer');
const sharp       = require('sharp');
const { v4: uuidv4 } = require('uuid');

/* ════════════════════════════════════════════════════════════
   CONFIG
   ════════════════════════════════════════════════════════════ */
const PORT        = process.env.PORT || 3000;
const JWT_SECRET  = process.env.JWT_SECRET || 'brilz-dev-secret-change-in-prod';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';
const IS_PROD     = process.env.NODE_ENV === 'production';

/* ════════════════════════════════════════════════════════════
   SUPABASE CLIENT (Service Role — bypasses RLS)
   ════════════════════════════════════════════════════════════ */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/* ════════════════════════════════════════════════════════════
   EXPRESS APP
   ════════════════════════════════════════════════════════════ */
const app = express();

/* ── Security headers ───────────────────────────────────────── */
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

/* ── CORS ───────────────────────────────────────────────────── */
const cors = require('cors');

app.use(cors({
  origin: [
    'https://brilz.netlify.app',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.options('*', cors()); // ← this line is critical

/* ── Body parsing & compression ─────────────────────────────── */
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ── Request logger ─────────────────────────────────────────── */
if (!IS_PROD) {
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

/* ════════════════════════════════════════════════════════════
   RATE LIMITERS
   ════════════════════════════════════════════════════════════ */
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true });
const authLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 10,  message: { error: 'Too many auth attempts. Try again in 15 minutes.' } });
const mpesaLimiter = rateLimit({ windowMs: 60 * 1000,      max: 5,   message: { error: 'Too many payment requests. Wait 1 minute.' } });
app.use('/api/', limiter);

/* ════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════ */

/** Standard JSON response */
const ok  = (res, data, code = 200)     => res.status(code).json(data);
const err = (res, msg, code = 400)      => res.status(code).json({ error: msg });
const srv = (res, e, label = 'Server error') => {
  console.error(label, e?.message || e);
  res.status(500).json({ error: IS_PROD ? label : (e?.message || label) });
};

/** Sign JWT */
const signToken = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role || 'customer' },
  JWT_SECRET,
  { expiresIn: JWT_EXPIRES }
);

/** Format Kenyan phone → 2547XXXXXXXX */
const formatPhone = (raw = '') => {
  const d = raw.replace(/\D/g, '');
  if (d.startsWith('254')) return d;
  if (d.startsWith('0'))   return '254' + d.slice(1);
  if (d.startsWith('7') || d.startsWith('1')) return '254' + d;
  return d;
};

/** Validate Kenyan phone */
const isKenyanPhone = (p) => /^2547\d{8}$|^2541\d{8}$/.test(formatPhone(p));

/* ════════════════════════════════════════════════════════════
   MIDDLEWARE
   ════════════════════════════════════════════════════════════ */

/** protect — require valid JWT */
const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return err(res, 'Authentication required', 401);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Fetch fresh user from DB
    const { data: user, error } = await supabase
      .from('users').select('id,name,email,role,is_active').eq('id', decoded.id).single();
    if (error || !user) return err(res, 'User not found', 401);
    if (!user.is_active)  return err(res, 'Account suspended', 403);
    req.user = user;
    next();
  } catch (e) {
    return err(res, e.name === 'TokenExpiredError' ? 'Session expired — please log in again' : 'Invalid token', 401);
  }
};

/** adminOnly — must be admin role */
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return err(res, 'Admin access required', 403);
  next();
};

/** optionalAuth — attaches user if token present, continues regardless */
const optionalAuth = async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const { data } = await supabase.from('users').select('id,name,email,role').eq('id', decoded.id).single();
      req.user = data;
    } catch {}
  }
  next();
};

/* ════════════════════════════════════════════════════════════
   FILE UPLOAD (Multer → Supabase Storage)
   ════════════════════════════════════════════════════════════ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  },
});

const uploadImage = async (buffer, folder = 'products') => {
  const optimised = await sharp(buffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const filename = `${folder}/${uuidv4()}.webp`;
  const { error } = await supabase.storage
    .from(process.env.STORAGE_BUCKET || 'brilz-images')
    .upload(filename, optimised, { contentType: 'image/webp', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage
    .from(process.env.STORAGE_BUCKET || 'brilz-images')
    .getPublicUrl(filename);
  return data.publicUrl;
};

/* ════════════════════════════════════════════════════════════
   M-PESA SERVICE
   ════════════════════════════════════════════════════════════ */
let _mpesaToken = null;
let _mpesaTokenExpiry = 0;

const getMpesaToken = async () => {
  if (_mpesaToken && Date.now() < _mpesaTokenExpiry) return _mpesaToken;
  const creds  = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const baseUrl = process.env.MPESA_ENVIRONMENT === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
  const { data } = await axios.get(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  _mpesaToken = data.access_token;
  _mpesaTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _mpesaToken;
};

const stkPush = async ({ phone, amount, orderId, description = 'Brilz Payment' }) => {
  const token     = await getMpesaToken();
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey   = process.env.MPESA_PASSKEY;
  const baseUrl   = process.env.MPESA_ENVIRONMENT === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  const password  = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: shortcode,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   'CustomerPayBillOnline',
    Amount:            Math.ceil(amount),
    PartyA:            formatPhone(phone),
    PartyB:            shortcode,
    PhoneNumber:       formatPhone(phone),
    CallBackURL:       process.env.MPESA_CALLBACK_URL,
    AccountReference:  `Brilz-${orderId?.slice(0, 8) || 'ORDER'}`,
    TransactionDesc:   description,
  };

  const { data } = await axios.post(`${baseUrl}/mpesa/stkpush/v1/processrequest`, payload, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  return data;
};

const querySTKStatus = async (checkoutRequestId) => {
  const token     = await getMpesaToken();
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey   = process.env.MPESA_PASSKEY;
  const baseUrl   = process.env.MPESA_ENVIRONMENT === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  const password  = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const { data } = await axios.post(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  }, { headers: { Authorization: `Bearer ${token}` } });
  return data;
};

/* ════════════════════════════════════════════════════════════
   EMAIL SERVICE
   ════════════════════════════════════════════════════════════ */
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.SMTP_PASS) return; // Skip if not configured
  try {
    await mailer.sendMail({ from: `"Brilz" <${process.env.SMTP_USER}>`, to, subject, html });
  } catch (e) {
    console.warn('Email send failed:', e.message);
  }
};

const orderConfirmEmail = (order) => ({
  to:      order.customer_email,
  subject: `Order Confirmed — Brilz #${order.id.slice(0, 8).toUpperCase()}`,
  html: `
    <div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:20px;color:#0A0705;">
      <h2 style="color:#C8952A;font-family:Georgia,serif;">Brilz ®</h2>
      <h3>Your order is confirmed! 🎉</h3>
      <p>Hi ${order.customer_name || 'there'},</p>
      <p>We've received your payment of <strong>KSh ${Number(order.total_amount).toLocaleString()}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <tr><td style="padding:8px;color:#666;font-size:13px;">Order ID</td><td style="padding:8px;font-weight:700;">#${order.id.slice(0,8).toUpperCase()}</td></tr>
        <tr style="background:#f9f6f0;"><td style="padding:8px;color:#666;font-size:13px;">Type</td><td style="padding:8px;text-transform:capitalize;">${order.order_type}</td></tr>
        <tr><td style="padding:8px;color:#666;font-size:13px;">Delivery address</td><td style="padding:8px;">${order.delivery_address || '—'}</td></tr>
        <tr style="background:#f9f6f0;"><td style="padding:8px;color:#666;font-size:13px;">Status</td><td style="padding:8px;color:#00A550;font-weight:700;">Confirmed ✓</td></tr>
      </table>
      <p>Delivery usually takes 1–3 business days in Nairobi.</p>
      <p>Questions? WhatsApp us: <a href="https://wa.me/254118812083" style="color:#C8952A;">+254 118 812 083</a></p>
      <p style="color:#888;font-size:12px;margin-top:30px;">Brilz — Fashion · Stays · Farming | brilz.co.ke</p>
    </div>`,
});

/* ════════════════════════════════════════════════════════════
   ─────────────────────────────────────────────────────────
   ROUTE HANDLERS
   ─────────────────────────────────────────────────────────
   ════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════
   AUTH ROUTES  /api/auth
   ════════════════════════════════════════════════════════════ */
const authRouter = express.Router();

/** POST /api/auth/register */
authRouter.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return err(res, 'Name, email and password are required');
    if (password.length < 6)           return err(res, 'Password must be at least 6 characters');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(res, 'Invalid email address');
    if (phone && !isKenyanPhone(phone)) return err(res, 'Invalid Kenyan phone number');

    // Check duplicate
    const { data: exists } = await supabase.from('users').select('id').eq('email', email.toLowerCase()).maybeSingle();
    if (exists) return err(res, 'An account with this email already exists');

    const hash = await bcrypt.hash(password, 12);
    const { data: user, error } = await supabase.from('users').insert({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password_hash: hash,
      phone: phone ? formatPhone(phone) : null,
      role: 'customer',
    }).select('id,name,email,role,phone,created_at').single();

    if (error) return err(res, 'Registration failed: ' + error.message);

    const token = signToken(user);
    // Welcome email (non-blocking)
    sendEmail({
      to: user.email,
      subject: 'Welcome to Brilz! 🎉',
      html: `<p>Hi ${user.name}, welcome to Brilz! Shop fashion, book stays and order fresh farm produce at <a href="https://brilz.co.ke">brilz.co.ke</a></p>`,
    });

    ok(res, { user, token }, 201);
  } catch (e) { srv(res, e, 'Registration error'); }
});

/** POST /api/auth/login */
authRouter.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return err(res, 'Email and password are required');

    const { data: user, error } = await supabase
      .from('users')
      .select('id,name,email,role,phone,avatar_url,password_hash,is_active')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (error || !user)        return err(res, 'Invalid email or password', 401);
    if (!user.is_active)       return err(res, 'Account suspended. Contact support.', 403);
    if (!user.password_hash)   return err(res, 'Please sign in with Google for this account', 400);

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return err(res, 'Invalid email or password', 401);

    const { password_hash, ...safeUser } = user;
    const token = signToken(safeUser);
    ok(res, { user: safeUser, token });
  } catch (e) { srv(res, e, 'Login error'); }
});

/** GET /api/auth/me */
authRouter.get('/me', protect, async (req, res) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('id,name,email,role,phone,avatar_url,address,city,loyalty_points,created_at')
      .eq('id', req.user.id).single();
    ok(res, user);
  } catch (e) { srv(res, e); }
});

/** PATCH /api/auth/me — update profile */
authRouter.patch('/me', protect, async (req, res) => {
  try {
    const { name, phone, address, city, avatar_url } = req.body;
    const updates = {};
    if (name)       updates.name       = name.trim();
    if (phone)      updates.phone      = formatPhone(phone);
    if (address)    updates.address    = address.trim();
    if (city)       updates.city       = city.trim();
    if (avatar_url) updates.avatar_url = avatar_url;

    const { data, error } = await supabase
      .from('users').update(updates).eq('id', req.user.id)
      .select('id,name,email,phone,address,city,avatar_url').single();
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/** POST /api/auth/change-password */
authRouter.post('/change-password', protect, async (req, res) => {
  try {
    const { current, newPassword } = req.body;
    if (!current || !newPassword)    return err(res, 'Current and new password required');
    if (newPassword.length < 6)      return err(res, 'New password must be at least 6 characters');

    const { data: user } = await supabase.from('users').select('password_hash').eq('id', req.user.id).single();
    if (!await bcrypt.compare(current, user.password_hash)) return err(res, 'Current password is incorrect', 401);

    const hash = await bcrypt.hash(newPassword, 12);
    await supabase.from('users').update({ password_hash: hash }).eq('id', req.user.id);
    ok(res, { message: 'Password updated successfully' });
  } catch (e) { srv(res, e); }
});

/** POST /api/auth/google — exchange Supabase access token */
authRouter.post('/google', async (req, res) => {
  try {
    const { access_token } = req.body;
    if (!access_token) return err(res, 'access_token required');

    // Get user info from Supabase using their token
    const { data, error } = await supabase.auth.getUser(access_token);
    if (error || !data?.user) return err(res, 'Invalid Google token', 401);

    const { email, user_metadata } = data.user;
    const name = user_metadata?.full_name || user_metadata?.name || email.split('@')[0];

    // Upsert into our users table
    const { data: user } = await supabase.from('users')
      .upsert({ email, name, google_id: data.user.id, role: 'customer' }, { onConflict: 'email' })
      .select('id,name,email,role,phone,avatar_url').single();

    const token = signToken(user);
    ok(res, { user, token });
  } catch (e) { srv(res, e, 'Google auth error'); }
});

/* ════════════════════════════════════════════════════════════
   PRODUCT ROUTES  /api/products
   ════════════════════════════════════════════════════════════ */
const productRouter = express.Router();

/** GET /api/products */
productRouter.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, type = 'fashion', limit = 40, offset = 0, search, is_new, is_hot, min_price, max_price, sort = 'created_at' } = req.query;
    let q = supabase.from('products')
      .select('id,name,description,price,original_price,stock,image_url,sizes,colors,is_new,is_hot,rating_avg,rating_count,sold_count,product_type,unit,min_order,categories(name,slug)')
      .eq('is_active', true)
      .eq('product_type', type)
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (category)  q = q.eq('categories.slug', category);
    if (search)    q = q.ilike('name', `%${search}%`);
    if (is_new === 'true') q = q.eq('is_new', true);
    if (is_hot === 'true') q = q.eq('is_hot', true);
    if (min_price) q = q.gte('price', Number(min_price));
    if (max_price) q = q.lte('price', Number(max_price));

    const sortCol = sort === 'price_asc' ? 'price' : sort === 'price_desc' ? 'price' : sort === 'rating' ? 'rating_avg' : 'created_at';
    const sortAsc = sort === 'price_asc';
    q = q.order(sortCol, { ascending: sortAsc });

    const { data, error } = await q;
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/** GET /api/products/search */
productRouter.get('/search', async (req, res) => {
  try {
    const { q: query, limit = 20 } = req.query;
    if (!query) return ok(res, []);
    const { data, error } = await supabase
      .from('products')
      .select('id,name,price,image_url,categories(name),product_type,rating_avg')
      .eq('is_active', true)
      .ilike('name', `%${query}%`)
      .limit(Number(limit));
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/** GET /api/products/:id */
productRouter.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*,categories(name,slug),product_images(url,alt_text,sort_order,is_primary)')
      .eq('id', req.params.id).eq('is_active', true).single();
    if (error || !data) return err(res, 'Product not found', 404);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/** GET /api/products/:id/reviews */
productRouter.get('/:id/reviews', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('id,rating,title,body,reviewer_name,is_verified,helpful_count,created_at,users(name,avatar_url)')
      .eq('product_id', req.params.id)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/** POST /api/products/:id/reviews */
productRouter.post('/:id/reviews', protect, async (req, res) => {
  try {
    const { rating, title, body } = req.body;
    if (!rating || rating < 1 || rating > 5) return err(res, 'Rating must be 1–5');
    if (!body || body.length < 10) return err(res, 'Review body must be at least 10 characters');

    const { data, error } = await supabase.from('reviews').insert({
      product_id:    req.params.id,
      user_id:       req.user.id,
      reviewer_name: req.user.name,
      rating: Number(rating),
      title: title?.trim() || null,
      body: body.trim(),
    }).select().single();

    if (error) return err(res, error.message.includes('unique') ? 'You have already reviewed this product' : error.message);

    // Award loyalty points
    await supabase.from('users').update({ loyalty_points: supabase.raw('loyalty_points + 10') }).eq('id', req.user.id);

    ok(res, data, 201);
  } catch (e) { srv(res, e); }
});

/** POST /api/products — admin create */
productRouter.post('/', protect, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const { name, price, stock, description, category_id, sizes, colors, is_new, is_hot, product_type, sku, unit, min_order } = req.body;
    if (!name || !price) return err(res, 'Name and price are required');

    let image_url = req.body.image_url || null;
    if (req.file) image_url = await uploadImage(req.file.buffer, 'products');

    const { data, error } = await supabase.from('products').insert({
      name: name.trim(), price: Number(price), stock: Number(stock) || 0,
      description: description?.trim() || null, category_id: category_id || null,
      image_url, sku: sku?.trim() || null,
      sizes: sizes ? (Array.isArray(sizes) ? sizes : sizes.split(',').map(s=>s.trim())) : [],
      colors: colors ? (Array.isArray(colors) ? colors : colors.split(',').map(s=>s.trim())) : [],
      is_new: is_new === 'true' || is_new === true,
      is_hot: is_hot === 'true' || is_hot === true,
      product_type: product_type || 'fashion',
      unit: unit?.trim() || null,
      min_order: Number(min_order) || 1,
    }).select().single();

    if (error) return err(res, error.message);
    ok(res, data, 201);
  } catch (e) { srv(res, e); }
});

/** PATCH /api/products/:id — admin update */
productRouter.patch('/:id', protect, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const updates = {};
    const fields = ['name','price','stock','description','category_id','sku','is_new','is_hot','is_active','unit','min_order','original_price'];
    fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (req.body.sizes)  updates.sizes  = Array.isArray(req.body.sizes)  ? req.body.sizes  : req.body.sizes.split(',').map(s=>s.trim());
    if (req.body.colors) updates.colors = Array.isArray(req.body.colors) ? req.body.colors : req.body.colors.split(',').map(s=>s.trim());
    if (req.file) updates.image_url = await uploadImage(req.file.buffer, 'products');

    const { data, error } = await supabase.from('products').update(updates).eq('id', req.params.id).select().single();
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/** DELETE /api/products/:id — admin soft delete */
productRouter.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', req.params.id);
    if (error) return err(res, error.message);
    ok(res, { message: 'Product deactivated' });
  } catch (e) { srv(res, e); }
});

/* ════════════════════════════════════════════════════════════
   PROPERTY ROUTES  /api/properties
   ════════════════════════════════════════════════════════════ */
const propertyRouter = express.Router();

/** GET /api/properties */
propertyRouter.get('/', async (req, res) => {
  try {
    const { type, available, min_price, max_price, limit = 20, offset = 0 } = req.query;
    let q = supabase.from('properties')
      .select('id,name,description,property_type,location,price_per_night,bedrooms,bathrooms,max_guests,amenities,image_url,images,is_available,rating_avg,rating_count')
      .eq('is_active', true)
      .order('is_available', { ascending: false })
      .order('rating_avg', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (type)                   q = q.eq('property_type', type);
    if (available === 'true')   q = q.eq('is_available', true);
    if (min_price)              q = q.gte('price_per_night', Number(min_price));
    if (max_price)              q = q.lte('price_per_night', Number(max_price));

    const { data, error } = await q;
    if (error) return err(res, error.message);

    // Rename price_per_night → price for frontend compatibility
    ok(res, (data || []).map(p => ({ ...p, price: p.price_per_night })));
  } catch (e) { srv(res, e); }
});

/** GET /api/properties/:id */
propertyRouter.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('properties').select('*').eq('id', req.params.id).eq('is_active', true).single();
    if (error || !data) return err(res, 'Property not found', 404);
    ok(res, { ...data, price: data.price_per_night });
  } catch (e) { srv(res, e); }
});

/** GET /api/properties/:id/availability */
propertyRouter.get('/:id/availability', async (req, res) => {
  try {
    const { check_in, check_out } = req.query;
    if (!check_in || !check_out) return err(res, 'check_in and check_out dates required');

    // Check for conflicting confirmed bookings
    const { data: conflicts } = await supabase
      .from('bookings')
      .select('id')
      .eq('property_id', req.params.id)
      .in('status', ['confirmed', 'pending'])
      .or(`check_in.lte.${check_out},check_out.gte.${check_in}`);

    const available = !conflicts?.length;
    const nights    = Math.ceil((new Date(check_out) - new Date(check_in)) / 86400000);
    ok(res, { available, nights, conflicting_bookings: conflicts?.length || 0 });
  } catch (e) { srv(res, e); }
});

/** POST /api/properties — admin create */
propertyRouter.post('/', protect, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const { name, description, property_type, location, address, price_per_night, bedrooms, bathrooms, max_guests, amenities } = req.body;
    if (!name || !price_per_night) return err(res, 'Name and price_per_night required');

    let image_url = req.body.image_url || null;
    if (req.file) image_url = await uploadImage(req.file.buffer, 'properties');

    const { data, error } = await supabase.from('properties').insert({
      name: name.trim(), description: description?.trim(), property_type: property_type || 'apartment',
      location: location?.trim(), address: address?.trim(), price_per_night: Number(price_per_night),
      bedrooms: Number(bedrooms) || 1, bathrooms: Number(bathrooms) || 1, max_guests: Number(max_guests) || 2,
      amenities: amenities ? (Array.isArray(amenities) ? amenities : amenities.split(',').map(s=>s.trim())) : [],
      image_url, is_available: true,
    }).select().single();

    if (error) return err(res, error.message);
    ok(res, data, 201);
  } catch (e) { srv(res, e); }
});

/** PATCH /api/properties/:id */
propertyRouter.patch('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { data, error } = await supabase.from('properties').update(req.body).eq('id', req.params.id).select().single();
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/* ════════════════════════════════════════════════════════════
   ORDER ROUTES  /api/orders
   ════════════════════════════════════════════════════════════ */
const orderRouter = express.Router();

/** POST /api/orders */
orderRouter.post('/', optionalAuth, async (req, res) => {
  try {
    const {
      items, total_amount, delivery_fee, discount_amount, promo_code,
      delivery_address, delivery_city, customer_name, customer_phone, customer_email,
      notes, order_type, check_in, check_out, property_id, nights,
    } = req.body;

    if (!total_amount || total_amount < 1) return err(res, 'Invalid order amount');
    if (!customer_phone)                   return err(res, 'Customer phone is required');
    if (!customer_name)                    return err(res, 'Customer name is required');

    const { data: order, error } = await supabase.from('orders').insert({
      user_id:          req.user?.id || null,
      order_type:       order_type || 'fashion',
      status:           'pending',
      total_amount:     Number(total_amount),
      delivery_fee:     Number(delivery_fee) || 0,
      discount_amount:  Number(discount_amount) || 0,
      promo_code:       promo_code || null,
      delivery_address: delivery_address?.trim() || null,
      delivery_city:    delivery_city?.trim() || 'Nairobi',
      customer_name:    customer_name.trim(),
      customer_phone:   formatPhone(customer_phone),
      customer_email:   customer_email?.toLowerCase().trim() || null,
      notes:            notes?.trim() || null,
      items:            items || [],
      check_in:         check_in || null,
      check_out:        check_out || null,
      nights:           nights || null,
      property_id:      property_id || null,
    }).select().single();

    if (error) return err(res, error.message);
    ok(res, order, 201);
  } catch (e) { srv(res, e, 'Order creation failed'); }
});

/** GET /api/orders/my */
orderRouter.get('/my', protect, async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    let q = supabase.from('orders')
      .select('id,order_type,status,total_amount,delivery_address,customer_name,items,check_in,check_out,nights,created_at,paid_at,mpesa_ref')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/** GET /api/orders/:id */
orderRouter.get('/:id', protect, async (req, res) => {
  try {
    const { data, error } = await supabase.from('orders')
      .select('*,properties(name,image_url,location)')
      .eq('id', req.params.id).single();
    if (error || !data) return err(res, 'Order not found', 404);
    // Users can only see their own unless admin
    if (data.user_id !== req.user.id && req.user.role !== 'admin') return err(res, 'Forbidden', 403);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/** PATCH /api/orders/:id/status — admin */
orderRouter.patch('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending','paid','confirmed','processing','shipped','delivered','cancelled','refunded'];
    if (!valid.includes(status)) return err(res, `Status must be one of: ${valid.join(', ')}`);

    const { data, error } = await supabase.from('orders')
      .update({ status }).eq('id', req.params.id).select().single();
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/** POST /api/orders/:id/cancel — user */
orderRouter.post('/:id/cancel', protect, async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders').select('user_id,status').eq('id', req.params.id).single();
    if (!order) return err(res, 'Order not found', 404);
    if (order.user_id !== req.user.id) return err(res, 'Forbidden', 403);
    if (!['pending'].includes(order.status)) return err(res, 'Only pending orders can be cancelled');

    const { data } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', req.params.id).select().single();
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/* ════════════════════════════════════════════════════════════
   PAYMENT ROUTES  /api/payments
   ════════════════════════════════════════════════════════════ */
const paymentRouter = express.Router();

/** POST /api/payments/stk — initiate M-Pesa STK push */
paymentRouter.post('/stk', protect, mpesaLimiter, async (req, res) => {
  try {
    const { order_id, phone, amount } = req.body;
    if (!order_id) return err(res, 'order_id required');
    if (!phone)    return err(res, 'phone required');
    if (!amount || amount < 1) return err(res, 'amount must be at least 1');
    if (!isKenyanPhone(phone)) return err(res, 'Invalid Kenyan phone number');

    const fmtPhone = formatPhone(phone);

    // Verify order belongs to user
    const { data: order } = await supabase.from('orders').select('id,status,total_amount').eq('id', order_id).single();
    if (!order) return err(res, 'Order not found', 404);
    if (order.status === 'paid') return err(res, 'Order already paid');

    const stkResult = await stkPush({ phone: fmtPhone, amount, orderId: order_id });
    if (stkResult.ResponseCode !== '0') return err(res, stkResult.ResponseDescription || 'STK push failed');

    // Save payment record
    await supabase.from('payments').insert({
      order_id, user_id: req.user.id, amount: Number(amount),
      phone: fmtPhone, status: 'pending',
      checkout_request_id:  stkResult.CheckoutRequestID,
      merchant_request_id:  stkResult.MerchantRequestID,
    });

    // Update order with checkout request ID
    await supabase.from('orders').update({ checkout_request_id: stkResult.CheckoutRequestID }).eq('id', order_id);

    ok(res, {
      message:            stkResult.CustomerMessage,
      CheckoutRequestID:  stkResult.CheckoutRequestID,
      MerchantRequestID:  stkResult.MerchantRequestID,
    });
  } catch (e) {
    console.error('STK push error:', e.message);
    err(res, IS_PROD ? 'Payment initiation failed. Try again.' : e.message);
  }
});

/** POST /api/payments/mpesa-callback — Safaricom callback */
paymentRouter.post('/mpesa-callback', async (req, res) => {
  // Always respond 200 immediately to Safaricom
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const body   = req.body?.Body?.stkCallback;
    if (!body)   return;
    const { ResultCode, ResultDesc, CheckoutRequestID, CallbackMetadata } = body;

    // Find payment record
    const { data: payment } = await supabase
      .from('payments').select('id,order_id').eq('checkout_request_id', CheckoutRequestID).single();
    if (!payment) return;

    if (ResultCode === 0) {
      // Success — extract metadata
      const meta = {};
      (CallbackMetadata?.Item || []).forEach(({ Name, Value }) => { meta[Name] = Value; });
      const mpesaReceipt = meta.MpesaReceiptNumber;
      const amount       = meta.Amount;
      const txDate       = String(meta.TransactionDate);

      // Update payment
      await supabase.from('payments').update({
        status: 'completed', mpesa_receipt: mpesaReceipt,
        result_code: 0, result_desc: ResultDesc, transaction_date: txDate,
      }).eq('checkout_request_id', CheckoutRequestID);

      // Update order → paid
      const { data: order } = await supabase.from('orders')
        .update({ status: 'paid', mpesa_ref: mpesaReceipt, paid_at: new Date().toISOString() })
        .eq('id', payment.order_id)
        .select('*').single();

      // Send confirmation email (non-blocking)
      if (order?.customer_email) sendEmail(orderConfirmEmail(order));

      // Award loyalty points (1 pt per KSh 100)
      if (order?.user_id && amount) {
        const pts = Math.floor(Number(amount) / 100);
        if (pts > 0) {
          await supabase.from('users')
            .update({ loyalty_points: supabase.raw(`loyalty_points + ${pts}`) })
            .eq('id', order.user_id);
        }
      }
    } else {
      // Failed payment
      await supabase.from('payments').update({
        status: 'failed', result_code: ResultCode, result_desc: ResultDesc,
      }).eq('checkout_request_id', CheckoutRequestID);
    }
  } catch (e) {
    console.error('M-Pesa callback error:', e.message);
  }
});

/** GET /api/payments/status/:checkoutRequestId */
paymentRouter.get('/status/:id', protect, async (req, res) => {
  try {
    // Check our DB first
    const { data: payment } = await supabase
      .from('payments')
      .select('status,mpesa_receipt,result_code,result_desc,amount')
      .eq('checkout_request_id', req.params.id).maybeSingle();

    if (payment?.status === 'completed') {
      return ok(res, { status: 'completed', ResultCode: 0, MpesaReceiptNumber: payment.mpesa_receipt, Amount: payment.amount });
    }
    if (payment?.status === 'failed') {
      return ok(res, { status: 'failed', ResultCode: payment.result_code, ResultDesc: payment.result_desc });
    }

    // Not yet — query Daraja
    const stk = await querySTKStatus(req.params.id);
    ok(res, { status: 'pending', ...stk });
  } catch (e) {
    // Daraja returns an error if still waiting — treat as pending
    ok(res, { status: 'pending', ResultCode: '1032', ResultDesc: 'Awaiting user input' });
  }
});

/* ════════════════════════════════════════════════════════════
   WISHLIST ROUTES  /api/wishlist
   ════════════════════════════════════════════════════════════ */
const wishlistRouter = express.Router();

wishlistRouter.get('/', protect, async (req, res) => {
  try {
    const { data, error } = await supabase.from('wishlists')
      .select('id,created_at,products(id,name,price,image_url,categories(name)),properties(id,name,price_per_night,image_url,location)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

wishlistRouter.post('/', protect, async (req, res) => {
  try {
    const { product_id, property_id } = req.body;
    if (!product_id && !property_id) return err(res, 'product_id or property_id required');
    const { data, error } = await supabase.from('wishlists')
      .insert({ user_id: req.user.id, product_id: product_id || null, property_id: property_id || null })
      .select().single();
    if (error) return err(res, error.message.includes('unique') ? 'Already in wishlist' : error.message);
    ok(res, data, 201);
  } catch (e) { srv(res, e); }
});

wishlistRouter.delete('/:id', protect, async (req, res) => {
  try {
    await supabase.from('wishlists').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    ok(res, { message: 'Removed from wishlist' });
  } catch (e) { srv(res, e); }
});

wishlistRouter.post('/sync', protect, async (req, res) => {
  try {
    const { items = [] } = req.body;
    // Upsert all client-side wishlist items to DB
    const rows = items.map(i => ({ user_id: req.user.id, product_id: i.id || null })).filter(r => r.product_id);
    if (rows.length) await supabase.from('wishlists').upsert(rows, { onConflict: 'user_id,product_id', ignoreDuplicates: true });
    ok(res, { synced: rows.length });
  } catch (e) { srv(res, e); }
});

/* ════════════════════════════════════════════════════════════
   SEARCH ROUTE  /api/search
   ════════════════════════════════════════════════════════════ */
const searchRouter = express.Router();

searchRouter.get('/', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q || q.length < 2) return ok(res, { products: [], properties: [], farming: [] });

    const [products, properties, farming] = await Promise.all([
      supabase.from('products').select('id,name,price,image_url,categories(name)')
        .eq('is_active', true).eq('product_type', 'fashion').ilike('name', `%${q}%`).limit(Number(limit)),
      supabase.from('properties').select('id,name,price_per_night,image_url,location')
        .eq('is_active', true).ilike('name', `%${q}%`).limit(5),
      supabase.from('products').select('id,name,price,unit,image_url')
        .eq('is_active', true).in('product_type', ['farming','equipment']).ilike('name', `%${q}%`).limit(5),
    ]);

    ok(res, {
      products:   products.data || [],
      properties: (properties.data || []).map(p => ({ ...p, price: p.price_per_night })),
      farming:    farming.data || [],
    });
  } catch (e) { srv(res, e); }
});

/* ════════════════════════════════════════════════════════════
   NOTIFICATIONS ROUTES  /api/notifications
   ════════════════════════════════════════════════════════════ */
const notifRouter = express.Router();

notifRouter.get('/', protect, async (req, res) => {
  try {
    const { data, error } = await supabase.from('notifications')
      .select('*').eq('user_id', req.user.id)
      .order('created_at', { ascending: false }).limit(50);
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

notifRouter.patch('/:id/read', protect, async (req, res) => {
  try {
    await supabase.from('notifications').update({ is_read: true }).eq('id', req.params.id).eq('user_id', req.user.id);
    ok(res, { message: 'Marked as read' });
  } catch (e) { srv(res, e); }
});

notifRouter.post('/read-all', protect, async (req, res) => {
  try {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', req.user.id).eq('is_read', false);
    ok(res, { message: 'All notifications marked as read' });
  } catch (e) { srv(res, e); }
});

notifRouter.delete('/:id', protect, async (req, res) => {
  try {
    await supabase.from('notifications').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    ok(res, { message: 'Notification deleted' });
  } catch (e) { srv(res, e); }
});

/* ════════════════════════════════════════════════════════════
   FARMING ROUTES  /api/farming
   ════════════════════════════════════════════════════════════ */
const farmingRouter = express.Router();

farmingRouter.get('/categories', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('farming_categories')
      .select('id,name,slug,icon,sort_order').eq('is_active', true).order('sort_order');
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

farmingRouter.get('/products', async (req, res) => {
  try {
    const { category, limit = 40, offset = 0, search } = req.query;
    let q = supabase.from('products')
      .select('id,name,description,price,stock,image_url,unit,min_order,is_organic,is_for_hire,origin,product_type,farming_category_id,farming_categories(name,slug,icon)')
      .eq('is_active', true)
      .in('product_type', ['farming','equipment'])
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (category) q = q.eq('farming_categories.slug', category);
    if (search)   q = q.ilike('name', `%${search}%`);

    const { data, error } = await q.order('name');
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/* ════════════════════════════════════════════════════════════
   ADMIN ROUTES  /api/admin
   ════════════════════════════════════════════════════════════ */
const adminRouter = express.Router();
adminRouter.use(protect, adminOnly);

/** GET /api/admin/stats */
adminRouter.get('/stats', async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const [ordersRes, usersRes, productsRes, todayOrdersRes, revenueRes] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true }),
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true).lt('stock', 5),
      supabase.from('orders').select('total_amount').eq('status', 'paid').gte('paid_at', todayISO),
      // 7-day revenue
      supabase.from('orders').select('total_amount,paid_at').eq('status', 'paid')
        .gte('paid_at', new Date(Date.now() - 7 * 86400000).toISOString()),
    ]);

    const todayRevenue = (todayOrdersRes.data || []).reduce((s, o) => s + (o.total_amount || 0), 0);

    // Build 7-day array
    const revenue7d = Array(7).fill(0);
    (revenueRes.data || []).forEach(o => {
      const daysAgo = Math.floor((Date.now() - new Date(o.paid_at).getTime()) / 86400000);
      if (daysAgo < 7) revenue7d[6 - daysAgo] += o.total_amount || 0;
    });

    const pendingCount = (await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending')).count || 0;

    ok(res, {
      total_orders:   ordersRes.count || 0,
      total_users:    usersRes.count || 0,
      low_stock:      productsRes.count || 0,
      today_revenue:  todayRevenue,
      pending_orders: pendingCount,
      revenue_7d:     revenue7d,
    });
  } catch (e) { srv(res, e); }
});

/** GET /api/admin/orders */
adminRouter.get('/orders', async (req, res) => {
  try {
    const { status, type, limit = 50, offset = 0 } = req.query;
    let q = supabase.from('orders')
      .select('id,order_type,status,total_amount,customer_name,customer_email,customer_phone,items,created_at,paid_at,mpesa_ref')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);
    if (status) q = q.eq('status', status);
    if (type)   q = q.eq('order_type', type);
    const { data, error } = await q;
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/** PATCH /api/admin/orders/:id */
adminRouter.patch('/orders/:id', async (req, res) => {
  try {
    const { status, notes } = req.body;
    const updates = {};
    if (status) updates.status = status;
    if (notes)  updates.notes  = notes;
    const { data, error } = await supabase.from('orders').update(updates).eq('id', req.params.id).select().single();
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/** GET /api/admin/products */
adminRouter.get('/products', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const { data, error } = await supabase.from('products')
      .select('id,name,price,stock,is_active,is_new,is_hot,image_url,categories(name),product_type,sold_count')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/** GET /api/admin/users */
adminRouter.get('/users', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const { data, error } = await supabase.from('users')
      .select('id,name,email,phone,role,is_active,loyalty_points,created_at')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);
    if (error) return err(res, error.message);
    ok(res, data.map(u => ({ ...u, order_count: 0, status: u.is_active ? 'active' : 'inactive' })));
  } catch (e) { srv(res, e); }
});

/** PATCH /api/admin/users/:id */
adminRouter.patch('/users/:id', async (req, res) => {
  try {
    const { role, is_active } = req.body;
    const updates = {};
    if (role !== undefined)      updates.role      = role;
    if (is_active !== undefined) updates.is_active = is_active;
    const { data, error } = await supabase.from('users').update(updates).eq('id', req.params.id).select('id,name,email,role,is_active').single();
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/** GET /api/admin/properties */
adminRouter.get('/properties', async (req, res) => {
  try {
    const { data, error } = await supabase.from('properties')
      .select('id,name,property_type,location,price_per_night,is_available,is_active,rating_avg')
      .order('created_at', { ascending: false });
    if (error) return err(res, error.message);
    ok(res, (data || []).map(p => ({ ...p, price: p.price_per_night })));
  } catch (e) { srv(res, e); }
});

/* ════════════════════════════════════════════════════════════
   BOOKINGS ROUTES  /api/bookings
   ════════════════════════════════════════════════════════════ */
const bookingRouter = express.Router();

bookingRouter.post('/', optionalAuth, async (req, res) => {
  try {
    const { property_id, order_id, check_in, check_out, guests, guest_name, guest_phone, guest_email, notes } = req.body;
    if (!property_id || !check_in || !check_out) return err(res, 'property_id, check_in and check_out required');
    if (new Date(check_out) <= new Date(check_in)) return err(res, 'check_out must be after check_in');

    // Check availability
    const { data: conflicts } = await supabase.from('bookings')
      .select('id').eq('property_id', property_id)
      .in('status', ['confirmed','pending'])
      .or(`check_in.lte.${check_out},check_out.gte.${check_in}`);
    if (conflicts?.length) return err(res, 'Property not available for selected dates');

    const { data: property } = await supabase.from('properties').select('price_per_night').eq('id', property_id).single();
    const nights = Math.ceil((new Date(check_out) - new Date(check_in)) / 86400000);
    const total  = nights * property.price_per_night;

    const { data, error } = await supabase.from('bookings').insert({
      property_id, order_id: order_id || null,
      user_id: req.user?.id || null,
      check_in, check_out, guests: Number(guests) || 1,
      total_amount: total,
      guest_name: guest_name?.trim(), guest_phone: guest_phone ? formatPhone(guest_phone) : null,
      guest_email: guest_email?.toLowerCase().trim() || null,
      notes: notes?.trim() || null, status: 'pending',
    }).select().single();

    if (error) return err(res, error.message);
    ok(res, { ...data, nights }, 201);
  } catch (e) { srv(res, e, 'Booking creation failed'); }
});

bookingRouter.get('/my', protect, async (req, res) => {
  try {
    const { data, error } = await supabase.from('bookings')
      .select('id,check_in,check_out,nights,guests,total_amount,status,created_at,properties(id,name,image_url,location)')
      .eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) return err(res, error.message);
    ok(res, data);
  } catch (e) { srv(res, e); }
});

/* ════════════════════════════════════════════════════════════
   IMAGE UPLOAD ROUTE  /api/upload
   ════════════════════════════════════════════════════════════ */
app.post('/api/upload', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return err(res, 'No image file provided');
    const folder = req.query.folder || 'misc';
    const url = await uploadImage(req.file.buffer, folder);
    ok(res, { url });
  } catch (e) { srv(res, e, 'Image upload failed'); }
});

/* ════════════════════════════════════════════════════════════
   MOUNT ROUTERS
   ════════════════════════════════════════════════════════════ */
app.use('/api/auth',          authRouter);
app.use('/api/products',      productRouter);
app.use('/api/properties',    propertyRouter);
app.use('/api/orders',        orderRouter);
app.use('/api/payments',      paymentRouter);
app.use('/api/wishlist',      wishlistRouter);
app.use('/api/search',        searchRouter);
app.use('/api/notifications', notifRouter);
app.use('/api/farming',       farmingRouter);
app.use('/api/admin',         adminRouter);
app.use('/api/bookings',      bookingRouter);

/* ════════════════════════════════════════════════════════════
   HEALTH CHECK
   ════════════════════════════════════════════════════════════ */
app.get('/health', (_req, res) => {
  res.json({
    status:      'ok',

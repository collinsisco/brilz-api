const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const supabase = require('../config/supabase');
const { isValidEmail, isValidKenyanPhone } = require('../utils/validators');

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });

const register = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address' });
    if (password.length < 8)  return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (phone && !isValidKenyanPhone(phone)) return res.status(400).json({ error: 'Invalid Kenyan phone number' });

    const { data: existing } = await supabase.from('users').select('id').eq('email', email).single();
    if (existing) return res.status(409).json({ error: 'Email already registered. Please log in.' });

    const hash = await bcrypt.hash(password, 12);
    const { data: user, error } = await supabase.from('users')
      .insert({ name: name.trim(), email: email.toLowerCase().trim(), password_hash: hash, phone: phone||null })
      .select('id,name,email,role,phone,created_at').single();
    if (error) return res.status(500).json({ error: error.message });

    res.status(201).json({ token: signToken(user.id), user });
  } catch (e) { next(e); }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const { data: user, error } = await supabase.from('users')
      .select('id,name,email,role,phone,password_hash,is_active,avatar_url').eq('email', email.toLowerCase().trim()).single();
    if (error || !user) return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.is_active)  return res.status(403).json({ error: 'Account suspended. Contact support.' });
    if (!user.password_hash) return res.status(401).json({ error: 'Please use Google Sign-In for this account' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const { password_hash, ...safeUser } = user;
    res.json({ token: signToken(user.id), user: safeUser });
  } catch (e) { next(e); }
};

const getMe = async (req, res, next) => {
  try {
    const { data: user, error } = await supabase.from('users')
      .select('id,name,email,role,phone,avatar_url,address,city,loyalty_points,created_at').eq('id', req.user.id).single();
    if (error) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) { next(e); }
};

const updateMe = async (req, res, next) => {
  try {
    const { name, phone, address, city, avatar_url } = req.body;
    const updates = {};
    if (name)       updates.name = name.trim();
    if (phone)      updates.phone = phone;
    if (address)    updates.address = address;
    if (city)       updates.city = city;
    if (avatar_url) updates.avatar_url = avatar_url;
    const { data, error } = await supabase.from('users').update(updates).eq('id', req.user.id)
      .select('id,name,email,phone,avatar_url,address,city').single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { next(e); }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    const { data: user } = await supabase.from('users').select('password_hash').eq('id', req.user.id).single();
    if (!await bcrypt.compare(currentPassword, user.password_hash))
      return res.status(401).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 12);
    await supabase.from('users').update({ password_hash: hash }).eq('id', req.user.id);
    res.json({ message: 'Password updated successfully' });
  } catch (e) { next(e); }
};

module.exports = { register, login, getMe, updateMe, changePassword };

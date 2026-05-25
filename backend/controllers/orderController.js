const supabase = require('../config/supabase');

const createOrder = async (req, res, next) => {
  try {
    const { items, order_type, delivery_address, delivery_city, customer_name, customer_email, customer_phone, notes, promo_code, property_id, check_in, check_out } = req.body;
    if (!items?.length && order_type !== 'accommodation') return res.status(400).json({ error: 'Order items required' });

    const subtotal = (items||[]).reduce((s, i) => s + (i.price * i.quantity), 0);
    const delivery_fee = order_type === 'accommodation' ? 0 : (subtotal >= 10000 ? 0 : 500);
    let discount = 0;
    const CODES = { BRILZ10: 0.10, WELCOME20: 0.20, NAIROBI15: 0.15 };
    if (promo_code && CODES[promo_code.toUpperCase()]) discount = subtotal * CODES[promo_code.toUpperCase()];
    const total_amount = subtotal + delivery_fee - discount;

    const { data, error } = await supabase.from('orders').insert({
      user_id: req.user?.id||null, order_type: order_type||'fashion',
      items: JSON.stringify(items||[]), total_amount, delivery_fee, discount_amount: discount,
      promo_code: promo_code||null, delivery_address, delivery_city,
      customer_name: customer_name || req.user?.name,
      customer_email: customer_email || req.user?.email,
      customer_phone: customer_phone || req.user?.phone,
      notes, property_id: property_id||null, check_in: check_in||null, check_out: check_out||null,
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) { next(e); }
};

const getMyOrders = async (req, res, next) => {
  try {
    const { status } = req.query;
    let q = supabase.from('orders').select('*').eq('user_id', req.user.id).order('created_at', {ascending:false});
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { next(e); }
};

const getOrder = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Order not found' });
    if (data.user_id && data.user_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Forbidden' });
    res.json(data);
  } catch (e) { next(e); }
};

const updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const ALLOWED = ['pending','paid','confirmed','processing','shipped','delivered','cancelled'];
    if (!ALLOWED.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const { data, error } = await supabase.from('orders').update({ status }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { next(e); }
};

const cancelOrder = async (req, res, next) => {
  try {
    const { data } = await supabase.from('orders').select('status,user_id').eq('id', req.params.id).single();
    if (!data) return res.status(404).json({ error: 'Order not found' });
    if (data.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    if (!['pending','confirmed'].includes(data.status)) return res.status(400).json({ error: 'Order cannot be cancelled' });
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', req.params.id);
    res.json({ message: 'Order cancelled successfully' });
  } catch (e) { next(e); }
};

const getAllOrders = async (req, res, next) => {
  try {
    const { status, type, page=1, limit=20 } = req.query;
    let q = supabase.from('orders').select('*', {count:'exact'}).order('created_at', {ascending:false});
    if (status) q = q.eq('status', status);
    if (type)   q = q.eq('order_type', type);
    q = q.range((page-1)*limit, page*limit-1);
    const { data, error, count } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data, total: count, page: Number(page), pages: Math.ceil(count/limit) });
  } catch (e) { next(e); }
};

module.exports = { createOrder, getMyOrders, getOrder, updateStatus, cancelOrder, getAllOrders };

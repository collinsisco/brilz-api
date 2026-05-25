const supabase = require('../config/supabase');

const getAllProperties = async (req, res, next) => {
  try {
    const { location, type, min_price, max_price, guests, page=1, limit=20 } = req.query;
    let q = supabase.from('properties').select('*', {count:'exact'}).eq('is_active', true);
    if (location)  q = q.ilike('location', `%${location}%`);
    if (type)      q = q.eq('property_type', type);
    if (min_price) q = q.gte('price_per_night', Number(min_price));
    if (max_price) q = q.lte('price_per_night', Number(max_price));
    if (guests)    q = q.gte('max_guests', Number(guests));
    q = q.order('created_at', {ascending:false}).range((page-1)*limit, page*limit-1);
    const { data, error, count } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data, total: count, page: Number(page), pages: Math.ceil(count/limit) });
  } catch (e) { next(e); }
};

const getProperty = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('properties').select(`
      *, reviews(id,rating,body,reviewer_name,created_at)
    `).eq('id', req.params.id).eq('is_active', true).single();
    if (error || !data) return res.status(404).json({ error: 'Property not found' });
    res.json(data);
  } catch (e) { next(e); }
};

const checkAvailability = async (req, res, next) => {
  try {
    const { check_in, check_out } = req.query;
    if (!check_in || !check_out) return res.status(400).json({ error: 'check_in and check_out required' });
    const { data } = await supabase.from('bookings')
      .select('id')
      .eq('property_id', req.params.id)
      .in('status', ['confirmed','pending'])
      .or(`check_in.lte.${check_out},check_out.gte.${check_in}`);
    res.json({ available: !data?.length, conflicting_bookings: data?.length || 0 });
  } catch (e) { next(e); }
};

const createBooking = async (req, res, next) => {
  try {
    const { property_id, check_in, check_out, guests, notes } = req.body;
    if (!property_id || !check_in || !check_out) return res.status(400).json({ error: 'property_id, check_in, check_out required' });
    const { data: prop } = await supabase.from('properties').select('price_per_night,name,max_guests,is_available').eq('id', property_id).single();
    if (!prop || !prop.is_available) return res.status(400).json({ error: 'Property not available' });
    if (guests > prop.max_guests) return res.status(400).json({ error: `Max ${prop.max_guests} guests allowed` });
    const nights = Math.ceil((new Date(check_out) - new Date(check_in)) / 86400000);
    if (nights < 1) return res.status(400).json({ error: 'Check-out must be after check-in' });
    const total = nights * prop.price_per_night + 500; // + cleaning fee
    const { data, error } = await supabase.from('bookings').insert({
      property_id, user_id: req.user?.id||null, check_in, check_out,
      guests: guests||1, total_amount: total, notes,
      guest_name: req.user?.name, guest_phone: req.user?.phone, guest_email: req.user?.email,
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ ...data, property_name: prop.name });
  } catch (e) { next(e); }
};

const getMyBookings = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('bookings')
      .select('*, properties(name,location,image_url,price_per_night)')
      .eq('user_id', req.user.id).order('check_in', {ascending:false});
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { next(e); }
};

module.exports = { getAllProperties, getProperty, checkAvailability, createBooking, getMyBookings };

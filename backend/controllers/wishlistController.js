const supabase = require('../config/supabase');

const getWishlist = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('wishlists')
      .select('*, products(id,name,price,image_url,stock), properties(id,name,price_per_night,image_url)')
      .eq('user_id', req.user.id).order('created_at', {ascending:false});
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { next(e); }
};

const addToWishlist = async (req, res, next) => {
  try {
    const { product_id, property_id } = req.body;
    if (!product_id && !property_id) return res.status(400).json({ error: 'product_id or property_id required' });
    const { data, error } = await supabase.from('wishlists')
      .upsert({ user_id: req.user.id, product_id: product_id||null, property_id: property_id||null }, { onConflict: 'user_id,product_id' })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) { next(e); }
};

const removeFromWishlist = async (req, res, next) => {
  try {
    await supabase.from('wishlists').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ message: 'Removed from wishlist' });
  } catch (e) { next(e); }
};

const syncWishlist = async (req, res, next) => {
  try {
    const { items } = req.body; // array of product_ids
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });
    const rows = items.map(id => ({ user_id: req.user.id, product_id: id }));
    if (rows.length) await supabase.from('wishlists').upsert(rows, { onConflict: 'user_id,product_id', ignoreDuplicates: true });
    res.json({ synced: rows.length });
  } catch (e) { next(e); }
};

module.exports = { getWishlist, addToWishlist, removeFromWishlist, syncWishlist };

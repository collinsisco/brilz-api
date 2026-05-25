const supabase = require('../config/supabase');

const getBanners = async (req, res, next) => {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('banners').select('*').eq('is_active', true)
      .or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gte.${now}`)
      .order('sort_order');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { next(e); }
};

const createBanner = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('banners').insert(req.body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) { next(e); }
};

const updateBanner = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('banners').update(req.body).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { next(e); }
};

const deleteBanner = async (req, res, next) => {
  try {
    await supabase.from('banners').delete().eq('id', req.params.id);
    res.json({ message: 'Banner deleted' });
  } catch (e) { next(e); }
};

module.exports = { getBanners, createBanner, updateBanner, deleteBanner };

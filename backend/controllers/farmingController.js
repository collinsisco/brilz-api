const supabase = require('../config/supabase');

const getFarmingProducts = async (req, res, next) => {
  try {
    const { category, organic, hire, search, sort='created_at', order='desc', page=1, limit=20 } = req.query;
    let q = supabase.from('products').select('*, farming_categories(name,slug,icon)', {count:'exact'})
      .eq('is_active', true).in('product_type', ['farming','equipment']);
    if (category) q = q.eq('farming_category_id', category);
    if (organic)  q = q.eq('is_organic', organic === 'true');
    if (hire)     q = q.eq('is_for_hire', hire === 'true');
    if (search)   q = q.ilike('name', `%${search}%`);
    q = q.order(sort, {ascending: order==='asc'}).range((page-1)*limit, page*limit-1);
    const { data, error, count } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data, total: count });
  } catch (e) { next(e); }
};

const getFarmingCategories = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('farming_categories').select('*').eq('is_active', true).order('sort_order');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { next(e); }
};

const getFarmingProduct = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('products').select('*, farming_categories(name,slug), product_images(*), reviews(*)')
      .eq('id', req.params.id).in('product_type', ['farming','equipment']).single();
    if (error || !data) return res.status(404).json({ error: 'Product not found' });
    res.json(data);
  } catch (e) { next(e); }
};

module.exports = { getFarmingProducts, getFarmingCategories, getFarmingProduct };

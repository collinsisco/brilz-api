const supabase = require('../config/supabase');
const { uploadImage } = require('../services/uploadService');

const getAllProducts = async (req, res, next) => {
  try {
    const { category, type, search, min_price, max_price, sort = 'created_at', order = 'desc', page = 1, limit = 20 } = req.query;
    let query = supabase.from('products').select('*', { count: 'exact' }).eq('is_active', true);
    if (category)  query = query.eq('category_id', category);
    if (type)      query = query.eq('product_type', type);
    if (min_price) query = query.gte('price', Number(min_price));
    if (max_price) query = query.lte('price', Number(max_price));
    if (search)    query = query.ilike('name', `%${search}%`);
    query = query.order(sort, { ascending: order === 'asc' })
                 .range((page-1)*limit, page*limit - 1);
    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data, total: count, page: Number(page), pages: Math.ceil(count/limit) });
  } catch (e) { next(e); }
};

const getProduct = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('products').select(`
      *, categories(name,slug),
      product_images(url,alt_text,sort_order,is_primary),
      reviews(id,rating,title,body,reviewer_name,created_at,is_verified)
    `).eq('id', req.params.id).eq('is_active', true).single();
    if (error || !data) return res.status(404).json({ error: 'Product not found' });
    res.json(data);
  } catch (e) { next(e); }
};

const createProduct = async (req, res, next) => {
  try {
    const { name, description, price, stock, category_id, sizes, colors, product_type, unit, min_order } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Name and price are required' });
    let image_url = null;
    if (req.file) image_url = await uploadImage(req.file.buffer, req.file.originalname, 'products');
    const { data, error } = await supabase.from('products').insert({
      name, description, price: Number(price), stock: Number(stock)||0,
      category_id: category_id||null, image_url, sizes: sizes||null,
      colors: colors||null, product_type: product_type||'fashion',
      unit: unit||null, min_order: Number(min_order)||1,
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) { next(e); }
};

const updateProduct = async (req, res, next) => {
  try {
    const updates = { ...req.body };
    if (req.file) updates.image_url = await uploadImage(req.file.buffer, req.file.originalname, 'products');
    const { data, error } = await supabase.from('products').update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { next(e); }
};

const deleteProduct = async (req, res, next) => {
  try {
    await supabase.from('products').update({ is_active: false }).eq('id', req.params.id);
    res.json({ message: 'Product deactivated' });
  } catch (e) { next(e); }
};

const getProductReviews = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('reviews').select('*')
      .eq('product_id', req.params.id).eq('is_approved', true).order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { next(e); }
};

module.exports = { getAllProducts, getProduct, createProduct, updateProduct, deleteProduct, getProductReviews };

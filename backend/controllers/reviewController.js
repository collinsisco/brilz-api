const supabase = require('../config/supabase');

const addReview = async (req, res, next) => {
  try {
    const { product_id, property_id, rating, title, body, reviewer_name } = req.body;
    if (!rating || !body) return res.status(400).json({ error: 'Rating and body are required' });
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
    const { data, error } = await supabase.from('reviews').insert({
      user_id: req.user?.id||null,
      product_id: product_id||req.params.productId||null,
      property_id: property_id||null,
      rating, title, body,
      reviewer_name: reviewer_name || req.user?.name || 'Anonymous',
      is_verified: !!req.user?.id,
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) { next(e); }
};

const getProductReviews = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('reviews').select('*')
      .eq('product_id', req.params.productId).eq('is_approved', true).order('created_at', {ascending:false});
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { next(e); }
};

const deleteReview = async (req, res, next) => {
  try {
    await supabase.from('reviews').delete().eq('id', req.params.id);
    res.json({ message: 'Review deleted' });
  } catch (e) { next(e); }
};

module.exports = { addReview, getProductReviews, deleteReview };

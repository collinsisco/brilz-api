const supabase = require('../config/supabase');

const globalSearch = async (req, res, next) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q || q.trim().length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters' });
    const term = q.trim();

    const [products, properties, farming] = await Promise.all([
      supabase.from('products').select('id,name,price,image_url,product_type').eq('is_active',true).eq('product_type','fashion').ilike('name',`%${term}%`).limit(Number(limit)),
      supabase.from('properties').select('id,name,price_per_night,image_url,location').eq('is_active',true).ilike('name',`%${term}%`).limit(Number(limit)),
      supabase.from('products').select('id,name,price,image_url,unit').eq('is_active',true).in('product_type',['farming','equipment']).ilike('name',`%${term}%`).limit(Number(limit)),
    ]);

    res.json({
      query: term,
      results: {
        fashion:       (products.data||[]).map(p => ({ ...p, _type: 'fashion',       _url: `/product.html?id=${p.id}` })),
        accommodation: (properties.data||[]).map(p=>({ ...p, price: p.price_per_night, _type:'stay', _url:`/booking.html?id=${p.id}` })),
        farming:       (farming.data||[]).map(p => ({ ...p, _type: 'farming',        _url: `/product.html?id=${p.id}` })),
      },
      total: (products.data?.length||0) + (properties.data?.length||0) + (farming.data?.length||0),
    });
  } catch (e) { next(e); }
};

module.exports = { globalSearch };

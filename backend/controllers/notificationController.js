const supabase = require('../config/supabase');

const getNotifications = async (req, res, next) => {
  try {
    const { type, read } = req.query;
    let q = supabase.from('notifications').select('*').eq('user_id', req.user.id).order('created_at', {ascending:false}).limit(50);
    if (type) q = q.eq('type', type);
    if (read !== undefined) q = q.eq('is_read', read === 'true');
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { next(e); }
};

const markRead = async (req, res, next) => {
  try {
    await supabase.from('notifications').update({ is_read: true }).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ message: 'Marked as read' });
  } catch (e) { next(e); }
};

const markAllRead = async (req, res, next) => {
  try {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', req.user.id).eq('is_read', false);
    res.json({ message: 'All notifications marked as read' });
  } catch (e) { next(e); }
};

module.exports = { getNotifications, markRead, markAllRead };

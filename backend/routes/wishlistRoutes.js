const router = require('express').Router();
const c = require('../controllers/wishlistController');
const { protect } = require('../middleware/authMiddleware');

router.get('/',          protect, c.getWishlist);
router.post('/',         protect, c.addToWishlist);
router.post('/sync',     protect, c.syncWishlist);
router.delete('/:id',    protect, c.removeFromWishlist);
module.exports = router;

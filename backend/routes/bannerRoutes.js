const router = require('express').Router();
const c = require('../controllers/bannerController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/',       c.getBanners);
router.post('/',      protect, adminOnly, c.createBanner);
router.patch('/:id',  protect, adminOnly, c.updateBanner);
router.delete('/:id', protect, adminOnly, c.deleteBanner);
module.exports = router;

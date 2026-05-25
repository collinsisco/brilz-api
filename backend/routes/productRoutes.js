const router = require('express').Router();
const c      = require('../controllers/productController');
const rc     = require('../controllers/reviewController');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

router.get('/',                c.getAllProducts);
router.get('/:id',             c.getProduct);
router.get('/:id/reviews',     c.getProductReviews);
router.post('/:productId/reviews', protect, rc.addReview);
router.post('/',       protect, adminOnly, upload.single('image'), c.createProduct);
router.patch('/:id',   protect, adminOnly, upload.single('image'), c.updateProduct);
router.delete('/:id',  protect, adminOnly, c.deleteProduct);
module.exports = router;

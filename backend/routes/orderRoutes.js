const router = require('express').Router();
const c = require('../controllers/orderController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.post('/',            protect, c.createOrder);
router.get('/my',           protect, c.getMyOrders);
router.get('/:id',          protect, c.getOrder);
router.patch('/:id/status', protect, adminOnly, c.updateStatus);
router.post('/:id/cancel',  protect, c.cancelOrder);
router.get('/',             protect, adminOnly, c.getAllOrders);
module.exports = router;

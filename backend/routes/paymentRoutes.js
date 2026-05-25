const router = require('express').Router();
const c = require('../controllers/paymentController');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { mpesaLimiter } = require('../middleware/rateLimiter');

router.post('/stk-push',          protect, mpesaLimiter, c.initiateSTKPush);
router.post('/mpesa-callback',    c.mpesaCallback);   // Safaricom calls this — no auth
router.get('/status/:id',         c.getPaymentStatus);
router.get('/',                   protect, adminOnly, c.getAllPayments);
module.exports = router;

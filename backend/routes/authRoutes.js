const router = require('express').Router();
const c = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimiter');

router.post('/register', authLimiter, c.register);
router.post('/login',    authLimiter, c.login);
router.get('/me',        protect, c.getMe);
router.patch('/me',      protect, c.updateMe);
router.post('/password', protect, c.changePassword);
module.exports = router;

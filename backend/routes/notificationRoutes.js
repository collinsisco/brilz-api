const router = require('express').Router();
const c = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

router.get('/',             protect, c.getNotifications);
router.post('/read-all',    protect, c.markAllRead);
router.post('/:id/read',    protect, c.markRead);
module.exports = router;

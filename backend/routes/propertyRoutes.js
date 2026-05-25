const router = require('express').Router();
const c = require('../controllers/propertyController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/',                   c.getAllProperties);
router.get('/:id',                c.getProperty);
router.get('/:id/availability',   c.checkAvailability);
router.post('/bookings',          protect, c.createBooking);
router.get('/bookings/my',        protect, c.getMyBookings);
module.exports = router;

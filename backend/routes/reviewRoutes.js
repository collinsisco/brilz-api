const router = require('express').Router();
const c = require('../controllers/reviewController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.post('/',       protect, c.addReview);
router.delete('/:id',  protect, adminOnly, c.deleteReview);
module.exports = router;

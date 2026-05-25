const router = require('express').Router();
const c = require('../controllers/farmingController');

router.get('/categories', c.getFarmingCategories);
router.get('/',           c.getFarmingProducts);
router.get('/:id',        c.getFarmingProduct);
module.exports = router;

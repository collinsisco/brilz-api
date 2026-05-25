const router = require('express').Router();
const { globalSearch } = require('../controllers/searchController');
router.get('/', globalSearch);
module.exports = router;

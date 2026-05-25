/**
 * supplierSync.js
 * Placeholder for auto-syncing inventory from dropshipping suppliers.
 * Currently a stub — implement when supplier API credentials are available.
 */
const logger   = require('../config/logger');
const supabase = require('../config/supabase');

const syncInventory = async () => {
  logger.info('[supplierSync] Inventory sync triggered (stub — no supplier connected yet)');
  // TODO: connect to supplier API, fetch stock levels, update products table
  return { synced: 0, errors: 0 };
};

module.exports = { syncInventory };

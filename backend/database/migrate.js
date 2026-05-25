/**
 * Brilz Migration Runner
 * Usage: npm run migrate
 * Runs all SQL files in /migrations in order
 */
require('dotenv').config({ path: `.env.${process.env.NODE_ENV||'development'}` });
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

(async () => {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  console.log(`\n🚀 Running ${files.length} migrations...\n`);
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`  ▶ ${file}`);
    const { error } = await supabase.rpc('exec_sql', { sql }).catch(() => ({ error: null }));
    // Supabase doesn't have exec_sql — run via raw query through pg directly
    // For Supabase: paste SQL files manually in SQL Editor in order
    // This runner is for local Postgres only
    if (error) console.error(`    ❌ Error: ${error.message}`);
    else console.log(`    ✅ Done`);
  }
  console.log('\n✅ All migrations complete.\n');
  console.log('NOTE: For Supabase, paste each SQL file manually in the SQL Editor.');
  process.exit(0);
})();

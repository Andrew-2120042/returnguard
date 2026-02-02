import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanTestData() {
  console.log('🧹 Cleaning existing test data...\n');

  // Delete in reverse order of dependencies
  const tables = [
    'fraud_alerts',
    'background_jobs',
    'returns',
    'orders',
    'customers',
    'merchants'
  ];

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (using impossible condition)

    if (error) {
      console.log(`⚠️  Note: ${table} - ${error.message}`);
    } else {
      console.log(`✅ Cleaned ${table}`);
    }
  }

  console.log('\n✨ Database cleaned successfully!\n');
}

cleanTestData().catch(console.error);

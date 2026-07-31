const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.tyqsuomqralrhxafsxwg:Jaswanth%401143@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  try {
    await client.connect();
    console.log('Connected! Adding portion columns to menu_items table...');
    
    // Add columns if they do not exist
    await client.query(`
      ALTER TABLE menu_items 
      ADD COLUMN IF NOT EXISTS has_portions BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS price_half DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS price_full DECIMAL(10, 2);
    `);
    
    console.log('Columns added successfully!');
  } catch (err) {
    console.error('Error running migration:', err);
  } finally {
    await client.end();
  }
}

run();

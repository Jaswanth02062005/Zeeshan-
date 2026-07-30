const { Client } = require('pg');

const sql = `
ALTER TABLE menu_items 
ADD COLUMN IF NOT EXISTS offer_price DECIMAL(10, 2) DEFAULT NULL;
`;

const client = new Client({
  connectionString: 'postgresql://postgres.tyqsuomqralrhxafsxwg:Jaswanth%401143@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  try {
    console.log('Connecting to Supabase database...');
    await client.connect();
    console.log('Connected! Adding offer_price column to menu_items table...');
    await client.query(sql);
    console.log('Column added successfully!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

run();

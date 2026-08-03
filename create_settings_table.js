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
    console.log('Connected! Creating settings table...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      INSERT INTO settings (key, value) 
      VALUES ('min_order_amount', '200'::jsonb) 
      ON CONFLICT (key) DO NOTHING;
    `);
    
    console.log('Settings table created and initialized successfully!');
  } catch (err) {
    console.error('Error running migration:', err);
  } finally {
    await client.end();
  }
}

run();

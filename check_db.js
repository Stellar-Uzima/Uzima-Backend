const { Client } = require('pg');

async function checkDb() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'samixx',
    database: 'uzima',
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('Tables:', tables.rows.map(r => r.table_name).join(', '));

    for (const table of tables.rows.map(r => r.table_name)) {
        if (table === 'health_tasks') {
            const cols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table}'`);
            console.log(`Columns for ${table}:`, cols.rows.map(c => `${c.column_name} (${c.data_type})`).join(', '));
        }
    }

  } catch (err) {
    console.error('Error connecting to DB:', err);
  } finally {
    await client.end();
  }
}

checkDb();

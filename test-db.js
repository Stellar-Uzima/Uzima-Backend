const { Client } = require('pg');
const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'uzima',
  password: 'uzima123',
  database: 'uzima_db',
});
client.connect()
  .then(() => {
    console.log('Connected successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection failed', err);
    process.exit(1);
  });

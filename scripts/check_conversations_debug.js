
import pool from '../dist/config/db.js';

async function checkConversations() {
  try {
    const client = await pool.connect();
    console.log('Checking conversations_new table...');
    const res = await client.query(`
      SELECT id, user_id, wa_user_id, external_id, contact_name 
      FROM conversations_new 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    console.log('Recent conversations:', res.rows);
    client.release();
  } catch (err) {
    console.error('Error checking DB:', err);
  } finally {
    process.exit();
  }
}

checkConversations();

const express = require('express');
const Redis = require('ioredis');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  if (process.env.DISABLE_LANDING_PAGE === 'true') {
    return res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const redis = new Redis({
  host: process.env.VALKEY_HOST || 'valkey',
  port: parseInt(process.env.VALKEY_PORT || '6379', 10),
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || process.env.POSTGRES_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'password',
  database: process.env.DB_NAME || process.env.POSTGRES_DB || 'valkyrie_db',
  max: 20,
  idleTimeoutMillis: 30000,
});

async function initDatabaseSchema() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS reservations (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      item_id VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'CONFIRMED',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_reservations_item ON reservations(item_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_user ON reservations(user_id);
  `;
  try {
    await pool.query(createTableQuery);
    console.log('[ValkyrieAlloc Engine] PostgreSQL schema & indexes ready.');
  } catch (err) {
    console.error('[ValkyrieAlloc Engine] Error initializing database schema:', err.message);
  }
}

const RESERVE_LUA_SCRIPT = `
  local stockKey = KEYS[1]
  local currentStock = tonumber(redis.call('get', stockKey) or '0')
  if currentStock > 0 then
    redis.call('decr', stockKey)
    return currentStock - 1
  else
    return -1
  end
`;

app.post('/api/init', async (req, res) => {
  try {
    const { itemId = 'item_1', initialStock = 50 } = req.body;
    const stockCount = parseInt(initialStock, 10);

    if (isNaN(stockCount) || stockCount < 0) {
      return res.status(400).json({ error: 'initialStock must be a non-negative number' });
    }

    await redis.set(`stock:${itemId}`, stockCount);

    return res.status(200).json({
      success: true,
      message: `Stock initialized for ${itemId}`,
      itemId,
      stock: stockCount
    });
  } catch (err) {
    console.error('API Init Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/reserve', async (req, res) => {
  try {
    const { itemId = 'item_1', userId = 'user_anon' } = req.body;

    const remainingStock = await redis.eval(RESERVE_LUA_SCRIPT, 1, `stock:${itemId}`);

    if (remainingStock >= 0) {
      pool.query(
        'INSERT INTO reservations (user_id, item_id, created_at) VALUES ($1, $2, NOW())',
        [userId, itemId]
      ).catch((err) => console.error('[DB Write Warning]:', err.message));

      return res.status(200).json({
        success: true,
        message: 'Reservation claimed!',
        itemId,
        userId,
        remainingStock
      });
    } else {
      return res.status(409).json({
        success: false,
        message: 'Stock exhausted!',
        itemId,
        remainingStock: 0
      });
    }
  } catch (error) {
    console.error('API Reserve Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/status', async (req, res) => {
  try {
    const itemId = req.query.itemId || 'item_1';
    const currentStock = await redis.get(`stock:${itemId}`);

    return res.status(200).json({
      itemId,
      stock: currentStock !== null ? parseInt(currentStock, 10) : 0
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/logs', async (req, res) => {
  try {
    const { itemId = 'item_1', limit = 20 } = req.query;
    const result = await pool.query(
      'SELECT id, user_id, item_id, status, created_at FROM reservations WHERE item_id = $1 ORDER BY id DESC LIMIT $2',
      [itemId, limit]
    );
    return res.status(200).json({
      itemId,
      totalCount: result.rowCount,
      logs: result.rows
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`[ValkyrieAlloc Engine] Active and listening on port ${PORT}`);
  await initDatabaseSchema();
});
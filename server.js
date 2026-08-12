const express = require('express');
const Redis = require('ioredis');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Paths for build static assets
const publicPath = path.join(__dirname, 'public');
const distPath = path.join(__dirname, 'dist');

// Serve static assets from build output directories
app.use(express.static(distPath));
app.use(express.static(publicPath));

// Database connection pool (Zerops / Local defaults)
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || process.env.POSTGRES_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'password',
  database: process.env.DB_NAME || process.env.POSTGRES_DB || 'valkyrie_db',
  max: 20,
  idleTimeoutMillis: 30000,
});

// Valkey / Redis connection
const redis = new Redis({
  host: process.env.VALKEY_HOST || process.env.REDIS_HOST || 'valkey',
  port: parseInt(process.env.VALKEY_PORT || process.env.REDIS_PORT || '6379', 10),
  password: process.env.VALKEY_PASSWORD || process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => {
  // Prevent unhandled error crashes
  if (!err.message.includes('NOAUTH')) {
    console.error('[Valkey Redis Error]:', err.message);
  }
});

// Initialize database table schema
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

// Atomic Lua evaluation script
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

// Initialize stock in RAM
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

// Atomic reservation endpoint
app.post('/api/reserve', async (req, res) => {
  try {
    const { itemId = 'item_1', userId = 'user_anon' } = req.body;

    const remainingStock = await redis.eval(RESERVE_LUA_SCRIPT, 1, `stock:${itemId}`);

    if (remainingStock >= 0) {
      // Non-blocking asynchronous write to PostgreSQL
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

// Status readout endpoint
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

// Audit ledger logs endpoint
app.get('/api/logs', async (req, res) => {
  try {
    const itemId = req.query.itemId || 'item_1';
    const limitNum = parseInt(req.query.limit || '50', 10); //  Parsed safely to Integer

    // Query 1: Fetch recent reservation logs
    const result = await pool.query(
      'SELECT id, user_id, item_id, status, created_at FROM reservations WHERE item_id = $1 ORDER BY id DESC LIMIT $2',
      [itemId, limitNum]
    );

    // Query 2: Fetch total row count for the counter card
    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM reservations WHERE item_id = $1',
      [itemId]
    );

    return res.status(200).json({
      itemId,
      totalCount: countResult.rows[0]?.total || 0,
      logs: result.rows || []
    });
  } catch (err) {
    console.error('[Logs Endpoint Error]:', err.message);
    // Return a 200 fallback so the React UI doesn't crash on DB errors
    return res.status(200).json({
      itemId: req.query.itemId || 'item_1',
      totalCount: 0,
      logs: [],
      error: err.message
    });
  }
});

// Catch-all route to serve the built React index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();

  const distIndex = path.join(distPath, 'index.html');
  const publicIndex = path.join(publicPath, 'index.html');

  if (fs.existsSync(distIndex)) {
    return res.sendFile(distIndex);
  } else if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  }
  
  res.status(404).send('Build index.html not found. Make sure to run npm run build.');
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`[ValkyrieAlloc Engine] Active and listening on port ${PORT}`);
  await initDatabaseSchema();
});
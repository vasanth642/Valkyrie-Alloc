const express = require('express');
const Redis = require('ioredis');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Connect to Valkey (Zerops internal hostname: 'valkey')
const redis = new Redis({
  host: process.env.VALKEY_HOST || 'valkey',
  port: process.env.VALKEY_PORT || 6379,
});

// 2. Connect to PostgreSQL (Zerops internal hostname: 'db')
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'valkyrie_db',
});

// 3. Atomic Lua Script: Decrements stock safely in Valkey RAM
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

// Initialize sample stock count (e.g. 50 items)
app.post('/api/init', async (req, res) => {
  try {
    const { initialStock = 50 } = req.body;
    await redis.set('stock:item_1', initialStock);
    res.json({ message: 'Stock set successfully!', stock: initialStock });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// High-Concurrency Reservation Route
app.post('/api/reserve', async (req, res) => {
  try {
    const { userId = 'user_anon' } = req.body;
    
    // Execute microsecond Lua check in memory
    const remainingStock = await redis.eval(RESERVE_LUA_SCRIPT, 1, 'stock:item_1');

    if (remainingStock >= 0) {
      // Async insert into PostgreSQL (Doesn't block user response)
      pool.query(
        'INSERT INTO reservations (user_id, item_id, created_at) VALUES ($1, $2, NOW())',
        [userId, 'item_1']
      ).catch(err => console.log('DB Note:', err.message));

      return res.status(200).json({
        success: true,
        message: 'Reservation claimed!',
        remainingStock
      });
    } else {
      return res.status(409).json({
        success: false,
        message: 'Stock exhausted!',
        remainingStock: 0
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current live stock count
app.get('/api/status', async (req, res) => {
  try {
    const currentStock = await redis.get('stock:item_1') || 0;
    res.json({ item: 'item_1', stock: parseInt(currentStock) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`ValkyrieAlloc active on port ${PORT}`);
});
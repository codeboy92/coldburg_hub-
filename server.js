// ═══════════════════════════════════════════════════════════
// Coldburg Hub — Production Backend (Node.js + Express + SQLite)
// Run: npm install && node server.js
// ═══════════════════════════════════════════════════════════
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'coldburghub_secret_change_in_production';

// ── MIDDLEWARE ──
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public'))); // serves frontend

// Create uploads directory
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// ── MULTER (image uploads) ──
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, uuid() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

// ══════════════════════════════════════════════════════════
// DATABASE SETUP (SQLite)
// ══════════════════════════════════════════════════════════
const db = new Database(process.env.DB_PATH || './coldburghub.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'buyer',
    seller_status TEXT,
    store_name TEXT,
    business_category TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS seller_applications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    store_name TEXT NOT NULL,
    business_category TEXT,
    business_description TEXT,
    phone TEXT,
    status TEXT DEFAULT 'pending',
    rejection_reason TEXT,
    applied_at TEXT DEFAULT (datetime('now')),
    reviewed_at TEXT,
    reviewed_by TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    price REAL NOT NULL,
    original_price REAL,
    stock INTEGER DEFAULT 0,
    emoji TEXT DEFAULT '📦',
    image_url TEXT,
    seller_id TEXT NOT NULL,
    seller_name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    rating REAL DEFAULT 4.0,
    reviews INTEGER DEFAULT 0,
    sales INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (seller_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'Processing',
    total REAL NOT NULL,
    delivery_name TEXT,
    delivery_address TEXT,
    delivery_city TEXT,
    delivery_province TEXT,
    delivery_zip TEXT,
    delivery_phone TEXT,
    placed_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    qty INTEGER NOT NULL,
    emoji TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );
`);

// Seed admin if not exists
const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@coldburghub.co.za');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin2024', 10);
  db.prepare('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)').run(uuid(), 'Admin', 'admin@coldburghub.co.za', hash, 'admin');
  console.log('✅ Admin account created: admin@coldburghub.co.za / admin2024');
}

// ══════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ══════════════════════════════════════════════════════════
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    // refresh user from DB
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!u) return res.status(401).json({ error: 'User not found' });
    req.user = u;
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

function requireApprovedSeller(req, res, next) {
  if (req.user.role !== 'seller' || req.user.seller_status !== 'active') {
    return res.status(403).json({ error: 'Only approved sellers can perform this action.' });
  }
  next();
}

// ══════════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════════
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing required fields.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) return res.status(400).json({ error: 'Email already registered.' });
    const hash = await bcrypt.hash(password, 10);
    const id = uuid();
    db.prepare('INSERT INTO users (id, name, email, password, phone, role) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, email, hash, phone || null, 'buyer');
    const user = db.prepare('SELECT id, name, email, role, seller_status, store_name FROM users WHERE id = ?').get(id);
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user, token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(400).json({ error: 'Invalid email or password.' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid email or password.' });
    const { password: _, ...safeUser } = user;
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: safeUser, token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', auth, (req, res) => {
  const { password: _, ...safeUser } = req.user;
  res.json(safeUser);
});

// ══════════════════════════════════════════════════════════
// SELLER APPLICATION ROUTES
// ══════════════════════════════════════════════════════════
app.post('/api/seller/apply', auth, (req, res) => {
  try {
    const { storeName, businessCategory, businessDescription, phone } = req.body;
    if (!storeName || !businessDescription) return res.status(400).json({ error: 'Store name and description are required.' });
    const existing = db.prepare("SELECT id FROM seller_applications WHERE user_id = ? AND status = 'pending'").get(req.user.id);
    if (existing) return res.status(400).json({ error: 'You already have a pending application.' });
    if (req.user.role === 'seller') return res.status(400).json({ error: 'You are already an approved seller.' });
    const id = uuid();
    db.prepare('INSERT INTO seller_applications (id, user_id, store_name, business_category, business_description, phone) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.user.id, storeName, businessCategory, businessDescription, phone || null);
    db.prepare("UPDATE users SET seller_status = 'pending' WHERE id = ?").run(req.user.id);
    res.json({ message: 'Application submitted. Awaiting admin review.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/seller/application-status', auth, (req, res) => {
  const app = db.prepare('SELECT * FROM seller_applications WHERE user_id = ? ORDER BY applied_at DESC LIMIT 1').get(req.user.id);
  res.json(app || { status: 'none' });
});

// ══════════════════════════════════════════════════════════
// PRODUCT ROUTES
// ══════════════════════════════════════════════════════════
app.get('/api/products', (req, res) => {
  let query = "SELECT * FROM products WHERE status = 'active'";
  const params = [];
  if (req.query.category && req.query.category !== 'All') { query += ' AND category = ?'; params.push(req.query.category); }
  if (req.query.search) { query += ' AND (name LIKE ? OR description LIKE ? OR seller_name LIKE ?)'; const s = `%${req.query.search}%`; params.push(s, s, s); }
  query += ' ORDER BY created_at DESC';
  const products = db.prepare(query).all(...params);
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(p);
});

app.post('/api/products', auth, requireApprovedSeller, upload.single('image'), (req, res) => {
  try {
    const { name, description, category, price, originalPrice, stock, emoji } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Name and price are required.' });
    const id = uuid();
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    db.prepare(`INSERT INTO products (id, name, description, category, price, original_price, stock, emoji, image_url, seller_id, seller_name, rating, reviews)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, name, description, category, parseFloat(price),
      parseFloat(originalPrice) || parseFloat(price),
      parseInt(stock) || 0, emoji || '📦', imageUrl,
      req.user.id, req.user.store_name || req.user.name,
      (3.5 + Math.random() * 1.5).toFixed(1), Math.floor(Math.random() * 80 + 5)
    );
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    res.json(product);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/products/:id', auth, (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (p.seller_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/seller/products', auth, requireApprovedSeller, (req, res) => {
  const products = db.prepare('SELECT * FROM products WHERE seller_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(products);
});

// ══════════════════════════════════════════════════════════
// ORDER ROUTES
// ══════════════════════════════════════════════════════════
app.post('/api/orders', auth, (req, res) => {
  try {
    const { items, deliveryInfo, total } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'Cart is empty.' });
    const orderId = 'CBH-' + Date.now().toString().slice(-8);
    db.prepare(`INSERT INTO orders (id, user_id, total, delivery_name, delivery_address, delivery_city, delivery_province, delivery_zip, delivery_phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      orderId, req.user.id, total,
      deliveryInfo.name, deliveryInfo.address, deliveryInfo.city,
      deliveryInfo.province, deliveryInfo.zip, deliveryInfo.phone
    );
    const insertItem = db.prepare('INSERT INTO order_items (id, order_id, product_id, seller_id, name, price, qty, emoji) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    items.forEach(item => {
      insertItem.run(uuid(), orderId, item.productId, item.sellerId, item.name, item.price, item.qty, item.emoji || '📦');
      db.prepare('UPDATE products SET sales = sales + ?, stock = MAX(0, stock - ?) WHERE id = ?').run(item.qty, item.qty, item.productId);
    });
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders/my', auth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY placed_at DESC').all(req.user.id);
  const result = orders.map(o => ({
    ...o,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id)
  }));
  res.json(result);
});

app.get('/api/seller/orders', auth, requireApprovedSeller, (req, res) => {
  const items = db.prepare('SELECT DISTINCT order_id FROM order_items WHERE seller_id = ?').all(req.user.id);
  const orderIds = items.map(i => i.order_id);
  if (!orderIds.length) return res.json([]);
  const orders = orderIds.map(oid => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(oid);
    return { ...o, items: db.prepare('SELECT * FROM order_items WHERE order_id = ? AND seller_id = ?').all(oid, req.user.id) };
  });
  res.json(orders);
});

// ══════════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════════
app.get('/api/admin/applications', auth, requireRole('admin'), (req, res) => {
  const apps = db.prepare(`
    SELECT sa.*, u.name as user_name, u.email as user_email
    FROM seller_applications sa JOIN users u ON sa.user_id = u.id
    ORDER BY sa.applied_at DESC
  `).all();
  res.json(apps);
});

app.post('/api/admin/applications/:id/approve', auth, requireRole('admin'), (req, res) => {
  const app = db.prepare('SELECT * FROM seller_applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  db.prepare("UPDATE seller_applications SET status = 'approved', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?").run(req.user.id, req.params.id);
  db.prepare("UPDATE users SET role = 'seller', seller_status = 'active', store_name = ?, business_category = ? WHERE id = ?").run(app.store_name, app.business_category, app.user_id);
  res.json({ success: true, message: 'Seller approved.' });
});

app.post('/api/admin/applications/:id/reject', auth, requireRole('admin'), (req, res) => {
  const { reason } = req.body;
  const app = db.prepare('SELECT * FROM seller_applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  db.prepare("UPDATE seller_applications SET status = 'rejected', rejection_reason = ?, reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?").run(reason || 'Did not meet requirements.', req.user.id, req.params.id);
  db.prepare("UPDATE users SET seller_status = 'rejected' WHERE id = ?").run(app.user_id);
  res.json({ success: true });
});

app.get('/api/admin/stats', auth, requireRole('admin'), (req, res) => {
  res.json({
    totalUsers: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    totalSellers: db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'seller'").get().c,
    totalProducts: db.prepare('SELECT COUNT(*) as c FROM products').get().c,
    totalOrders: db.prepare('SELECT COUNT(*) as c FROM orders').get().c,
    pendingApplications: db.prepare("SELECT COUNT(*) as c FROM seller_applications WHERE status = 'pending'").get().c,
    totalRevenue: db.prepare('SELECT SUM(total) as t FROM orders').get().t || 0,
  });
});

app.get('/api/admin/users', auth, requireRole('admin'), (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, seller_status, store_name, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

app.post('/api/admin/sellers/:id/suspend', auth, requireRole('admin'), (req, res) => {
  db.prepare("UPDATE users SET seller_status = 'suspended' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/products/:id', auth, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── SERVE FRONTEND ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║       COLDBURG HUB SERVER RUNNING        ║
  ║  http://localhost:${PORT}                   ║
  ╚══════════════════════════════════════════╝
  Admin: admin@coldburghub.co.za / admin2024
  `);
});

module.exports = app;

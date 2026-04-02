33 # Coldburg Hub 🛍️

A full-featured South African e-commerce marketplace — similar to Takealot.

---

## 📁 Project Structure

```
coldburghub/
├── coldburg-hub.html          ← Standalone demo (open in browser, works offline)
├── coldburghub-backend/
│   ├── server.js              ← Node.js + Express + SQLite backend
│   ├── package.json
│   └── public/
│       └── index.html         ← Copy coldburg-hub.html here, update API URLs
```

---

## 🚀 Option A — Demo (No Server Needed)

Just open **`coldburg-hub.html`** in any browser.

- Uses `localStorage` as a shared database across all browser tabs on the same device
- All features work: register, login, seller applications, admin approval, cart, checkout
- **Demo accounts built-in:**

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@coldburghub.co.za | admin2024 |
| Approved Seller | seller@coldburghub.co.za | seller123 |
| Buyer | thabo@gmail.com | buyer123 |
| Pending Seller | zanele@fashion.co.za | fashion123 |

---

## 🌐 Option B — Full Production Hosting

### Requirements
- Node.js 18+
- npm

### Setup

```bash
cd coldburghub-backend
npm install
node server.js
```

Server starts at **http://localhost:3000**

### Environment Variables (create `.env` file)

```env
PORT=3000
JWT_SECRET=your_super_secret_key_here_change_this
DB_PATH=./coldburghub.db
```

### Frontend Setup

1. Copy `coldburg-hub.html` → `coldburghub-backend/public/index.html`
2. In the HTML file, replace the DB/Cart logic with API calls to `http://localhost:3000/api/...`

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register new buyer |
| POST | /api/auth/login | Login (returns JWT token) |
| GET | /api/auth/me | Get current user |

### Seller Applications
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/seller/apply | Buyer | Submit seller application |
| GET | /api/seller/application-status | Any | Check application status |

### Products
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/products | Public | Get all active products |
| GET | /api/products/:id | Public | Get single product |
| POST | /api/products | Approved Seller | Add product (with image upload) |
| DELETE | /api/products/:id | Seller/Admin | Delete product |
| GET | /api/seller/products | Approved Seller | Get seller's own products |

### Orders
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/orders | Buyer | Place an order |
| GET | /api/orders/my | Buyer | Get my orders |
| GET | /api/seller/orders | Approved Seller | Get orders with my products |

### Admin
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/admin/applications | Admin | List all seller applications |
| POST | /api/admin/applications/:id/approve | Admin | Approve seller |
| POST | /api/admin/applications/:id/reject | Admin | Reject seller |
| GET | /api/admin/stats | Admin | Platform statistics |
| GET | /api/admin/users | Admin | All users |
| POST | /api/admin/sellers/:id/suspend | Admin | Suspend a seller |
| DELETE | /api/admin/products/:id | Admin | Remove any product |

---

## ☁️ Deploy to Railway (Free Hosting)

1. Create account at [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Push your `coldburghub-backend/` folder to a GitHub repo
4. Set environment variable: `JWT_SECRET=your_secret`
5. Railway auto-detects Node.js and deploys

## ☁️ Deploy to Render (Free Hosting)

1. Create account at [render.com](https://render.com)
2. New Web Service → connect GitHub repo
3. Build Command: `npm install`
4. Start Command: `node server.js`
5. Add environment variables

---

## 🗄️ Database Schema

- **users** — buyers, sellers, admins
- **seller_applications** — pending/approved/rejected applications
- **products** — listings (only from approved sellers)
- **orders** — placed orders
- **order_items** — line items per order

---

## 🔒 Security Features (Production)

- Passwords hashed with bcrypt (10 rounds)
- JWT authentication with 7-day expiry
- Role-based access control (buyer / seller / admin)
- Sellers must be **explicitly approved by admin** before listing products
- File upload validation (images only, 5MB max)

---

## 📞 Support

Built for Coldburg Hub (Pty) Ltd — South Africa 🇿🇦

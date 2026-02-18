# Vault

**Luxury goods portfolio tracker with live resale market data.**

Track the real-time resale value of watches, handbags, jewelry, and accessories across major luxury resale platforms.

![Vault](https://img.shields.io/badge/status-live-brightgreen) ![Vercel](https://img.shields.io/badge/deployed-Vercel-black) ![License](https://img.shields.io/badge/license-MIT-blue)

## What It Does

Vault aggregates live pricing data from luxury resale marketplaces and lets you build a personal portfolio to track the value of items you own.

- **Live Search** — Search any luxury item and get real-time pricing from eBay sold listings and Fashionphile
- **Portfolio Tracking** — Add items to your vault with condition grading and see your total portfolio value
- **Price Ranges** — View average, low, and high market prices with listing counts
- **Condition Adjustments** — Automatic value estimates based on item condition (New, Excellent, Very Good, Good, Fair)
- **Platform Sources** — See which platforms each price comes from with direct links to listings

## Supported Platforms

| Platform | Data Type | Status |
|----------|-----------|--------|
| eBay | Sold/completed listings | ✅ Live |
| Fashionphile | Current inventory (Shopify API) | ✅ Live |
| Chrono24 | Watch listings | 🔒 Blocked (anti-bot) |
| StockX | Sneakers & luxury | 🔒 Blocked (anti-bot) |
| The RealReal | Consignment listings | 🔒 Blocked (PerimeterX) |
| Vestiaire Collective | Peer-to-peer listings | 🔒 Blocked (anti-bot) |

> Blocked platforms can be unlocked by adding a proxy service like ScraperAPI or Bright Data.

## Tech Stack

- **Frontend** — React 18, Vite, custom CSS (no frameworks)
- **Backend** — Node.js serverless functions (Vercel)
- **Scraping** — Cheerio (HTML parsing), node-fetch, Shopify Suggest API
- **Caching** — node-cache with 15-minute TTL
- **Deployment** — Vercel (auto-deploy from GitHub)

## Architecture

```
vault/
├── index.html              # Entry point
├── src/
│   ├── main.jsx            # React mount
│   └── App.jsx             # Full frontend application
├── api/
│   ├── search.js           # Search endpoint — scrapes eBay + Fashionphile
│   └── health.js           # Health check endpoint
├── vercel.json             # Vercel routing + CORS config
├── vite.config.js          # Vite build config
└── package.json            # Dependencies
```

### API Endpoints

**POST /api/search**
```json
{
  "query": "Rolex Daytona",
  "limit": 15
}
```

Returns aggregated listings with brand, price range, platform sources, images, and direct links.

**GET /api/health**

Returns API status.

## Running Locally

```bash
git clone https://github.com/jordanrutledge/vault.git
cd vault
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`. API endpoints require Vercel CLI for local serverless function emulation:

```bash
npm i -g vercel
vercel dev
```

## Deployment

This project auto-deploys to Vercel on every push to `main`.

To deploy manually:
```bash
vercel --prod
```

## Roadmap

- [ ] Add proxy service to unlock Chrono24, StockX, and The RealReal
- [ ] Price history database (Supabase) for real 30-day trend charts
- [ ] User accounts with persistent portfolios across devices
- [ ] Custom domain
- [ ] Push notifications for price movements
- [ ] CSV/PDF portfolio export

## License

MIT

const fetch = require("node-fetch");
const cheerio = require("cheerio");
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 900 });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function parsePrice(t) {
  const m = (t || "").replace(/,/g, "").match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

const BRANDS = [
  "Rolex","Patek Philippe","Audemars Piguet","Omega","Cartier",
  "Hermès","Hermes","Chanel","Louis Vuitton","Gucci","Prada","Dior",
  "Christian Dior","Goyard","Van Cleef & Arpels","Van Cleef","Tiffany",
  "Bottega Veneta","Celine","Bulgari","Bvlgari","Nike",
  "Christian Louboutin","IWC","Tudor","Breitling","Hublot","Panerai",
  "Messika","Chopard","Fendi","Balenciaga","Saint Laurent","YSL",
  "Valentino","Givenchy","Loewe","Miu Miu","Versace","Burberry",
  "Chloe","Rimowa","Montblanc","David Yurman","John Hardy",
  "TAG Heuer","Zenith","Jaeger-LeCoultre","Vacheron Constantin",
  "A. Lange","Richard Mille","Piaget","Baume & Mercier",
];

function extractBrand(name) {
  const l = name.toLowerCase();
  for (const b of BRANDS) {
    if (l.includes(b.toLowerCase())) return b;
  }
  return "";
}

function cleanName(name) {
  return name
    .replace(/Opens in a new window or tab\s*/gi, "")
    .replace(/Sponsored\s*$/gi, "")
    .replace(/New Listing\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function classify(name, brand) {
  const n = (brand + " " + name).toLowerCase();
  if (/watch|daytona|submariner|nautilus|royal oak|speedmaster|datejust|gmt|aquanaut|santos|tank|seamaster|explorer|day-date|sky-dweller|oyster perpetual|chronograph|cosmograph|moonwatch|carrera|navitimer|luminor|big bang|pelagos/i.test(n)) return "Watches";
  if (/birkin|kelly|bag|flap|neverfull|speedy|pochette|boy bag|wallet on chain|saddle|lady dior|cassette|luggage|picotin|evelyne|constance|keepall|alma|tote|clutch|satchel|hobo|shoulder|handbag|purse|backpack/i.test(n)) return "Handbags";
  if (/bracelet|necklace|ring|pendant|earring|brooch|love\s|juste un clou|alhambra|serpenti|cuff|bangle|choker|chain\s/i.test(n)) return "Jewelry";
  if (/shoe|sneaker|boot|heel|pump|jordan|dunk|louboutin|sandal|mule|flat|trainer|derby|oxford|loafer/i.test(n)) return "Shoes";
  return "Accessories";
}

// ── Fashionphile via Shopify Suggest JSON ──
async function scrapeFashionphile(query, limit) {
  const results = [];
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 10000);
    const r = await fetch(
      "https://www.fashionphile.com/search/suggest.json?q=" +
        encodeURIComponent(query) +
        "&resources[type]=product&resources[limit]=" + limit,
      { headers: { "User-Agent": UA, Accept: "application/json" }, signal: c.signal }
    );
    clearTimeout(t);
    const data = await r.json();
    const products = data?.resources?.results?.products || [];
    for (const p of products) {
      const price = parseFloat(p.price) || parseFloat(p.compare_at_price_min) || 0;
      if (price <= 0) continue;
      const title = p.title || "";
      // Fashionphile titles often omit the brand, extract from title or query
      const brand = extractBrand(title) || extractBrand(query);
      results.push({
        name: title,
        brand: brand || query.split(" ")[0],
        price,
        condition: p.available ? "Pre-owned" : "Sold",
        platform: "Fashionphile",
        url: p.url ? "https://www.fashionphile.com" + p.url : "",
        imageUrl: p.image || p.featured_image?.url || "",
      });
    }
  } catch (e) { console.error("[Fashionphile]", e.message); }
  return results;
}

// ── eBay Sold Listings ──
async function scrapeEbay(query, limit) {
  const results = [];
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 10000);
    const r = await fetch(
      "https://www.ebay.com/sch/i.html?_nkw=" + encodeURIComponent(query) +
        "&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=60&rt=nc",
      { headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" }, signal: c.signal }
    );
    clearTimeout(t);
    const html = await r.text();
    const $ = cheerio.load(html);
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    $("[data-view]").each((i, el) => {
      if (results.length >= limit) return false;
      const $el = $(el);
      const link = $el.find("a[href*='ebay.com/itm']").first();
      if (!link.length) return;
      const rawName = link.text().trim();
      const name = cleanName(rawName);
      if (!name || name.length < 5) return;

      // Relevance filter: at least 2 query words must appear in the title
      const nameLower = name.toLowerCase();
      const matchCount = queryWords.filter(w => nameLower.includes(w)).length;
      if (matchCount < Math.min(2, queryWords.length)) return;

      const text = $el.text();
      const priceMatch = text.match(/\$([\d,]+\.?\d*)/);
      if (!priceMatch) return;
      const price = parseFloat(priceMatch[1].replace(/,/g, ""));
      if (price <= 0 || price < 50) return;

      const href = link.attr("href") || "";
      const img = $el.find("img").attr("src") || "";
      const brand = extractBrand(name) || extractBrand(query);

      results.push({
        name, brand: brand || query.split(" ")[0], price,
        condition: "", platform: "eBay (Sold)",
        url: href, imageUrl: img,
      });
    });
  } catch (e) { console.error("[eBay]", e.message); }
  return results;
}

// ── Aggregation ──
function aggregate(listings, query) {
  if (!listings.length) return [];
  const queryBrand = extractBrand(query);
  const groups = {};

  for (const l of listings) {
    // Normalize: use brand from query if brand extraction failed
    const brand = l.brand || queryBrand || query.split(" ")[0];
    const normName = l.name.toLowerCase()
      .replace(/[^a-z0-9]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Group by model number if present (e.g., 116500ln, 116520)
    const modelMatch = normName.match(/\b(\d{5,6}[a-z]{0,3})\b/);
    const key = modelMatch
      ? brand.toLowerCase() + "::" + modelMatch[1]
      : brand.toLowerCase() + "::" + normName.substring(0, 50);

    if (!groups[key]) groups[key] = { brand, name: l.name, listings: [] };

    // Prefer cleaner names (Fashionphile > eBay)
    if (l.platform === "Fashionphile" && groups[key].listings.some(x => x.platform !== "Fashionphile")) {
      groups[key].name = l.name;
      groups[key].brand = brand;
    }
    groups[key].listings.push(l);
  }

  const out = [];
  for (const g of Object.values(groups)) {
    const prices = g.listings.map(l => l.price).filter(p => p > 0);
    if (!prices.length) continue;

    // Remove outliers with IQR for groups with enough data
    let cleanPrices = prices;
    if (prices.length >= 4) {
      const sorted = [...prices].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      cleanPrices = prices.filter(p => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);
      if (cleanPrices.length === 0) cleanPrices = prices;
    }

    const avg = Math.round(cleanPrices.reduce((s, p) => s + p, 0) / cleanPrices.length);

    out.push({
      brand: g.brand,
      name: cleanName(g.name),
      category: classify(g.name, g.brand),
      avgPrice: avg,
      lowPrice: Math.min(...cleanPrices),
      highPrice: Math.max(...cleanPrices),
      numListings: g.listings.length,
      sources: [...new Set(g.listings.map(l => l.platform))],
      sampleUrls: g.listings.filter(l => l.url).slice(0, 5).map(l => ({ platform: l.platform, url: l.url })),
      imageUrl: g.listings.find(l => l.imageUrl)?.imageUrl || null,
    });
  }

  // Sort: most listings first, then by price descending
  out.sort((a, b) => b.numListings - a.numListings || b.avgPrice - a.avgPrice);
  return out;
}

// ── Handler ──
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  if (req.method === "OPTIONS") return res.status(204).end();

  let query, limit;
  if (req.method === "GET") {
    query = req.query.q;
    limit = parseInt(req.query.limit) || 15;
  } else {
    query = (req.body || {}).query;
    limit = (req.body || {}).limit || 15;
  }
  if (!query || query.trim().length < 2) {
    return res.status(400).json({ error: "Query required (min 2 characters)" });
  }
  const q = query.trim();

  // Check cache
  const ck = "s:" + q.toLowerCase();
  const cached = cache.get(ck);
  if (cached) return res.status(200).json({ ...cached, cached: true });

  // Run scrapers in parallel
  const [ebayResults, fpResults] = await Promise.all([
    scrapeEbay(q, limit).catch(() => []),
    scrapeFashionphile(q, limit).catch(() => []),
  ]);

  const all = [...ebayResults, ...fpResults];
  const items = aggregate(all, q);

  const response = {
    query: q,
    totalListings: all.length,
    items: items.slice(0, 20),
    platforms: {
      ebay: { name: "eBay (Sold)", count: ebayResults.length },
      fashionphile: { name: "Fashionphile", count: fpResults.length },
    },
    timestamp: new Date().toISOString(),
  };

  cache.set(ck, response);
  return res.status(200).json(response);
};

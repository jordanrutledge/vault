const fetch = require("node-fetch");
const cheerio = require("cheerio");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 hours

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ── Query normalization ──
const QUERY_ALIASES = {
  "^ap\\b": "Audemars Piguet",
  "\\bap\\s": "Audemars Piguet ",
  "\\bapc\\b": "Audemars Piguet",
  "\\blv\\b": "Louis Vuitton",
  "\\bysl\\b": "Saint Laurent",
  "\\bcc\\b": "Chanel",
  "\\bpp\\b": "Patek Philippe",
  "\\bvc&a\\b": "Van Cleef",
  "\\bvca\\b": "Van Cleef",
  "\\btrr\\b": "The RealReal",
  "\\brl\\b": "Rolex",
  "\\bcc flap\\b": "Chanel Classic Flap",
  "\\broyal oak\\b": "Royal Oak",
};
function normalizeQuery(q) {
  let n = q.trim();
  for (const [p, r] of Object.entries(QUERY_ALIASES)) n = n.replace(new RegExp(p, "i"), r);

  // Strip internal SKU tokens (e.g. "10-10-LNG-BXLUEQ", "prj_AbPlGiNV9")
  // Keep real reference numbers like "116500LN", "5711/1A"
  n = n.replace(/\b\d{2}-\d{2}-[A-Z]{2,}-[A-Z0-9]{4,}\b/g, "").trim();

  // Strip lone long alphanumeric strings that look like internal IDs
  n = n.replace(/\b[A-Z]{2,}\d{4,}[A-Z0-9]*\b/g, m => {
    // Keep if it looks like a real watch ref (e.g. "116500LN", "PAM00441", "IW500401")
    if (/^[A-Z]{0,4}\d{4,6}[A-Z0-9]{0,4}$/.test(m)) return m;
    return "";
  }).replace(/\s+/g, " ").trim();

  // If query got too short after stripping, return original brand-based form
  if (n.split(" ").filter(Boolean).length < 1) n = q.trim();

  return n.trim();
}

// ── Supabase cache ──
async function getCached(key) {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("search_cache")
      .select("result, cached_at")
      .eq("query_key", key)
      .single();
    if (!data) return null;
    const age = (Date.now() - new Date(data.cached_at).getTime()) / 1000;
    if (age > CACHE_TTL_SECONDS) return null;
    return data.result;
  } catch { return null; }
}

async function setCached(key, result) {
  if (!supabase) return;
  try {
    await supabase.from("search_cache").upsert({ query_key: key, result, cached_at: new Date().toISOString() });
  } catch (e) { console.error("[cache write]", e.message); }
}

function parsePrice(t) {
  const m = (t || "").replace(/,/g, "").match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

const BRANDS = [
  "Rolex", "Patek Philippe", "Audemars Piguet", "Omega", "Cartier",
  "Hermès", "Hermes", "Chanel", "Louis Vuitton", "Gucci", "Prada", "Dior",
  "Christian Dior", "Goyard", "Van Cleef & Arpels", "Van Cleef", "Tiffany",
  "Bottega Veneta", "Celine", "Bulgari", "Bvlgari", "Nike",
  "Christian Louboutin", "IWC", "Tudor", "Breitling", "Hublot", "Panerai",
  "Messika", "Chopard", "Fendi", "Balenciaga", "Saint Laurent", "YSL",
  "Valentino", "Givenchy", "Loewe", "Miu Miu", "Versace", "Burberry",
  "Chloe", "Rimowa", "Montblanc", "David Yurman", "John Hardy",
  "TAG Heuer", "Zenith", "Jaeger-LeCoultre", "Vacheron Constantin",
  "A. Lange", "Richard Mille", "Piaget", "Baume & Mercier", "Roger Dubuis",
  "Mikimoto", "Harry Winston", "Graff", "Buccellati", "Pomellato",
];

function extractBrand(name) {
  const l = name.toLowerCase();
  for (const b of BRANDS) { if (l.includes(b.toLowerCase())) return b; }
  return "";
}

function cleanName(name) {
  return name
    .replace(/Opens in a new window or tab\s*/gi, "")
    .replace(/Sponsored\s*$/gi, "")
    .replace(/New Listing\s*/gi, "")
    .replace(/Pre-Owned\s*/gi, "")
    .replace(/\s+/g, " ").trim();
}

function classify(name, brand) {
  const n = (brand + " " + name).toLowerCase();
  if (/watch|daytona|submariner|nautilus|royal oak|speedmaster|datejust|gmt[-\s]?master|aquanaut|santos|tank\s|seamaster|explorer|day-date|sky-dweller|oyster perpetual|chronograph|cosmograph|moonwatch|carrera|navitimer|luminor|big bang|pelagos|constellation|de ville|offshore|octo|portugieser/i.test(n)) return "Watches";
  if (/birkin|kelly\s|bag|flap|neverfull|speedy|pochette|boy bag|wallet on chain|saddle|lady dior|cassette|luggage|picotin|evelyne|constance|keepall|alma|tote|clutch|satchel|hobo|shoulder|handbag|purse|backpack|nano|mini\s.*bag|book tote|deauville|gabrielle|coco handle|trendy cc|business affinity|puzzle|loewe|paloma/i.test(n)) return "Handbags";
  if (/bracelet|necklace|ring|pendant|earring|brooch|love\s|juste un clou|alhambra|serpenti|cuff|bangle|choker|chain\s|panthère|clash\s|trinity|nail\s|pearl|diamond\s.*jewelry/i.test(n)) return "Jewelry";
  if (/shoe|sneaker|boot|heel|pump|jordan|dunk|louboutin|sandal|mule|flat|trainer|derby|oxford|loafer|espadrille|slingback/i.test(n)) return "Shoes";
  return "Accessories";
}

function makeShopifyScraper(domain, platformName) {
  return async function(query, limit) {
    const results = [];
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 9000);
      const r = await fetch(
        `https://${domain}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=${limit}`,
        { headers: { "User-Agent": UA, Accept: "application/json" }, signal: c.signal }
      );
      clearTimeout(t);
      if (!r.ok) return results;
      const data = await r.json();
      const products = data?.resources?.results?.products || [];
      for (const p of products) {
        const price = parseFloat(p.price) || parseFloat(p.compare_at_price_min) || 0;
        if (price <= 0) continue;
        const title = p.title || "";
        const brand = extractBrand(title) || extractBrand(query);
        results.push({
          name: title, brand: brand || query.split(" ")[0], price,
          condition: "Pre-owned", platform: platformName,
          url: p.url ? `https://${domain}${p.url}` : "",
          imageUrl: p.image || p.featured_image?.url || "",
        });
      }
    } catch (e) { console.error(`[${platformName}]`, e.message); }
    return results;
  };
}

const scrapeFashionphile  = makeShopifyScraper("www.fashionphile.com",          "Fashionphile");
const scrapeAnalogShift   = makeShopifyScraper("www.analogshift.com",            "Analog Shift");
const scrapeWatchPreserve = makeShopifyScraper("www.thewatchpreserve.com",       "The Watch Preserve");
const scrapeWatchesNY     = makeShopifyScraper("www.watchesofnewyork.com",       "Watches of New York");
const scrapeWristAfic     = makeShopifyScraper("www.wristaficionado.com",        "Wrist Aficionado");
const scrapeRebag        = makeShopifyScraper("shop.rebag.com", "Rebag");
const scrapeMadisonAve   = makeShopifyScraper("www.madisonavenuecouture.com", "Madison Avenue Couture");
const scrapePrivePorter  = makeShopifyScraper("www.priveporter.com", "Privé Porter");
const scrapeAnns         = makeShopifyScraper("www.annsfabulousfinds.com", "Ann's Fabulous Finds");
const scrapeBeladora     = makeShopifyScraper("www.beladora.com", "Beladora");
const scrapeLuxeDH       = makeShopifyScraper("www.luxedh.com", "LuxeDH");

// ── eBay Browse API (active BIN listings) ──
// Requires EBAY_CLIENT_ID + EBAY_CLIENT_SECRET env vars (free eBay developer account)
let ebayToken = null;
let ebayTokenExpiry = 0;

async function getEbayToken() {
  if (ebayToken && Date.now() < ebayTokenExpiry - 60000) return ebayToken;
  const clientId     = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const creds = Buffer.from(clientId + ":" + clientSecret).toString("base64");
    const r = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": "Basic " + creds },
      body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    });
    const d = await r.json();
    if (d.access_token) {
      ebayToken = d.access_token;
      ebayTokenExpiry = Date.now() + (d.expires_in || 7200) * 1000;
      return ebayToken;
    }
  } catch (e) { console.error("[eBay token]", e.message); }
  return null;
}

async function scrapeEbay(query, limit) {
  const results = [];
  const token = await getEbayToken();

  // ── eBay Browse API path (preferred when credentials available) ──
  if (token) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 10000);
      const params = new URLSearchParams({
        q: query,
        limit: String(Math.min(limit * 2, 50)),
        filter: "buyingOptions:{FIXED_PRICE}",
        sort: "price",
      });
      const r = await fetch("https://api.ebay.com/buy/browse/v1/item_summary/search?" + params, {
        headers: {
          "Authorization": "Bearer " + token,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
          "Content-Type": "application/json",
        },
        signal: c.signal,
      });
      clearTimeout(t);
      if (r.ok) {
        const d = await r.json();
        const items = d.itemSummaries || [];
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        for (const item of items) {
          if (results.length >= limit) break;
          const name = cleanName(item.title || "");
          if (!name || name.length < 8) continue;
          const nameLower = name.toLowerCase();
          const matchCount = queryWords.filter(w => nameLower.includes(w)).length;
          const minMatch = queryWords.length <= 1 ? 1 : Math.max(1, Math.floor(queryWords.length * 0.4));
          if (queryWords.length > 0 && matchCount < minMatch) continue;
          const price = parseFloat(item.price?.value || "0");
          if (price < 50) continue;
          const brand = extractBrand(name) || extractBrand(query);
          results.push({
            name, brand: brand || query.split(" ")[0], price,
            condition: item.condition || "Pre-owned",
            platform: "eBay",
            url: item.itemWebUrl || "",
            imageUrl: item.image?.imageUrl || (item.thumbnailImages && item.thumbnailImages[0] && item.thumbnailImages[0].imageUrl) || "",
          });
        }
        console.log("[eBay Browse API] " + results.length + " results for: " + query);
        return results;
      }
    } catch (e) { console.error("[eBay Browse API]", e.message); }
  }

  // ── Fallback: HTML scrape (may be blocked from cloud IPs) ──
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8000);
    const r = await fetch(
      "https://www.ebay.com/sch/i.html?_nkw=" + encodeURIComponent(query) + "&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=60&rt=nc",
      { headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9" }, signal: c.signal }
    );
    clearTimeout(t);
    if (!r.ok) { console.log("[eBay HTML] blocked:", r.status); return results; }
    const html = await r.text();
    const $ = cheerio.load(html);
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    $(".s-item, [data-view]").each((i, el) => {
      if (results.length >= limit) return false;
      const $el = $(el);
      const link = $el.find("a").filter((i, a) => ($(a).attr("href") || "").includes("ebay.com/itm")).first();
      if (!link.length) return;
      const name = cleanName(link.attr("title") || link.text().trim());
      if (!name || name.length < 8) return;
      const nameLower = name.toLowerCase();
      const matchCount = queryWords.filter(w => nameLower.includes(w)).length;
      const minMatch = queryWords.length <= 1 ? 1 : Math.max(1, Math.floor(queryWords.length * 0.4));
      if (queryWords.length > 0 && matchCount < minMatch) return;
      const priceMatch = $el.text().match(/\$([\d,]+\.?\d*)/);
      if (!priceMatch) return;
      const price = parseFloat(priceMatch[1].replace(/,/g, ""));
      if (price < 50) return;
      const brand = extractBrand(name) || extractBrand(query);
      results.push({
        name, brand: brand || query.split(" ")[0], price,
        condition: "Pre-owned", platform: "eBay (Sold)",
        url: (link.attr("href") || "").split("?")[0],
        imageUrl: $el.find("img").attr("src") || "",
      });
    });
  } catch (e) { console.error("[eBay HTML]", e.message); }
  return results;
}


function aggregate(listings, originalQuery) {
  if (!listings.length) return [];
  const queryBrand = extractBrand(originalQuery);
  const groups = {};
  for (const l of listings) {
    const brand = l.brand || queryBrand || originalQuery.split(" ")[0];
    const normName = l.name.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
    const modelMatch = normName.match(/\b(\d{4,6}[a-z\-\/]{0,5}\d*)\b/);
    const key = modelMatch
      ? brand.toLowerCase() + "::" + modelMatch[1].replace(/[^a-z0-9]/g, "")
      : brand.toLowerCase() + "::" + normName.substring(0, 50);
    if (!groups[key]) groups[key] = { brand, name: l.name, listings: [], bestImg: null };
    if (l.platform !== "eBay (Sold)" && !groups[key].listings.some(x => x.platform !== "eBay (Sold)")) {
      groups[key].name = l.name;
      groups[key].brand = brand;
    }
    if (l.imageUrl && l.imageUrl.includes("cdn.shopify") && !groups[key].bestImg) {
      groups[key].bestImg = l.imageUrl;
    }
    groups[key].listings.push(l);
  }
  const out = [];
  for (const g of Object.values(groups)) {
    const prices = g.listings.map(l => l.price).filter(p => p > 0);
    if (!prices.length) continue;
    let cleanPrices = prices;
    if (prices.length >= 4) {
      const sorted = [...prices].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      cleanPrices = prices.filter(p => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);
      if (!cleanPrices.length) cleanPrices = prices;
    }
    const avg = Math.round(cleanPrices.reduce((s, p) => s + p, 0) / cleanPrices.length);
    const sources = [...new Set(g.listings.map(l => l.platform))];
    out.push({
      brand: g.brand,
      name: cleanName(g.name),
      category: classify(g.name, g.brand),
      avgPrice: avg,
      lowPrice: Math.round(Math.min(...cleanPrices)),
      highPrice: Math.round(Math.max(...cleanPrices)),
      numListings: g.listings.length,
      sources,
      sampleUrls: g.listings.filter(l => l.url).slice(0, 5).map(l => ({ platform: l.platform, url: l.url })),
      imageUrl: g.bestImg || g.listings.find(l => l.imageUrl)?.imageUrl || null,
    });
  }
  out.sort((a, b) => b.numListings - a.numListings || b.avgPrice - a.avgPrice);
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  if (req.method === "OPTIONS") return res.status(204).end();

  let rawQuery, limit;
  if (req.method === "GET") {
    rawQuery = req.query.q;
    limit = parseInt(req.query.limit) || 15;
  } else {
    rawQuery = (req.body || {}).query;
    limit = (req.body || {}).limit || 15;
  }
  if (!rawQuery || rawQuery.trim().length < 2) {
    return res.status(400).json({ error: "Query required (min 2 characters)" });
  }

  const q = normalizeQuery(rawQuery.trim());
  const cacheKey = "s:" + q.toLowerCase().replace(/\s+/g, " ");

  // Check Supabase cache first
  const cached = await getCached(cacheKey);
  if (cached) {
    return res.status(200).json({ ...cached, cached: true, cacheAge: cached.timestamp });
  }

  // Run all scrapers in parallel
  const limit10 = Math.min(limit, 10);
  const [
    ebayResults, fpResults, rebagResults, macResults,
    ppResults, annsResults, beladoraResults, luxeResults,
    analogResults, watchPresResults, watchesNYResults, wristAficResults,
  ] = await Promise.all([
    scrapeEbay(q, limit).catch(() => []),
    scrapeFashionphile(q, limit).catch(() => []),
    scrapeRebag(q, limit10).catch(() => []),
    scrapeMadisonAve(q, limit10).catch(() => []),
    scrapePrivePorter(q, limit10).catch(() => []),
    scrapeAnns(q, limit10).catch(() => []),
    scrapeBeladora(q, limit10).catch(() => []),
    scrapeLuxeDH(q, limit10).catch(() => []),
    scrapeAnalogShift(q, limit10).catch(() => []),
    scrapeWatchPreserve(q, limit10).catch(() => []),
    scrapeWatchesNY(q, limit10).catch(() => []),
    scrapeWristAfic(q, limit10).catch(() => []),
  ]);

  const all = [
    ...ebayResults, ...fpResults, ...rebagResults, ...macResults,
    ...ppResults, ...annsResults, ...beladoraResults, ...luxeResults,
    ...analogResults, ...watchPresResults, ...watchesNYResults, ...wristAficResults,
  ];
  const items = aggregate(all, q);

  const activePlatforms = Object.fromEntries(
    Object.entries({
      ebay:        { name: "eBay (Sold)",            count: ebayResults.length },
      fashionphile:{ name: "Fashionphile",            count: fpResults.length },
      rebag:       { name: "Rebag",                   count: rebagResults.length },
      madisonave:  { name: "Madison Avenue Couture",  count: macResults.length },
      priveporter: { name: "Privé Porter",            count: ppResults.length },
      anns:        { name: "Ann's Fabulous Finds",    count: annsResults.length },
      beladora:    { name: "Beladora",                count: beladoraResults.length },
      luxedh:      { name: "LuxeDH",                  count: luxeResults.length },
      analogshift: { name: "Analog Shift",            count: analogResults.length },
      watchpreserve:{ name: "The Watch Preserve",     count: watchPresResults.length },
      watchesny:   { name: "Watches of New York",     count: watchesNYResults.length },
      wristafic:   { name: "Wrist Aficionado",        count: wristAficResults.length },
    }).filter(([, v]) => v.count > 0)
  );

    // Zero-results: signal frontend to call /api/enrich
  if (items.length === 0 && all.length === 0) {
    console.log('[search] zero results -- triggering enrichment for:', q);
    return res.status(200).json({
      query: q,
      totalListings: 0,
      items: [],
      platforms: {},
      timestamp: new Date().toISOString(),
      enriching: true,
    });
  }

  const response = {
    query: q,
    originalQuery: rawQuery.trim() !== q ? rawQuery.trim() : undefined,
    totalListings: all.length,
    items: items.slice(0, 50),
    platforms: activePlatforms,
    timestamp: new Date().toISOString(),
  };

  // Write to Supabase cache (fire and forget — don't block response)
  setCached(cacheKey, response);

  return res.status(200).json(response);
};

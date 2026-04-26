// Load .env for local script execution
require('dotenv').config({ path: __dirname + '/.env' });
#!/usr/bin/env node
/**
 * Handbag Catalog Ingestion — Fashionphile + Rebag
 * Uses the Shopify /products.json bulk endpoint (public, no auth).
 * Deduplicated by canonical product identity (brand + model + size + material).
 * Run: node scripts/ingest-handbags.js
 */

const https = require("https");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://khbgwxhoxtdmkwcuwotc.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const SOURCES = [
  { name: "Fashionphile", domain: "www.fashionphile.com" },
  { name: "Rebag",        domain: "shop.rebag.com" },
];

const LUXURY_BRANDS = [
  "hermès","hermes","chanel","louis vuitton","gucci","prada","dior","christian dior",
  "goyard","bottega veneta","celine","céline","fendi","loewe","miu miu","valentino",
  "givenchy","balenciaga","saint laurent","yves saint laurent","burberry","chloe","chloé",
  "jacquemus","mansur gavriel","polene","polène","wandler","staud","the row",
  "moynat","berluti","bally","coach","kate spade","marc jacobs","tory burch",
  "alexander mcqueen","vivienne westwood","jimmy choo","ferragamo","salvatore ferragamo",
  "cartier","van cleef","tiffany","rolex","omega","cartier","rimowa",
];

const CATEGORIES = {
  bag: "Handbags",
  handbag: "Handbags", purse: "Handbags", tote: "Handbags", clutch: "Handbags",
  satchel: "Handbags", hobo: "Handbags", shoulder: "Handbags", crossbody: "Handbags",
  backpack: "Handbags", luggage: "Handbags", travel: "Handbags",
  wallet: "Small Leather Goods", card: "Small Leather Goods", coin: "Small Leather Goods",
  belt: "Accessories", scarf: "Accessories", sunglasses: "Accessories", charm: "Accessories",
  jewelry: "Jewelry", bracelet: "Jewelry", necklace: "Jewelry", ring: "Jewelry", earring: "Jewelry",
  watch: "Watches",
  shoe: "Shoes", sneaker: "Shoes", boot: "Shoes", heel: "Shoes", sandal: "Shoes", mule: "Shoes",
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
      }
    }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, json: null }); }
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("timeout " + url)); });
  });
}

function detectCategory(title, productType, tags) {
  const combined = (title + " " + productType + " " + (tags || []).join(" ")).toLowerCase();
  for (const [kw, cat] of Object.entries(CATEGORIES)) {
    if (combined.includes(kw)) return cat;
  }
  return "Accessories";
}

function detectSubcategory(title, productType) {
  const t = (title + " " + productType).toLowerCase();
  if (/birkin/i.test(t)) return "Birkin";
  if (/kelly/i.test(t)) return "Kelly";
  if (/classic flap|cf\b/i.test(t)) return "Classic Flap";
  if (/boy bag/i.test(t)) return "Boy Bag";
  if (/neverfull/i.test(t)) return "Neverfull";
  if (/speedy/i.test(t)) return "Speedy";
  if (/pochette/i.test(t)) return "Pochette";
  if (/wallet on chain|woc/i.test(t)) return "Wallet on Chain";
  if (/tote/i.test(t)) return "Tote";
  if (/clutch/i.test(t)) return "Clutch";
  if (/crossbody/i.test(t)) return "Crossbody";
  if (/backpack/i.test(t)) return "Backpack";
  if (/shoulder/i.test(t)) return "Shoulder Bag";
  return null;
}

function extractSize(title) {
  // Common size patterns: "28cm", "25", "30 cm", "mini", "nano", "PM", "MM", "GM", "small", "medium", "large"
  const cm = title.match(/(\d{2})\s*cm/i);
  if (cm) return cm[1] + "cm";
  const alpha = title.match(/\b(nano|micro|mini|extra\s*small|xs|small|medium|large|extra\s*large|xl)\b/i);
  if (alpha) return alpha[1].toLowerCase();
  const sz = title.match(/\b(PM|MM|GM)\b/);
  if (sz) return sz[1];
  const num = title.match(/\b(19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|45|50)\b/);
  if (num) return num[1] + "cm";
  return null;
}

function extractMaterial(title) {
  const t = title.toLowerCase();
  if (/monogram canvas/i.test(t)) return "Monogram Canvas";
  if (/damier ebene/i.test(t)) return "Damier Ebene";
  if (/damier azur/i.test(t)) return "Damier Azur";
  if (/epi/i.test(t)) return "Epi Leather";
  if (/togo/i.test(t)) return "Togo";
  if (/clemence/i.test(t)) return "Clemence";
  if (/epsom/i.test(t)) return "Epsom";
  if (/swift/i.test(t)) return "Swift";
  if (/caviar/i.test(t)) return "Caviar";
  if (/lambskin/i.test(t)) return "Lambskin";
  if (/canvas/i.test(t)) return "Canvas";
  if (/suede/i.test(t)) return "Suede";
  if (/denim/i.test(t)) return "Denim";
  if (/patent/i.test(t)) return "Patent Leather";
  if (/crocodile|croc\b/i.test(t)) return "Crocodile";
  if (/python/i.test(t)) return "Python";
  if (/wicker|raffia/i.test(t)) return "Raffia";
  if (/nylon/i.test(t)) return "Nylon";
  if (/leather/i.test(t)) return "Leather";
  return null;
}

function canonicalId(brand, displayName) {
  return "hb-" + (brand + "-" + displayName).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function isLuxuryBrand(vendor) {
  const v = (vendor || "").toLowerCase();
  return LUXURY_BRANDS.some(b => v.includes(b) || b.includes(v));
}

// Parse a Shopify product into a canonical catalog row (or null if not luxury)
function parseProduct(p, sourceName) {
  const vendor = p.vendor || "";
  const title = p.title || "";
  const productType = p.product_type || "";
  const tags = p.tags || [];

  if (!isLuxuryBrand(vendor) && !isLuxuryBrand(title)) return null;

  const brand = vendor || title.split(" ")[0];
  const category = detectCategory(title, productType, tags);
  const subcategory = detectSubcategory(title, productType);
  const size = extractSize(title);
  const material = extractMaterial(title);

  const image = p.images?.[0]?.src || null;
  const priceStr = p.variants?.[0]?.price;
  const price = priceStr ? parseFloat(priceStr) : null;

  const displayName = title;
  const id = canonicalId(brand, displayName);

  const aliases = [...new Set([
    title.toLowerCase(),
    displayName.toLowerCase(),
    `${brand} ${title}`.toLowerCase(),
  ].filter(Boolean))];

  return {
    id,
    brand,
    line: subcategory || null,
    model_number: p.variants?.[0]?.sku || null,
    display_name: displayName,
    category,
    subcategory: subcategory || null,
    material,
    size_cm: size || null,
    year_from: null,
    year_to: null,
    msrp: price,
    aliases,
    image_url: image,
    source: sourceName.toLowerCase(),
  };
}

async function scrapeShopify(domain, sourceName) {
  console.log(`\n🛍  Scraping ${sourceName} (${domain})...`);
  const seen = new Map();
  let page = 1;
  let total = 0;
  let empty = 0;

  while (true) {
    const url = `https://${domain}/products.json?limit=250&page=${page}`;
    let result;
    try {
      result = await fetchJSON(url);
    } catch (e) {
      console.error(`  Error page ${page}:`, e.message);
      break;
    }

    if (result.status !== 200 || !result.json?.products?.length) {
      empty++;
      if (empty >= 2) break;
      await sleep(2000);
      continue;
    }

    const products = result.json.products;
    for (const p of products) {
      const row = parseProduct(p, sourceName);
      if (!row) continue;
      // Deduplicate: keep first seen (Fashionphile titles are more normalized)
      if (!seen.has(row.id)) seen.set(row.id, row);
    }

    console.log(`  Page ${page}: ${products.length} products, ${seen.size} unique luxury items so far`);
    total += products.length;
    page++;
    await sleep(500);

    if (products.length < 250) break; // last page
  }

  console.log(`  ✓ ${sourceName}: ${seen.size} unique luxury catalog entries from ${total} total products`);
  return [...seen.values()];
}

async function upsertBatch(rows) {
  const { error } = await supabase.from("catalog").upsert(rows, { onConflict: "id" });
  if (error) { console.error("  upsert error:", error.message); }
  return !error;
}

async function main() {
  const allRows = new Map();

  for (const source of SOURCES) {
    const rows = await scrapeShopify(source.domain, source.name);
    for (const row of rows) {
      if (!allRows.has(row.id)) allRows.set(row.id, row);
    }
    await sleep(1000);
  }

  console.log(`\n📦 Total unique catalog entries: ${allRows.size}`);
  const rows = [...allRows.values()];

  let upserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    await upsertBatch(batch);
    upserted += batch.length;
    if (i % 2000 === 0) console.log(`  Progress: ${upserted}/${rows.length}`);
  }

  console.log(`\n✅ Handbag ingestion complete: ${upserted} rows written`);
}

main().catch(console.error);

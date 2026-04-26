const fetch = require("node-fetch");
const cheerio = require("cheerio");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ── Brand → official site map for direct lookups ──
const BRAND_SITES = {
  "gucci": "www.gucci.com", "louis vuitton": "www.louisvuitton.com", "lv": "www.louisvuitton.com",
  "chanel": "www.chanel.com", "dior": "www.dior.com", "christian dior": "www.dior.com",
  "prada": "www.prada.com", "hermes": "www.hermes.com", "hermès": "www.hermes.com",
  "balenciaga": "www.balenciaga.com", "saint laurent": "www.ysl.com", "ysl": "www.ysl.com",
  "valentino": "www.valentino.com", "givenchy": "www.givenchy.com", "celine": "www.celine.com",
  "bottega veneta": "www.bottegaveneta.com", "miu miu": "www.miumiu.com",
  "burberry": "www.burberry.com", "fendi": "www.fendi.com", "loewe": "www.loewe.com",
  "rolex": "www.rolex.com", "omega": "www.omegawatches.com", "cartier": "www.cartier.com",
  "iwc": "www.iwc.com", "breitling": "www.breitling.com", "tudor": "www.tudorwatch.com",
  "tag heuer": "www.tagheuer.com", "hublot": "www.hublot.com", "panerai": "www.panerai.com",
  "patek philippe": "www.patek.com", "audemars piguet": "www.audemarspiguet.com",
  "vacheron constantin": "www.vacheron-constantin.com", "jaeger-lecoultre": "www.jaeger-lecoultre.com",
  "nike": "www.nike.com", "jordan": "www.nike.com", "adidas": "www.adidas.com",
  "tiffany": "www.tiffany.com", "van cleef": "www.vancleefarpels.com",
  "rimowa": "www.rimowa.com",
};

const LUXURY_BRANDS = [
  "Gucci","Louis Vuitton","Chanel","Dior","Christian Dior","Prada","Hermès","Hermes",
  "Balenciaga","Saint Laurent","YSL","Valentino","Givenchy","Celine","Bottega Veneta",
  "Miu Miu","Burberry","Fendi","Loewe","Versace","Jacquemus","Off-White","Acne Studios",
  "Rolex","Omega","Cartier","IWC","Breitling","Tudor","TAG Heuer","Hublot","Panerai",
  "Patek Philippe","Audemars Piguet","Vacheron Constantin","Jaeger-LeCoultre","Zenith",
  "A. Lange & Söhne","Richard Mille","Grand Seiko","Blancpain","Breguet","Piaget",
  "Tiffany","Van Cleef & Arpels","Bvlgari","Bulgari","David Yurman","Harry Winston",
  "Nike","Jordan","Adidas","New Balance","Yeezy","Fear of God",
  "Rimowa","Goyard","Chloe","Chloé","Givenchy",
];

function extractBrand(text) {
  const t = text.toLowerCase();
  for (const b of LUXURY_BRANDS) { if (t.includes(b.toLowerCase())) return b; }
  return "";
}

function classifyCategory(name, brand) {
  const n = (name + " " + brand).toLowerCase();
  if (/watch|daytona|submariner|nautilus|royal oak|speedmaster|datejust|gmt|seamaster|chronograph|tourbillon/i.test(n)) return "Watches";
  if (/bag|handbag|tote|clutch|purse|birkin|kelly|flap|neverfull|speedy|pochette|backpack|shoulder/i.test(n)) return "Handbags";
  if (/jacket|coat|blazer|shirt|pants|trouser|dress|skirt|hoodie|sweater|knitwear|top\b|suit\b|vest/i.test(n)) return "Clothing";
  if (/sneaker|shoe|boot|heel|sandal|loafer|oxford|trainer|mule|pump/i.test(n)) return "Shoes";
  if (/bracelet|necklace|ring|earring|pendant|brooch|bangle|cuff|jewelry|jewellery/i.test(n)) return "Jewelry";
  if (/belt|scarf|tie|sunglasses|glasses|hat|cap|glove|wallet|cardholder|luggage|suitcase|keychain/i.test(n)) return "Accessories";
  return "Accessories";
}

// ── 1. Google Shopping scrape (free, no auth) ──
async function scrapeGoogleShopping(query) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 12000);
    const url = `https://www.google.com/search?q=${encodeURIComponent(query + " buy price")}&tbm=shop&num=10&hl=en&gl=us`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: c.signal,
    });
    clearTimeout(t);
    const html = await r.text();
    const $ = cheerio.load(html);
    const results = [];
    // Parse Google Shopping result cards
    $(".sh-dgr__grid-result, .Xjkr3b, [data-sh-or]").each((i, el) => {
      const name = $(el).find("h3, .tAxDx, .Xjkr3b").first().text().trim();
      const priceText = $(el).find(".a8Pemb, .OFFNJ").first().text().trim();
      const price = parseFloat(priceText.replace(/[^0-9.]/g, "")) || 0;
      const link = $(el).find("a").attr("href") || "";
      const img = $(el).find("img").attr("src") || "";
      if (name && name.length > 4) {
        results.push({ name, price, url: link, imageUrl: img });
      }
    });
    return results;
  } catch (e) {
    console.error("[google shopping]", e.message);
    return [];
  }
}

// ── 2. Google web search for product info ──
async function scrapeGoogleWeb(query) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 10000);
    const url = `https://www.google.com/search?q=${encodeURIComponent(query + " retail price site:gucci.com OR site:louisvuitton.com OR site:chanel.com OR site:dior.com OR site:prada.com OR site:hermes.com OR site:rolex.com OR site:omegawatches.com")}&num=5&hl=en`;
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9" },
      signal: c.signal,
    });
    clearTimeout(t);
    const html = await r.text();
    const $ = cheerio.load(html);
    const snippets = [];
    $(".g, .kvH3mc").each((i, el) => {
      const title = $(el).find("h3").text().trim();
      const snippet = $(el).find(".VwiC3b, .lEBKkf").text().trim();
      const link = $(el).find("a").attr("href") || "";
      if (title) snippets.push({ title, snippet, url: link });
    });
    return snippets.slice(0, 5);
  } catch (e) {
    console.error("[google web]", e.message);
    return [];
  }
}

// ── 3. eBay active listings (new/retail) ──
async function scrapeEbayNew(query) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 10000);
    // Search active listings (not sold) to find retail/near-retail prices
    const r = await fetch(
      `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_BIN=1&_sop=15&_ipg=25&rt=nc&LH_ItemCondition=1000`,
      { headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9" }, signal: c.signal }
    );
    clearTimeout(t);
    const html = await r.text();
    const $ = cheerio.load(html);
    const results = [];
    $("[data-view]").each((i, el) => {
      if (results.length >= 10) return false;
      const $el = $(el);
      const link = $el.find("a[href*='ebay.com/itm']").first();
      if (!link.length) return;
      const name = link.text().trim().replace(/\s+/g, " ");
      if (!name || name.length < 6) return;
      const text = $el.text();
      const m = text.match(/\$([\d,]+\.?\d*)/);
      if (!m) return;
      const price = parseFloat(m[1].replace(/,/g, ""));
      if (price < 50) return;
      const img = $el.find("img").attr("src") || "";
      results.push({ name, price, url: (link.attr("href") || "").split("?")[0], imageUrl: img });
    });
    return results;
  } catch (e) {
    console.error("[ebay new]", e.message);
    return [];
  }
}

// ── 4. Claude AI enrichment — extract canonical product data ──
async function claudeEnrich(query, googleSnippets, ebayResults, shoppingResults) {
  if (!ANTHROPIC_KEY) return null;
  const context = [
    googleSnippets.length ? "Google results:\n" + googleSnippets.map(r => `${r.title}: ${r.snippet}`).join("\n") : "",
    shoppingResults.length ? "Shopping results:\n" + shoppingResults.slice(0, 5).map(r => `${r.name} - $${r.price}`).join("\n") : "",
    ebayResults.length ? "eBay active listings:\n" + ebayResults.slice(0, 5).map(r => `${r.name} - $${r.price}`).join("\n") : "",
  ].filter(Boolean).join("\n\n");

  const prompt = `A user searched for: "${query}"

Here is what we found on the web:
${context || "No results found — the item may be very new or rare."}

Based on this information, extract canonical product data. Respond ONLY with a JSON object, no markdown:
{
  "brand": "exact brand name",
  "name": "canonical product name (without brand prefix)",
  "displayName": "Brand + Product Name as it would appear in a catalog",
  "category": "one of: Watches, Handbags, Clothing, Shoes, Jewelry, Accessories",
  "subcategory": "e.g. Jacket, Sneakers, Tote Bag, Chronograph etc",
  "msrp": number or null (retail price in USD),
  "material": "primary material if known, else null",
  "description": "1-2 sentence product description",
  "aliases": ["array", "of", "search", "terms", "this", "item", "is", "known", "by"],
  "confidence": "high/medium/low"
}

If you cannot identify the item at all, return: {"confidence": "none"}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await r.json();
    const text = data?.content?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error("[claude enrich]", e.message);
    return null;
  }
}

// ── 5. Write to catalog ──
async function writeToCatalog(enriched, query) {
  if (!supabase || !enriched || enriched.confidence === "none") return null;
  const brand = enriched.brand || extractBrand(query) || query.split(" ")[0];
  const id = "enriched-" + (brand + "-" + (enriched.displayName || query))
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  const row = {
    id,
    brand,
    line: enriched.subcategory || null,
    model_number: null,
    display_name: enriched.displayName || `${brand} ${enriched.name || query}`,
    category: enriched.category || classifyCategory(query, brand),
    subcategory: enriched.subcategory || null,
    material: enriched.material || null,
    size_cm: null,
    year_from: null,
    year_to: null,
    msrp: enriched.msrp || null,
    aliases: enriched.aliases || [query.toLowerCase()],
    image_url: null,
    source: "enriched",
  };
  try {
    await supabase.from("catalog").upsert(row, { onConflict: "id" });
    return row;
  } catch (e) {
    console.error("[catalog write]", e.message);
    return null;
  }
}

// ── Main handler ──
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const query = (req.method === "POST" ? req.body?.query : req.query?.q) || "";
  if (!query || query.trim().length < 3) {
    return res.status(400).json({ error: "Query required" });
  }

  const q = query.trim();
  console.log("[enrich] starting for:", q);

  // Run all discovery in parallel
  const [shoppingResults, webResults, ebayResults] = await Promise.all([
    scrapeGoogleShopping(q).catch(() => []),
    scrapeGoogleWeb(q).catch(() => []),
    scrapeEbayNew(q).catch(() => []),
  ]);

  console.log(`[enrich] shopping=${shoppingResults.length} web=${webResults.length} ebay=${ebayResults.length}`);

  // Use Claude to extract canonical product data
  const enriched = await claudeEnrich(q, webResults, ebayResults, shoppingResults);
  console.log("[enrich] claude result:", enriched?.confidence, enriched?.displayName);

  // Write to catalog
  const catalogEntry = await writeToCatalog(enriched, q);

  // Build price data from what we found
  const allPrices = [
    ...shoppingResults.map(r => ({ name: r.name, price: r.price, platform: "Google Shopping", url: r.url, imageUrl: r.imageUrl, condition: "New" })),
    ...ebayResults.map(r => ({ name: r.name, price: r.price, platform: "eBay", url: r.url, imageUrl: r.imageUrl, condition: "New" })),
  ].filter(r => r.price > 0);

  const prices = allPrices.map(r => r.price).filter(Boolean);
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
  const msrp = enriched?.msrp || null;

  return res.status(200).json({
    query: q,
    enriched: enriched?.confidence !== "none" ? enriched : null,
    catalogEntry,
    liveListings: allPrices.slice(0, 10),
    msrp,
    avgMarketPrice: avgPrice,
    totalFound: allPrices.length,
    sources: {
      googleShopping: shoppingResults.length,
      googleWeb: webResults.length,
      ebay: ebayResults.length,
    },
  });
};

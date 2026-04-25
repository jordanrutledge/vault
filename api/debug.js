const fetch = require("node-fetch");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const PLATFORMS = [
  // Known Shopify sites - test suggest.json
  { name: "Yoogi's Closet", type: "shopify", url: "https://www.yoogiscloset.com/search/suggest.json?q=chanel+flap&resources[type]=product&resources[limit]=3" },
  { name: "Rebag", type: "shopify", url: "https://shop.rebag.com/search/suggest.json?q=hermes+birkin&resources[type]=product&resources[limit]=3" },
  { name: "LuxeDH", type: "shopify", url: "https://www.luxedh.com/search/suggest.json?q=rolex+daytona&resources[type]=product&resources[limit]=3" },
  { name: "Authenticate First", type: "shopify", url: "https://www.authenticatedfirst.com/search/suggest.json?q=chanel+bag&resources[type]=product&resources[limit]=3" },
  { name: "Madison Avenue Couture", type: "shopify", url: "https://www.madisonavenuecouture.com/search/suggest.json?q=hermes&resources[type]=product&resources[limit]=3" },
  { name: "Bag Borrow or Steal", type: "shopify", url: "https://www.bagborroworsteal.com/search/suggest.json?q=louis+vuitton&resources[type]=product&resources[limit]=3" },
  { name: "WGACA", type: "shopify", url: "https://www.whatgoesaroundnyc.com/search/suggest.json?q=chanel&resources[type]=product&resources[limit]=3" },
  { name: "SacLab", type: "shopify", url: "https://www.saclab.com/search/suggest.json?q=chanel+flap&resources[type]=product&resources[limit]=3" },
  { name: "Privé Porter", type: "shopify", url: "https://www.priveporter.com/search/suggest.json?q=hermes+birkin&resources[type]=product&resources[limit]=3" },
  { name: "Ann's Fabulous Finds", type: "shopify", url: "https://www.annsfabulousfinds.com/search/suggest.json?q=chanel+bag&resources[type]=product&resources[limit]=3" },
  { name: "Luxury Exchange", type: "shopify", url: "https://www.theluxuryexchange.com/search/suggest.json?q=rolex&resources[type]=product&resources[limit]=3" },
  { name: "Bob's Watches", type: "shopify", url: "https://www.bobswatches.com/search/suggest.json?q=rolex+daytona&resources[type]=product&resources[limit]=3" },
  { name: "Crown & Caliber", type: "shopify", url: "https://www.crownandcaliber.com/search/suggest.json?q=rolex+daytona&resources[type]=product&resources[limit]=3" },
  { name: "Govberg", type: "shopify", url: "https://www.govberg.com/search/suggest.json?q=rolex&resources[type]=product&resources[limit]=3" },
  { name: "Beladora", type: "shopify", url: "https://www.beladora.com/search/suggest.json?q=cartier&resources[type]=product&resources[limit]=3" },
  { name: "The Luxury Closet", type: "api", url: "https://theluxurycloset.com/us-en/search?q=rolex+daytona&format=json" },
  { name: "Vestiaire Collective", type: "api", url: "https://www.vestiairecollective.com/api/search.json?q=chanel+flap&locale=en_US" },
];

async function testPlatform(platform) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8000);
    const r = await fetch(platform.url, {
      headers: { "User-Agent": UA, Accept: "application/json, text/html, */*", "Accept-Language": "en-US,en;q=0.9" },
      signal: c.signal,
      redirect: "follow",
    });
    clearTimeout(t);
    const text = await r.text();
    
    let productCount = 0;
    let samplePrice = null;
    let sampleTitle = null;

    if (platform.type === "shopify") {
      try {
        const data = JSON.parse(text);
        const products = data?.resources?.results?.products || [];
        productCount = products.length;
        if (products[0]) {
          sampleTitle = products[0].title?.substring(0, 60);
          samplePrice = products[0].price;
        }
      } catch (e) {}
    } else {
      // For non-Shopify, just check if response looks useful
      productCount = text.includes("price") ? -1 : 0; // -1 means "has price data, needs custom parser"
    }

    return {
      name: platform.name,
      status: r.status,
      ok: r.status === 200,
      products: productCount,
      sampleTitle,
      samplePrice,
      bodyLength: text.length,
      isJson: text.trim().startsWith("{") || text.trim().startsWith("["),
    };
  } catch (e) {
    return { name: platform.name, status: 0, ok: false, products: 0, error: e.message };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  const results = await Promise.all(PLATFORMS.map(testPlatform));
  const working = results.filter(r => r.ok && r.products > 0);
  const partial = results.filter(r => r.ok && r.products === 0);
  const failed = results.filter(r => !r.ok);

  return res.status(200).json({ working, partial, failed, timestamp: new Date().toISOString() });
};

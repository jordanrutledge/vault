// Load .env for local script execution
require('dotenv').config({ path: __dirname + '/.env' });
const https  = require('https');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://khbgwxhoxtdmkwcuwotc.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SOURCES = [
  { name: 'Hodinkee Shop',      domain: 'shop.hodinkee.com' },
  { name: 'Analog Shift',       domain: 'www.analogshift.com' },
  { name: 'Wrist Aficionado',   domain: 'www.wristaficionado.com' },
  { name: "Long's Jewelers",    domain: 'www.longsjewelers.com' },
  { name: 'Raymond Lee',        domain: 'www.raymondleejewelers.net' },
  { name: 'Opulent Jewelers',   domain: 'www.opulentjewelers.com' },
  { name: 'Beladora',           domain: 'www.beladora.com' },
  { name: 'LuxeDH',             domain: 'www.luxedh.com' },
  { name: 'The Watch Preserve', domain: 'www.thewatchpreserve.com' },
];

const LUXURY_BRANDS = new Set([
  'rolex','omega','patek philippe','audemars piguet','breitling','cartier',
  'iwc','panerai','tag heuer','tudor','hublot','jaeger-lecoultre',
  'vacheron constantin','a. lange','zenith','seiko','grand seiko',
  'hamilton','longines','oris','nomos','blancpain','breguet',
  'hermès','hermes','chanel','louis vuitton','gucci','prada','dior',
  'christian dior','goyard','bottega veneta','celine','fendi','loewe',
  'givenchy','saint laurent','balenciaga','valentino','chloe',
  'van cleef','tiffany','bulgari','chopard','piaget',
  'richard mille','montblanc','tissot',
]);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetchJSON(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    }, res => {
      const bufs = [];
      res.on('data', c => bufs.push(c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(bufs).toString('utf8')) }); }
        catch { resolve({ status: res.statusCode, json: null }); }
      });
    });
    req.on('error', () => resolve({ status: 0, json: null }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, json: null }); });
  });
}

function isLuxury(vendor, title) {
  const v = (vendor + ' ' + title).toLowerCase();
  return [...LUXURY_BRANDS].some(b => v.includes(b));
}

function detectCategory(title, ptype) {
  const t = (title + ' ' + ptype).toLowerCase();
  if (/watch|timepiece|chronograph|submariner|daytona|datejust|seamaster|navitimer/.test(t)) return 'Watches';
  if (/bag|handbag|tote|clutch|satchel|birkin|kelly|neverfull|speedy|pochette|purse/.test(t)) return 'Handbags';
  if (/bracelet|necklace|ring|earring|pendant|brooch|bangle|cuff|choker|jewel/.test(t)) return 'Jewelry';
  if (/shoe|sneaker|boot|heel|loafer|sandal|mule/.test(t)) return 'Shoes';
  return 'Accessories';
}

function canonId(source, vendor, title) {
  const base = (source + '-' + vendor + '-' + title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 70);
  return 'ex-' + base.replace(/^-|-$/g, '');
}

async function scrapeDomain(domain, sourceName) {
  const seen = new Map();
  let page = 1;
  let empty = 0;
  while (true) {
    const url = 'https://' + domain + '/products.json?limit=250&page=' + page;
    const r = await fetchJSON(url);
    if (r.status !== 200 || !r.json?.products?.length) {
      if (++empty >= 2) break;
      await sleep(2000); continue;
    }
    for (const p of r.json.products) {
      const vendor = p.vendor || '';
      const title  = p.title  || '';
      if (!isLuxury(vendor, title)) continue;
      const id = canonId(sourceName, vendor, title);
      if (!seen.has(id)) {
        const price = parseFloat(p.variants?.[0]?.price) || null;
        seen.set(id, {
          id, brand: vendor, line: null, model_number: p.variants?.[0]?.sku || null,
          display_name: title, category: detectCategory(title, p.product_type || ''),
          subcategory: null, material: null, size_cm: null,
          year_from: null, year_to: null,
          msrp: price, aliases: [title.toLowerCase(), (vendor + ' ' + title).toLowerCase()],
          image_url: p.images?.[0]?.src || null,
          source: sourceName.toLowerCase().replace(/\s+/g, '-'),
        });
      }
    }
    process.stdout.write('.');
    page++;
    await sleep(400);
    if (r.json.products.length < 250) break;
  }
  return [...seen.values()];
}

async function upsert(rows) {
  const { error } = await supabase.from('catalog').upsert(rows, { onConflict: 'id' });
  if (error) console.error('\n  upsert error:', error.message);
}

async function main() {
  let grandTotal = 0;
  for (const src of SOURCES) {
    process.stdout.write('\n[' + src.name + '] scraping ');
    const rows = await scrapeDomain(src.domain, src.name);
    process.stdout.write(' ' + rows.length + ' luxury items -> ');
    if (!rows.length) { process.stdout.write('skip\n'); continue; }
    for (let i = 0; i < rows.length; i += 100) await upsert(rows.slice(i, i+100));
    grandTotal += rows.length;
    console.log('upserted (running: ' + grandTotal + ')');
    await sleep(1000);
  }
  console.log('\nAll sources done: ' + grandTotal + ' additional catalog entries');
}

main().catch(console.error);

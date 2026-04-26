#!/usr/bin/env node
// WatchBase Catalog Ingestion
// Uses Buffer.from(hex) to build tag strings at runtime — avoids terminal rendering issues
const https  = require('https');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://khbgwxhoxtdmkwcuwotc.supabase.co';
const SUPABASE_KEY = 'REDACTED_SERVICE_KEY';
const WB_KEY        = 'B4PMCSMEXeGo1c0Lpk5HmEQw2bKhSqaIwzhuJ9cy';
const supabase      = createClient(SUPABASE_URL, SUPABASE_KEY);

// Tag strings built from hex bytes to survive terminal/shell escaping
const N_OPEN    = Buffer.from('3c6e616d653e','hex').toString();      // <n>
const N_CLOSE   = Buffer.from('3c2f6e616d653e','hex').toString();    // </n>
const CDATA_O   = Buffer.from('3c215b43444154415b','hex').toString(); // <![CDATA[
const CDATA_C   = Buffer.from('5d5d3e','hex').toString();             // ]]>
const B_OPEN    = Buffer.from('3c6272616e643e','hex').toString();     // <brand>
const B_CLOSE   = Buffer.from('3c2f6272616e643e','hex').toString();  // </brand>
const F_OPEN    = Buffer.from('3c66616d696c793e','hex').toString();   // <family>
const F_CLOSE   = Buffer.from('3c2f66616d696c793e','hex').toString();// </family>
const W_OPEN    = Buffer.from('3c7761746368','hex').toString() + '>';  // <watch>
const W_CLOSE   = Buffer.from('3c2f7761746368','hex').toString() + '>'; // </watch>
const ID_OPEN   = Buffer.from('3c6964','hex').toString() + '>';        // <id>
const ID_CLOSE  = Buffer.from('3c2f6964','hex').toString() + '>';      // </id>
const REF_OPEN  = Buffer.from('3c7265666e72','hex').toString() + '>';  // <refnr>
const REF_CLOSE = Buffer.from('3c2f7265666e72','hex').toString() + '>'; // </refnr>
const TH_OPEN   = Buffer.from('3c7468756d62','hex').toString() + '>';   // <thumb>
const TH_CLOSE  = Buffer.from('3c2f7468756d62','hex').toString() + '>'; // </thumb>

const LUXURY = new Set([
  'a. lange & söhne','audemars piguet','bell & ross','blancpain','breguet',
  'breitling','bulgari','baume & mercier','carl f. bucherer','cartier',
  'chopard','corum','frederique constant','girard-perregaux','glashütte original',
  'grand seiko','hamilton','hublot','iwc','jaeger-lecoultre','longines',
  'mido','montblanc','nomos','omega','oris','panerai','patek philippe',
  'piaget','richard mille','rolex','seiko','tag heuer','tissot','tudor',
  'ulysse nardin','vacheron constantin','zenith',
]);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function re(open, close) { return new RegExp(open + '([\\s\\S]*?)' + close); }
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function between(str, open, close) {
  const r = re(esc(open), esc(close));
  const m = str.match(r);
  return m ? m[1].trim() : '';
}

function allBetween(str, open, close) {
  const r = new RegExp(esc(open) + '[\\s\\S]*?' + esc(close), 'g');
  return str.match(r) || [];
}

function extractName(block) {
  // CDATA: <n><![CDATA[...]]></n>
  const cm = block.match(re(esc(N_OPEN + CDATA_O), esc(CDATA_C + N_CLOSE)));
  if (cm) return cm[1].trim();
  return between(block, N_OPEN, N_CLOSE);
}

function subcat(name, family) {
  const n = (name + ' ' + family).toLowerCase();
  if (/submariner|gmt|diver|aquanaut|offshore|seamaster|pelagos/.test(n)) return 'Sport';
  if (/daytona|cosmograph|chrono|navitimer|carrera/.test(n)) return 'Chronograph';
  if (/datejust|day.date|calatrava|tradition/.test(n)) return 'Dress';
  if (/tourbillon|perpetual.cal/.test(n)) return 'Complication';
  if (/pilot|aviator|portofino|portugieser/.test(n)) return 'Pilot';
  return 'Luxury';
}

function fetchXML(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'VaultBot/1.0' } }, res => {
      const bufs = [];
      res.on('data', c => bufs.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on('end', () => resolve(Buffer.concat(bufs).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function getAllBrands() {
  const xml = await fetchXML('https://api.watchbase.com/v1/brands?key=' + WB_KEY);
  const blocks = allBetween(xml, B_OPEN, B_CLOSE);
  const all = blocks.map(b => ({ id: between(b, ID_OPEN, ID_CLOSE), name: extractName(b) }));
  console.log('total brands:', all.length, 'sample:', all.slice(0,3).map(b=>b.name));
  return all.filter(b => b.name && LUXURY.has(b.name.toLowerCase()));
}

async function getFamilies(brandId) {
  const xml = await fetchXML('https://api.watchbase.com/v1/families?key=' + WB_KEY + '&brand-id=' + brandId);
  return allBetween(xml, F_OPEN, F_CLOSE).map(f => ({ id: between(f,ID_OPEN,ID_CLOSE), name: extractName(f) }));
}

async function getWatches(brandId, familyId) {
  let url = 'https://api.watchbase.com/v1/watches?key=' + WB_KEY + '&brand-id=' + brandId;
  if (familyId) url += '&family-id=' + familyId;
  const xml = await fetchXML(url);
  return allBetween(xml, W_OPEN, W_CLOSE).map(w => {
    const bb = allBetween(w, B_OPEN, B_CLOSE)[0] || '';
    const fb = allBetween(w, F_OPEN, F_CLOSE)[0] || '';
    return {
      id: between(w,ID_OPEN,ID_CLOSE), refnr: between(w,REF_OPEN,REF_CLOSE),
      name: extractName(w), brandName: extractName(bb), familyName: extractName(fb),
      thumb: between(w,TH_OPEN,TH_CLOSE),
    };
  });
}

function buildRow(w, fallbackBrand) {
  const brand  = w.brandName  || fallbackBrand;
  const family = w.familyName || '';
  const parts  = [brand, family !== brand ? family : '', w.name]
    .filter(Boolean).filter((v,i,a) => a.indexOf(v)===i);
  const displayName = parts.join(' ').replace(/\s+/g,' ').trim();
  const aliases = [...new Set([
    w.refnr, w.name, family, brand+' '+w.refnr, brand+' '+w.name, family+' '+w.refnr,
  ].filter(Boolean).map(a => a.toLowerCase()))];
  return {
    id: 'wb-'+w.id, brand, line: family||null, model_number: w.refnr||null,
    display_name: displayName, category: 'Watches', subcategory: subcat(w.name,family),
    material: null, size_cm: null, year_from: null, year_to: null, msrp: null,
    aliases, image_url: w.thumb||null, source: 'watchbase',
  };
}

async function upsert(rows) {
  const { error } = await supabase.from('catalog').upsert(rows, { onConflict: 'id' });
  if (error) console.error('  upsert error:', error.message);
}

async function main() {
  console.log('=== WatchBase Ingestion ===');
  const brands = await getAllBrands();
  console.log(brands.length + ' luxury brands: ' + brands.map(b=>b.name).join(', ') + '\n');

  let total = 0;
  for (const brand of brands) {
    process.stdout.write('[' + brand.name + '] ');
    await sleep(350);
    let watches = await getWatches(brand.id, null).catch(() => []);
    if (watches.length === 0) {
      const families = await getFamilies(brand.id).catch(() => []);
      process.stdout.write('(' + families.length + ' fam) ');
      for (const fam of families) {
        await sleep(200);
        const fw = await getWatches(brand.id, fam.id).catch(() => []);
        watches.push(...fw);
      }
    }
    process.stdout.write(watches.length + ' watches');
    if (!watches.length) { process.stdout.write(' skip\n'); continue; }
    const rows = watches.map(w => buildRow(w, brand.name));
    for (let i=0; i<rows.length; i+=100) await upsert(rows.slice(i,i+100));
    total += rows.length;
    console.log(' -> done (total: ' + total + ')');
  }
  console.log('\nComplete: ' + total + ' watch entries');
}

main().catch(console.error);

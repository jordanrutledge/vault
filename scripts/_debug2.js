// Standalone brand parse test using exact same code as ingest-watchbase.js
const https = require("https");

const LUXURY_BRANDS = [
  "A. Lange & Söhne","Audemars Piguet","Rolex","Omega","IWC","Tudor","Breitling",
];

function brandBlocks(xml) { return xml.match(/<brand>[\s\S]*?<\/brand>/g) || []; }

function val(block, tag) {
  const cdataPat = new RegExp("<" + tag + ">\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/" + tag + ">");
  const cm = block.match(cdataPat);
  if (cm) return cm[1].trim();
  const plainPat = new RegExp("<" + tag + ">([^<]*)<\\/" + tag + ">");
  const pm = block.match(plainPat);
  return pm ? pm[1].trim() : "";
}

https.get("https://api.watchbase.com/v1/brands?key=B4PMCSMEXeGo1c0Lpk5HmEQw2bKhSqaIwzhuJ9cy", res => {
  let d = ""; res.on("data", c => d += c);
  res.on("end", () => {
    const blocks = brandBlocks(d);
    console.log("blocks:", blocks.length);
    const all = blocks.map(b => ({ id: val(b, "id"), name: val(b, "n") }));
    console.log("sample:", all.slice(0, 6));
    // check filter
    const filtered = all.filter(b => LUXURY_BRANDS.some(lb => lb.toLowerCase() === b.name.toLowerCase()));
    console.log("filtered:", filtered);
    // manual check
    const rolexBlock = blocks.find(b => b.includes("Rolex"));
    console.log("Rolex block:", rolexBlock ? JSON.stringify(rolexBlock) : "NOT FOUND");
  });
});

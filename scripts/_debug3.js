// Final extraction test — directly from file
const block = "<brand>\n\t\t\t<id>54</id>\n\t\t\t<n>Rolex</n>\n\t\t</brand>";
const block2 = "<brand>\n\t\t\t<id>68</id>\n\t\t\t<n><![CDATA[A. Lange & Söhne]]></n>\n\t\t</brand>";

function extract(b, tag) {
  if (tag === "n") {
    let m = b.match(/<n>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/n>/);
    if (m) return m[1].trim();
    m = b.match(/<n>([\s\S]*?)<\/n>/);
    return m ? m[1].trim() : "";
  }
  if (tag === "id") {
    const m = b.match(/<id>([\s\S]*?)<\/id>/);
    return m ? m[1].trim() : "";
  }
}

console.log("Rolex name:", JSON.stringify(extract(block, "n")));
console.log("Rolex id:", JSON.stringify(extract(block, "id")));
console.log("Lange name:", JSON.stringify(extract(block2, "n")));

const LUXURY_BRANDS = new Set(["rolex", "omega"]);
const brands = [
  { id: extract(block, "id"), name: extract(block, "n") },
  { id: extract(block2, "id"), name: extract(block2, "n") },
];
console.log("brands:", brands);
console.log("filtered:", brands.filter(b => LUXURY_BRANDS.has(b.name.toLowerCase())));

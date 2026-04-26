// Test val() against real blocks
const block1 = "<brand>\n\t\t\t<id>68</id>\n\t\t\t<n><![CDATA[A. Lange & Söhne]]></n>\n\t\t</brand>";
const block2 = "<brand>\n\t\t\t<id>59</id>\n\t\t\t<n>Audemars Piguet</n>\n\t\t</brand>";

function val(block, tag) {
  const cdataPat = new RegExp("<" + tag + ">\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/" + tag + ">");
  const cm = block.match(cdataPat);
  if (cm) return cm[1].trim();
  const plainPat = new RegExp("<" + tag + ">([^<]*)<\\/" + tag + ">");
  const pm = block.match(plainPat);
  return pm ? pm[1].trim() : "";
}

console.log("CDATA name:", val(block1, "n"));
console.log("Plain name:", val(block2, "n"));
console.log("ID from block1:", val(block1, "id"));
console.log("ID from block2:", val(block2, "id"));

// Now test filter
const LUXURY_BRANDS = ["Rolex","Omega","Audemars Piguet","A. Lange & Söhne"];
const brands = [
  { id: "68", name: val(block1, "n") },
  { id: "59", name: val(block2, "n") },
];
console.log("Brands:", brands);
const filtered = brands.filter(b => LUXURY_BRANDS.some(lb => lb.toLowerCase() === b.name.toLowerCase()));
console.log("Filtered:", filtered);

// Quick debug: test brand parsing from WatchBase
const https = require("https");

https.get("https://api.watchbase.com/v1/brands?key=B4PMCSMEXeGo1c0Lpk5HmEQw2bKhSqaIwzhuJ9cy", res => {
  let d = "";
  res.on("data", c => d += c);
  res.on("end", () => {
    // Use literal regex for block splitting — avoids RegExp constructor escaping issues
    const blocks = d.match(/<brand>[\s\S]*?<\/brand>/g) || [];

    function val(block, tag) {
      // CDATA variant
      const cdataPat = new RegExp("<" + tag + ">\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/" + tag + ">");
      const cm = block.match(cdataPat);
      if (cm) return cm[1].trim();
      // Plain text variant
      const plainPat = new RegExp("<" + tag + ">([^<]*)<\\/" + tag + ">");
      const pm = block.match(plainPat);
      return pm ? pm[1].trim() : "";
    }

    const brands = blocks.map(b => ({ id: val(b, "id"), name: val(b, "n") }));
    console.log("Total brands:", brands.length);
    const luxury = brands.filter(b => /rolex|omega|audemars|patek|breitling|iwc|tudor|hublot|cartier|tag heuer/i.test(b.name));
    console.log("Luxury sample:", luxury);
  });
});

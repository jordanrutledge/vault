const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Canonical brand/subcat lists for sidebar facets
const BRAND_MAP = {
  Watches:            ["Rolex","Omega","Longines","Breitling","Cartier","Seiko","TAG Heuer","Hublot","Patek Philippe","Audemars Piguet","IWC","Panerai","Tudor","Jaeger-LeCoultre","Zenith","Oris","Vacheron Constantin","Hamilton","Grand Seiko","Blancpain","Breguet","Piaget","Richard Mille","A. Lange & Söhne"],
  Handbags:           ["Louis Vuitton","Chanel","Hermès","Gucci","Prada","Dior","Saint Laurent","Bottega Veneta","Celine","Goyard","Fendi","Loewe","Miu Miu","Balenciaga","Givenchy","Valentino","Chloe","Burberry"],
  Jewelry:            ["Cartier","Van Cleef & Arpels","Tiffany","Bulgari","Chanel","Chopard","David Yurman","Harry Winston"],
  Shoes:              ["Christian Louboutin","Gucci","Prada","Chanel","Louis Vuitton","Valentino","Balenciaga","Saint Laurent","Dior","Manolo Blahnik"],
  "Small Leather Goods": ["Louis Vuitton","Hermès","Chanel","Gucci","Prada","Goyard"],
};
const SUBCAT_MAP = {
  Watches:  ["Sport","Chronograph","Dress","Pilot","Complication"],
  Handbags: ["Birkin","Kelly","Classic Flap","Boy Bag","Neverfull","Speedy","Pochette","Wallet on Chain","Shoulder Bag","Tote","Crossbody","Clutch","Backpack"],
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!supabase) return res.status(500).json({ error: "Supabase not configured" });

  const {
    category, brand, subcategory,
    q, page = "1", limit = "48", sort = "popular",
    price_min, price_max,
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page) || 1);
  const pageSize = Math.min(96, Math.max(12, parseInt(limit) || 48));
  const offset   = (pageNum - 1) * pageSize;

  try {
    // ── Main query ──
    let query = supabase
      .from("catalog")
      .select("id, brand, line, model_number, display_name, category, subcategory, material, size_cm, msrp, image_url, source, aliases", { count: "exact" });

    // Category
    if (category && category !== "All") query = query.eq("category", category);
    else query = query.neq("category", "Accessories");

    // Brand — support comma-separated multi-brand
    if (brand) {
      const brands = brand.split(",").map(b => b.trim()).filter(Boolean);
      if (brands.length === 1) query = query.ilike("brand", `%${brands[0]}%`);
      else query = query.in("brand", brands);
    }

    // Subcategory
    if (subcategory) query = query.eq("subcategory", subcategory);

    // Price range (msrp is stored as text in some rows — cast to numeric)
    if (price_min) query = query.gte("msrp", price_min);
    if (price_max) query = query.lte("msrp", price_max);

    // ── Text search: try trigram similarity first, fall back to ilike ──
    if (q && q.trim()) {
      const sq = q.trim();
      // Use ilike with OR across key fields — hits the GIN indexes
      // For reference numbers (e.g. "116500") match model_number exactly
      const isRef = /^[a-z0-9]{4,12}$/i.test(sq.replace(/\s/g, ""));
      if (isRef) {
        query = query.or(`model_number.ilike.%${sq}%,display_name.ilike.%${sq}%`);
      } else {
        // Multi-word: split and require all words to appear in display_name
        const words = sq.split(/\s+/).filter(Boolean);
        if (words.length === 1) {
          query = query.or(`display_name.ilike.%${sq}%,brand.ilike.%${sq}%,model_number.ilike.%${sq}%`);
        } else {
          // Chain all words into ilike filters (AND semantics — all must match)
          for (const w of words) {
            query = query.ilike("display_name", `%${w}%`);
          }
        }
      }
    }

    // Sort
    switch (sort) {
      case "price-high": query = query.order("msrp", { ascending: false, nullsFirst: false }); break;
      case "price-low":  query = query.order("msrp", { ascending: true,  nullsFirst: false }); break;
      case "name":       query = query.order("display_name", { ascending: true }); break;
      default:
        // "popular": items with images first, then MSRP, then brand alpha
        query = query
          .order("image_url", { ascending: false, nullsFirst: false })
          .order("msrp",       { ascending: false, nullsFirst: false })
          .order("brand",      { ascending: true });
    }

    query = query.range(offset, offset + pageSize - 1);

    const { data: items, count, error } = await query;
    if (error) throw error;

    // ── Signal frontend to try live scraper if catalog is empty for a text query ──
    const totalFound = count || 0;
    const shouldEnrich = totalFound === 0 && q && q.trim().length > 2;

    // ── Brand facet counts ──
    let brandFacets = [];
    if (category && category !== "All") {
      let bq = supabase.from("catalog").select("brand").eq("category", category);
      if (subcategory) bq = bq.eq("subcategory", subcategory);
      if (q) bq = bq.ilike("display_name", `%${q.trim()}%`);
      const { data: bRows } = await bq;
      const bc = {};
      (bRows || []).forEach(r => { bc[r.brand] = (bc[r.brand] || 0) + 1; });
      brandFacets = Object.entries(bc).sort((a,b) => b[1]-a[1]).slice(0, 30).map(([name,cnt]) => ({ name, count: cnt }));
    }

    // ── Subcategory facet counts ──
    let subcatFacets = [];
    if (category && category !== "All") {
      let sq2 = supabase.from("catalog").select("subcategory").eq("category", category).not("subcategory","is",null);
      if (brand) sq2 = sq2.ilike("brand", `%${brand}%`);
      if (q) sq2 = sq2.ilike("display_name", `%${q.trim()}%`);
      const { data: sRows } = await sq2;
      const sc = {};
      (sRows || []).forEach(r => { if (r.subcategory) sc[r.subcategory] = (sc[r.subcategory] || 0) + 1; });
      subcatFacets = Object.entries(sc).sort((a,b) => b[1]-a[1]).map(([name,cnt]) => ({ name, count: cnt }));
    }

    return res.status(200).json({
      items:       items || [],
      total:       totalFound,
      page:        pageNum,
      pageSize,
      totalPages:  Math.ceil(totalFound / pageSize),
      enriching:   shouldEnrich,
      facets: {
        brands:           brandFacets,
        subcategories:    subcatFacets,
        suggestedBrands:  BRAND_MAP[category] || [],
        suggestedSubcats: SUBCAT_MAP[category] || [],
      },
    });

  } catch (e) {
    console.error("[catalog]", e.message);
    return res.status(500).json({ error: e.message });
  }
};

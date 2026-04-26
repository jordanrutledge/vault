const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Canonical brand lists per category (for facet sidebar)
const BRAND_CATEGORIES = {
  Watches: ["Rolex","Omega","Longines","Breitling","Cartier","Seiko","TAG Heuer","Hublot","Patek Philippe","Audemars Piguet","IWC","Panerai","Tudor","Jaeger-LeCoultre","Zenith","Oris","Vacheron Constantin","Hamilton","Grand Seiko","Blancpain","Breguet","Piaget","Richard Mille","A. Lange & Söhne"],
  Handbags: ["Louis Vuitton","Chanel","Hermès","Gucci","Prada","Dior","Saint Laurent","Bottega Veneta","Celine","Goyard","Fendi","Loewe","Miu Miu","Balenciaga","Givenchy","Valentino","Chloe","Burberry"],
  Jewelry:  ["Cartier","Van Cleef & Arpels","Tiffany","Bulgari","Chanel","Chopard","David Yurman","Harry Winston","Graff","Mikimoto"],
  Shoes:    ["Christian Louboutin","Gucci","Prada","Chanel","Louis Vuitton","Valentino","Balenciaga","Saint Laurent","Dior","Manolo Blahnik"],
};

const SUBCATEGORIES = {
  Watches:  ["Sport","Chronograph","Dress","Pilot","Complication","Luxury"],
  Handbags: ["Birkin","Kelly","Classic Flap","Boy Bag","Neverfull","Speedy","Pochette","Wallet on Chain","Shoulder Bag","Tote","Crossbody","Clutch","Backpack"],
  Jewelry:  [],
  Shoes:    [],
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!supabase) return res.status(500).json({ error: "Supabase not configured" });

  const {
    category,
    brand,
    subcategory,
    q,
    page = "1",
    limit = "48",
    sort = "popular",
  } = req.query;

  const pageNum = Math.max(1, parseInt(page) || 1);
  const pageSize = Math.min(96, Math.max(12, parseInt(limit) || 48));
  const offset = (pageNum - 1) * pageSize;

  try {
    // ── Main query ──
    let query = supabase
      .from("catalog")
      .select("id, brand, line, model_number, display_name, category, subcategory, material, size_cm, msrp, image_url, source, aliases", { count: "exact" });

    // Category filter
    if (category && category !== "All") {
      query = query.eq("category", category);
    } else {
      // Exclude 'Accessories' noise from default browse
      query = query.neq("category", "Accessories");
    }

    // Brand filter
    if (brand) {
      const brands = brand.split(",").map(b => b.trim()).filter(Boolean);
      if (brands.length === 1) query = query.ilike("brand", `%${brands[0]}%`);
      else query = query.in("brand", brands);
    }

    // Subcategory filter
    if (subcategory) {
      query = query.eq("subcategory", subcategory);
    }

    // Text search
    if (q && q.trim()) {
      // Use ilike on display_name for broad matching
      query = query.ilike("display_name", `%${q.trim()}%`);
    }

    // Sort
    if (sort === "price-high") query = query.order("msrp", { ascending: false, nullsFirst: false });
    else if (sort === "price-low") query = query.order("msrp", { ascending: true, nullsFirst: false });
    else if (sort === "name") query = query.order("display_name", { ascending: true });
    else {
      // Default: prioritize items with images and MSRPs (most complete records)
      query = query.order("source", { ascending: true }).order("brand", { ascending: true });
    }

    query = query.range(offset, offset + pageSize - 1);

    const { data: items, count, error } = await query;
    if (error) throw error;

    // ── Facet counts ──
    // Brand facet (for current category filter)
    let brandFacets = [];
    if (category && category !== "All") {
      let bq = supabase
        .from("catalog")
        .select("brand")
        .eq("category", category);
      if (q) bq = bq.ilike("display_name", `%${q}%`);
      if (subcategory) bq = bq.eq("subcategory", subcategory);
      const { data: brandRows } = await bq;
      const brandCounts = {};
      (brandRows || []).forEach(r => { brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1; });
      brandFacets = Object.entries(brandCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([name, count]) => ({ name, count }));
    }

    // Subcategory facet
    let subcatFacets = [];
    if (category && category !== "All") {
      let sq = supabase
        .from("catalog")
        .select("subcategory")
        .eq("category", category)
        .not("subcategory", "is", null);
      if (brand) sq = sq.ilike("brand", `%${brand}%`);
      if (q) sq = sq.ilike("display_name", `%${q}%`);
      const { data: subcatRows } = await sq;
      const subcatCounts = {};
      (subcatRows || []).forEach(r => { if (r.subcategory) subcatCounts[r.subcategory] = (subcatCounts[r.subcategory] || 0) + 1; });
      subcatFacets = Object.entries(subcatCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));
    }

    return res.status(200).json({
      items: items || [],
      total: count || 0,
      page: pageNum,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
      facets: {
        brands: brandFacets,
        subcategories: subcatFacets,
        suggestedBrands: BRAND_CATEGORIES[category] || [],
        suggestedSubcats: SUBCATEGORIES[category] || [],
      },
    });

  } catch (e) {
    console.error("[catalog]", e.message);
    return res.status(500).json({ error: e.message });
  }
};

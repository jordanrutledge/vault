const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!supabase) return res.status(500).json({ error: "Supabase not configured" });

  const q = (req.query.q || "").trim();
  const limit = Math.min(10, parseInt(req.query.limit) || 8);
  if (!q || q.length < 2) return res.status(200).json({ suggestions: [] });

  try {
    // 1. Brand matches — exact prefix first, then fuzzy
    const { data: brandRows } = await supabase
      .from("catalog")
      .select("brand, category")
      .ilike("brand", `${q}%`)
      .limit(50);

    const brandCounts = {};
    const brandCats = {};
    (brandRows || []).forEach(r => {
      brandCounts[r.brand] = (brandCounts[r.brand] || 0) + 1;
      if (!brandCats[r.brand]) brandCats[r.brand] = r.category;
    });

    const topBrands = Object.entries(brandCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([brand, count]) => ({
        type: "brand",
        label: brand,
        sublabel: `${count.toLocaleString()} items · ${brandCats[brand]}`,
        brand,
        count,
      }));

    // 2. Item matches — use pg_trgm similarity for fuzzy name/model search
    const { data: itemRows } = await supabase.rpc("search_catalog_suggest", {
      search_query: q,
      result_limit: limit,
    }).catch(() => ({ data: null }));

    // Fallback: plain ilike if RPC not available
    const { data: fallbackRows } = !itemRows ? await supabase
      .from("catalog")
      .select("id, brand, display_name, model_number, category, subcategory, msrp, image_url")
      .or(`display_name.ilike.%${q}%,model_number.ilike.%${q}%`)
      .not("category", "eq", "Accessories")
      .order("brand")
      .limit(limit * 3) : { data: null };

    const rows = itemRows || fallbackRows || [];

    // Deduplicate by brand+line/model and pick best representative per group
    const seen = new Set();
    const itemSuggestions = [];
    for (const row of rows) {
      const key = `${row.brand}|${row.model_number || row.display_name?.slice(0, 30)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      itemSuggestions.push({
        type: "item",
        label: row.display_name,
        sublabel: [row.brand, row.subcategory, row.model_number].filter(Boolean).join(" · "),
        brand: row.brand,
        category: row.category,
        msrp: row.msrp ? Number(row.msrp) : null,
        imageUrl: row.image_url || null,
        catalogId: row.id,
      });
      if (itemSuggestions.length >= limit - topBrands.length) break;
    }

    // Merge: brands first, then items
    const suggestions = [...topBrands, ...itemSuggestions].slice(0, limit);
    return res.status(200).json({ suggestions });

  } catch (e) {
    console.error("[suggest]", e.message);
    return res.status(500).json({ error: e.message });
  }
};

import { useState, useCallback, useEffect } from "react";

const API_URL = "";

const CONDITIONS = [
  { label: "New / Unworn", multiplier: 1.15, desc: "Tags attached, never used" },
  { label: "Excellent", multiplier: 1.0, desc: "Minimal signs of use" },
  { label: "Very Good", multiplier: 0.88, desc: "Light wear, fully functional" },
  { label: "Good", multiplier: 0.75, desc: "Moderate wear, some marks" },
  { label: "Fair", multiplier: 0.60, desc: "Visible wear, still functional" },
];

const POPULAR_SEARCHES = [
  "Rolex Daytona", "Hermès Birkin", "Chanel Classic Flap",
  "Cartier Love Bracelet", "Patek Philippe Nautilus",
  "Louis Vuitton Neverfull", "AP Royal Oak", "Van Cleef Alhambra",
  "Omega Speedmaster", "Goyard St Louis",
];

const CATEGORY_ICONS = { Watches: "⌚", Handbags: "👜", Jewelry: "💎", Shoes: "👟", Accessories: "✦" };

function fmt(n) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n); }

// localStorage helpers
function loadPortfolio() {
  try { return JSON.parse(localStorage.getItem("vault_portfolio") || "[]"); } catch { return []; }
}
function savePortfolio(items) {
  try { localStorage.setItem("vault_portfolio", JSON.stringify(items)); } catch {}
}
function loadItemCache() {
  try { return JSON.parse(localStorage.getItem("vault_items") || "[]"); } catch { return []; }
}
function saveItemCache(items) {
  try { localStorage.setItem("vault_items", JSON.stringify(items)); } catch {}
}

async function searchAPI(query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const resp = await fetch(`${API_URL}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 15 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    return {
      items: (data.items || []).map((item, i) => ({
        id: `api-${Date.now()}-${i}`,
        brand: item.brand || "Unknown",
        name: item.name || "Unknown Item",
        category: item.category || "Accessories",
        image: CATEGORY_ICONS[item.category] || "✦",
        avgPrice: item.avgPrice || 0,
        highPrice: item.highPrice || 0,
        lowPrice: item.lowPrice || 0,
        numListings: item.numListings || 0,
        sources: item.sources || [],
        imageUrl: item.imageUrl || null,
        sampleUrls: item.sampleUrls || [],
      })),
      platforms: data.platforms || {},
      totalListings: data.totalListings || 0,
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") throw new Error("Search timed out — try again");
    throw err;
  }
}

export default function LuxuryTracker() {
  const [view, setView] = useState("portfolio");
  const [owned, setOwned] = useState(() => loadPortfolio());
  const [searchResults, setSearchResults] = useState([]);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [conditionModal, setConditionModal] = useState(null);
  const [allItems, setAllItems] = useState(() => loadItemCache());
  const [platformInfo, setPlatformInfo] = useState(null);
  const [sortBy, setSortBy] = useState("relevance");
  const [filterCat, setFilterCat] = useState("All");

  // Persist portfolio changes
  useEffect(() => { savePortfolio(owned); }, [owned]);
  useEffect(() => { if (allItems.length) saveItemCache(allItems); }, [allItems]);

  const totalValue = owned.reduce((sum, o) => {
    const item = allItems.find(i => i.id === o.id);
    if (!item) return sum;
    return sum + item.avgPrice * (CONDITIONS.find(c => c.label === o.condition)?.multiplier || 1);
  }, 0);

  const handleSearch = useCallback(async () => {
    if (!search.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setPlatformInfo(null);
    try {
      const data = await searchAPI(search.trim());
      if (data.items.length === 0) {
        setSearchError("No results found. Try a different search term.");
      } else {
        setSearchResults(data.items);
        setPlatformInfo(data.platforms);
        setAllItems(prev => {
          const existing = new Set(prev.map(i => i.id));
          const merged = [...prev, ...data.items.filter(r => !existing.has(r.id))];
          return merged;
        });
      }
    } catch (err) {
      setSearchError(err.message || "Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }, [search]);

  function addOwned(itemId, condition) {
    setOwned(prev => [...prev.filter(o => o.id !== itemId), { id: itemId, condition, addedDate: new Date().toISOString() }]);
    setConditionModal(null);
  }
  function removeOwned(itemId) {
    setOwned(prev => prev.filter(o => o.id !== itemId));
    if (selectedItem?.id === itemId) setSelectedItem(null);
  }
  function isOwned(id) { return owned.some(o => o.id === id); }
  function getOwnedCond(id) { return owned.find(o => o.id === id)?.condition; }

  // Sort search results
  const sortedResults = [...searchResults].sort((a, b) => {
    if (sortBy === "price-high") return b.avgPrice - a.avgPrice;
    if (sortBy === "price-low") return a.avgPrice - b.avgPrice;
    if (sortBy === "listings") return b.numListings - a.numListings;
    return 0; // relevance = API order
  }).filter(item => filterCat === "All" || item.category === filterCat);

  const resultCategories = [...new Set(searchResults.map(i => i.category))];

  const ownedCats = new Set(owned.map(o => allItems.find(i => i.id === o.id)?.category).filter(Boolean));
  const sans = "'DM Sans', Helvetica, sans-serif";
  const serif = "'Instrument Serif', Georgia, 'Times New Roman', serif";
  const gold = "#d4af37";
  const goldA = a => `rgba(212,175,55,${a})`;
  const whiteA = a => `rgba(255,255,255,${a})`;

  // ── Render a search result card ──
  const renderItem = (item, idx) => {
    const io = isOwned(item.id);
    const oc = getOwnedCond(item.id);
    return (
      <div key={item.id} style={{ padding: 20, borderRadius: 14, background: io ? goldA(0.06) : whiteA(0.02), border: `1px solid ${io ? goldA(0.2) : whiteA(0.05)}`, transition: "all 0.2s" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: gold, fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em" }}>{item.brand}</span>
              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: whiteA(0.05), color: "#6a6560", fontFamily: sans }}>{item.category}</span>
            </div>
            <div style={{ fontSize: 16, marginTop: 2, letterSpacing: "-0.01em", lineHeight: 1.3 }}>{item.name}</div>
          </div>
          {item.imageUrl ? (
            <img src={item.imageUrl} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", marginLeft: 10, flexShrink: 0, background: whiteA(0.05) }} onError={e => { e.target.style.display = "none"; }} />
          ) : (
            <span style={{ fontSize: 28, opacity: 0.4, flexShrink: 0, marginLeft: 10 }}>{item.image}</span>
          )}
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 24, letterSpacing: "-0.02em", fontWeight: 400 }}>{fmt(item.avgPrice)}</div>
          <div style={{ fontSize: 11, color: "#6a6560", fontFamily: sans, marginTop: 3 }}>
            {fmt(item.lowPrice)} – {fmt(item.highPrice)}{item.numListings > 0 ? ` · ${item.numListings} listing${item.numListings !== 1 ? "s" : ""}` : ""}
          </div>
        </div>
        {item.sources?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
            {item.sources.map(s => (
              <span key={s} style={{ padding: "2px 8px", borderRadius: 8, fontSize: 10, background: goldA(0.06), border: `1px solid ${goldA(0.1)}`, fontFamily: sans, color: "#a09880" }}>{s}</span>
            ))}
          </div>
        )}
        {io ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: goldA(0.12), border: `1px solid ${goldA(0.25)}`, fontSize: 12, fontFamily: sans, color: gold, fontWeight: 600, textAlign: "center" }}>✓ In Vault · {oc}</div>
            <button onClick={() => removeOwned(item.id)} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.06)", color: "#f87171", cursor: "pointer", fontSize: 12, fontFamily: sans }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setConditionModal(item)}
            style={{ width: "100%", padding: "11px", borderRadius: 8, border: `1px solid ${goldA(0.25)}`, background: goldA(0.06), color: gold, cursor: "pointer", fontSize: 13, fontFamily: sans, fontWeight: 600, transition: "all 0.15s", letterSpacing: "0.02em" }}
            onMouseEnter={e => e.target.style.background = goldA(0.15)}
            onMouseLeave={e => e.target.style.background = goldA(0.06)}>
            + Add to Vault
          </button>
        )}
      </div>
    );
  };

  // ── Main render ──
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0b", color: "#e8e4df", fontFamily: serif, position: "relative" }}>
      <div style={{ position: "fixed", top: -200, right: -200, width: 600, height: 600, background: `radial-gradient(circle, ${goldA(0.06)} 0%, transparent 70%)`, pointerEvents: "none", zIndex: 0 }} />

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(10,10,11,0.85)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${goldA(0.12)}`, padding: "0 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 6, background: `linear-gradient(135deg, ${gold}, #a08520)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#0a0a0b", fontFamily: sans }}>V</div>
            <span style={{ fontSize: 19, letterSpacing: "-0.02em", color: gold }}>Vault</span>
          </div>
          <nav style={{ display: "flex", gap: 4, fontFamily: sans, fontSize: 13 }}>
            {[{ key: "portfolio", label: "My Vault" }, { key: "search", label: "Search" }].map(v => (
              <button key={v.key} onClick={() => { setView(v.key); setSelectedItem(null); }}
                style={{ padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer", background: view === v.key ? goldA(0.15) : "transparent", color: view === v.key ? gold : "#8a8580", fontWeight: view === v.key ? 600 : 400, transition: "all 0.2s", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "0.02em", textTransform: "uppercase" }}>
                {v.label}{v.key === "portfolio" && owned.length > 0 ? ` (${owned.length})` : ""}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px 80px", position: "relative", zIndex: 1 }}>

        {/* ── PORTFOLIO ── */}
        {view === "portfolio" && (
          <div>
            <div style={{ marginBottom: 36 }}>
              <p style={{ fontSize: 12, color: "#6a6560", fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Portfolio Value</p>
              <span style={{ fontSize: 48, fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 1 }}>{fmt(totalValue)}</span>
              <p style={{ fontSize: 13, color: "#4a4540", fontFamily: sans, marginTop: 8 }}>
                {owned.length} {owned.length === 1 ? "item" : "items"} tracked
                {ownedCats.size > 0 ? ` across ${[...ownedCats].join(", ")}` : ""}
              </p>
            </div>

            {owned.length === 0 ? (
              <div style={{ textAlign: "center", padding: "70px 24px", border: `1px dashed ${goldA(0.2)}`, borderRadius: 16 }}>
                <div style={{ fontSize: 44, marginBottom: 14, opacity: 0.4 }}>✦</div>
                <p style={{ fontSize: 18, color: "#6a6560", marginBottom: 6 }}>Your vault is empty</p>
                <p style={{ fontSize: 14, color: "#4a4540", fontFamily: sans, marginBottom: 24 }}>Search for luxury goods you own to start tracking their value</p>
                <button onClick={() => setView("search")} style={{ padding: "12px 32px", borderRadius: 24, border: `1px solid ${goldA(0.4)}`, background: goldA(0.08), color: gold, cursor: "pointer", fontFamily: sans, fontSize: 14, fontWeight: 500 }}>Search Items</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {owned.map((o, idx) => {
                  const item = allItems.find(i => i.id === o.id);
                  if (!item) return null;
                  const cond = CONDITIONS.find(c => c.label === o.condition);
                  const val = item.avgPrice * (cond?.multiplier || 1);
                  const isSel = selectedItem?.id === item.id;
                  return (
                    <div key={o.id}>
                      <div onClick={() => setSelectedItem(isSel ? null : item)}
                        style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", alignItems: "center", gap: 14, padding: "16px 18px", background: isSel ? goldA(0.06) : whiteA(0.02), borderRadius: idx === 0 ? "12px 12px 2px 2px" : idx === owned.length - 1 && !isSel ? "2px 2px 12px 12px" : 2, cursor: "pointer", transition: "background 0.15s", border: `1px solid ${whiteA(0.04)}` }}>
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", background: whiteA(0.05) }} onError={e => { e.target.style.display = "none"; }} />
                        ) : (
                          <div style={{ width: 44, height: 44, borderRadius: 8, background: goldA(0.08), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{item.image}</div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 10, color: gold, fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{item.brand}</div>
                          <div style={{ fontSize: 15, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: "#6a6560", fontFamily: sans, marginTop: 2 }}>{o.condition} · {item.numListings} listings</div>
                        </div>
                        <div style={{ textAlign: "right", minWidth: 90 }}>
                          <div style={{ fontSize: 17, letterSpacing: "-0.02em" }}>{fmt(val)}</div>
                          <div style={{ fontSize: 10, color: "#6a6560", fontFamily: sans }}>{fmt(item.lowPrice)} – {fmt(item.highPrice)}</div>
                        </div>
                      </div>
                      {isSel && (
                        <div style={{ padding: 22, borderRadius: "0 0 12px 12px", background: goldA(0.04), border: `1px solid ${goldA(0.1)}`, borderTop: "none", marginBottom: 4 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
                            {[{ l: "Market Low", v: fmt(item.lowPrice), c: "#f87171" }, { l: "Average", v: fmt(item.avgPrice), c: "#e8e4df" }, { l: "Market High", v: fmt(item.highPrice), c: "#34d399" }].map(s => (
                              <div key={s.l} style={{ padding: 12, borderRadius: 8, background: whiteA(0.03), border: `1px solid ${whiteA(0.05)}` }}>
                                <div style={{ fontSize: 9, color: "#6a6560", fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{s.l}</div>
                                <div style={{ fontSize: 17, color: s.c, letterSpacing: "-0.02em" }}>{s.v}</div>
                              </div>
                            ))}
                          </div>
                          {item.sources?.length > 0 && (
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: 9, color: "#6a6560", fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Sources</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {item.sources.map(p => <span key={p} style={{ padding: "3px 8px", borderRadius: 10, fontSize: 10, background: goldA(0.08), border: `1px solid ${goldA(0.15)}`, fontFamily: sans, color: gold }}>{p}</span>)}
                              </div>
                            </div>
                          )}
                          {item.sampleUrls?.length > 0 && (
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: 9, color: "#6a6560", fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>View Listings</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                {item.sampleUrls.slice(0, 3).map((u, i) => (
                                  <a key={i} href={u.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: gold, fontFamily: sans, textDecoration: "none", opacity: 0.8 }}>{u.platform} →</a>
                                ))}
                              </div>
                            </div>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: "#4a4540", fontFamily: sans }}>{o.condition} ({cond?.multiplier >= 1 ? "+" : ""}{Math.round((cond?.multiplier - 1) * 100)}% from avg)</span>
                            <button onClick={e => { e.stopPropagation(); removeOwned(item.id); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#f87171", cursor: "pointer", fontSize: 12, fontFamily: sans, fontWeight: 500 }}>Remove</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SEARCH ── */}
        {view === "search" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 26, fontWeight: 400, letterSpacing: "-0.02em", marginBottom: 6 }}>Search Luxury Goods</h2>
              <p style={{ fontSize: 13, color: "#6a6560", fontFamily: sans, marginBottom: 18 }}>Live resale data from eBay, Fashionphile, Rebag, Privé Porter & more</p>

              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !searching && handleSearch()}
                    placeholder="Search any luxury item..."
                    style={{ width: "100%", padding: "13px 18px 13px 42px", borderRadius: 12, border: `1px solid ${goldA(0.15)}`, background: whiteA(0.03), color: "#e8e4df", fontSize: 15, fontFamily: sans, outline: "none", boxSizing: "border-box" }} />
                  <span style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: "#6a6560", fontSize: 15 }}>⌕</span>
                  {search && !searching && (
                    <button onClick={() => { setSearch(""); setSearchResults([]); setSearchError(null); setPlatformInfo(null); setFilterCat("All"); }}
                      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#6a6560", cursor: "pointer", fontSize: 18, fontFamily: sans }}>×</button>
                  )}
                </div>
                <button onClick={handleSearch} disabled={searching || !search.trim()}
                  style={{ padding: "13px 24px", borderRadius: 12, border: "none", cursor: searching ? "wait" : !search.trim() ? "default" : "pointer", background: searching ? goldA(0.1) : `linear-gradient(135deg, ${gold}, #a08520)`, color: searching ? gold : "#0a0a0b", fontFamily: sans, fontSize: 14, fontWeight: 600, opacity: !search.trim() ? 0.4 : 1, whiteSpace: "nowrap" }}>
                  {searching ? "..." : "Search"}
                </button>
              </div>

              {/* Suggestion chips */}
              {!searching && searchResults.length === 0 && !searchError && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 10, color: "#4a4540", fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Try searching for</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {POPULAR_SEARCHES.map(s => (
                      <button key={s} onClick={() => { setSearch(s); }}
                        style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${whiteA(0.08)}`, background: whiteA(0.02), color: "#8a8580", cursor: "pointer", fontSize: 12, fontFamily: sans, transition: "all 0.15s" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = goldA(0.3); e.currentTarget.style.color = gold; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = whiteA(0.08); e.currentTarget.style.color = "#8a8580"; }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Loading */}
            {searching && (
              <div style={{ textAlign: "center", padding: "50px 24px" }}>
                <div style={{ width: 40, height: 40, margin: "0 auto 16px", borderRadius: "50%", border: `2px solid ${goldA(0.15)}`, borderTopColor: gold, animation: "spin 1s linear infinite" }} />
                <p style={{ fontSize: 15, color: "#8a8580" }}>Searching resale platforms...</p>
              </div>
            )}

            {/* Error */}
            {searchError && (
              <div style={{ padding: "16px 20px", borderRadius: 12, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", marginBottom: 16 }}>
                <div style={{ color: "#f87171", fontSize: 14, fontFamily: sans }}>{searchError}</div>
              </div>
            )}

            {/* Results */}
            {!searching && searchResults.length > 0 && (
              <div>
                {/* Sort & filter bar */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontSize: 12, color: "#6a6560", fontFamily: sans }}>
                    {sortedResults.length} item{sortedResults.length !== 1 ? "s" : ""} from {platformInfo ? Object.values(platformInfo).filter(p => p.count > 0).map(p => p.name).join(", ") : "live data"}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {resultCategories.length > 1 && (
                      <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                        style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${whiteA(0.1)}`, background: whiteA(0.03), color: "#e8e4df", fontSize: 11, fontFamily: sans, outline: "none" }}>
                        <option value="All">All Categories</option>
                        {resultCategories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                    <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                      style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${whiteA(0.1)}`, background: whiteA(0.03), color: "#e8e4df", fontSize: 11, fontFamily: sans, outline: "none" }}>
                      <option value="relevance">Relevance</option>
                      <option value="price-high">Price: High → Low</option>
                      <option value="price-low">Price: Low → High</option>
                      <option value="listings">Most Listings</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                  {sortedResults.map((item, ri) => renderItem(item, ri))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Condition Modal */}
      {conditionModal && (
        <div onClick={() => setConditionModal(null)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#141415", borderRadius: 20, padding: 28, border: `1px solid ${goldA(0.15)}`, maxWidth: 400, width: "100%", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: 11, color: gold, fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>{conditionModal.brand}</div>
            <div style={{ fontSize: 20, marginBottom: 3, letterSpacing: "-0.02em" }}>{conditionModal.name}</div>
            <div style={{ fontSize: 13, color: "#6a6560", fontFamily: sans, marginBottom: 24 }}>Select condition to estimate value</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {CONDITIONS.map(c => {
                const ev = conditionModal.avgPrice * c.multiplier;
                return (
                  <button key={c.label} onClick={() => addOwned(conditionModal.id, c.label)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: 10, border: `1px solid ${whiteA(0.06)}`, background: whiteA(0.02), cursor: "pointer", transition: "all 0.15s", textAlign: "left" }}
                    onMouseEnter={e => { e.currentTarget.style.background = goldA(0.08); e.currentTarget.style.borderColor = goldA(0.2); }}
                    onMouseLeave={e => { e.currentTarget.style.background = whiteA(0.02); e.currentTarget.style.borderColor = whiteA(0.06); }}>
                    <div>
                      <div style={{ fontSize: 14, color: "#e8e4df", fontFamily: serif }}>{c.label}</div>
                      <div style={{ fontSize: 11, color: "#6a6560", fontFamily: sans }}>{c.desc}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 15, color: "#e8e4df", fontFamily: serif }}>{fmt(ev)}</div>
                      <div style={{ fontSize: 10, color: c.multiplier >= 1 ? "#34d399" : "#6a6560", fontFamily: sans }}>{c.multiplier >= 1 ? "+" : ""}{Math.round((c.multiplier - 1) * 100)}%</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setConditionModal(null)} style={{ width: "100%", padding: 11, borderRadius: 10, marginTop: 14, border: `1px solid ${whiteA(0.08)}`, background: "transparent", color: "#6a6560", cursor: "pointer", fontSize: 13, fontFamily: sans }}>Cancel</button>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${goldA(0.2)}; border-radius: 3px; }
        ::placeholder { color: #4a4540; }
        select option { background: #1a1a1b; color: #e8e4df; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

import { useState, useMemo, useCallback } from "react";
import { Analytics } from "@vercel/analytics/react";

const API_URL = "";

const CONDITIONS = [
  { label: "New / Unworn", multiplier: 1.15, desc: "Tags attached, never used" },
  { label: "Excellent", multiplier: 1.0, desc: "Minimal signs of use" },
  { label: "Very Good", multiplier: 0.88, desc: "Light wear, fully functional" },
  { label: "Good", multiplier: 0.75, desc: "Moderate wear, some marks" },
  { label: "Fair", multiplier: 0.60, desc: "Visible wear, still functional" },
];

function fmt(n) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n); }

function MiniChart({ trend, seed }) {
  const pts = Array.from({ length: 12 }, (_, i) => 50 + (trend || 0) * i * 2 + Math.sin((i + (seed || 0)) * 1.3) * 8 + Math.sin((i + (seed || 0)) * 3.7) * 4);
  const mn = Math.min(...pts), mx = Math.max(...pts), h = 32, w = 80;
  const nm = pts.map(p => h - ((p - mn) / (mx - mn || 1)) * h);
  const d = nm.map((y, i) => `${i === 0 ? "M" : "L"}${(i / (pts.length - 1)) * w},${y}`).join(" ");
  const c = (trend || 0) >= 0 ? "#34d399" : "#f87171";
  return (<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible", flexShrink: 0 }}><path d={d + ` L${w},${h} L0,${h} Z`} fill={c} fillOpacity="0.15" /><path d={d} fill="none" stroke={c} strokeWidth="1.5" /></svg>);
}

async function searchAPI(query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

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

    // Map API response to our item format
    return (data.items || []).map((item, i) => ({
      id: `api-${Date.now()}-${i}`,
      brand: item.brand || "Unknown",
      name: item.name || "Unknown Item",
      category: item.category || "Accessories",
      image: item.category === "Watches" ? "⌚" : item.category === "Handbags" ? "👜" : item.category === "Jewelry" ? "💎" : item.category === "Shoes" ? "👟" : "✦",
      avgPrice: item.avgPrice || 0,
      highPrice: item.highPrice || 0,
      lowPrice: item.lowPrice || 0,
      trend: item.trend || 0,
      recentSales: item.numListings || item.recentSales || 0,
      sources: item.sources || [],
      notes: item.notes || "",
      imageUrl: item.imageUrl || null,
      sampleUrls: item.sampleUrls || [],
      conditions: item.conditions || {},
    }));
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") throw new Error("Search timed out — try again");
    throw err;
  }
}

// Fallback local database for instant results while API loads
const POPULAR = [
  { id:"p1", brand:"Hermès", name:"Birkin 25", category:"Handbags", image:"👜", avgPrice:14500, highPrice:19000, lowPrice:11000, trend:3.8, recentSales:42, sources:["The RealReal","Vestiaire Collective","Rebag"], notes:"Most sought-after size; search for live pricing" },
  { id:"p2", brand:"Rolex", name:"Daytona 116500LN", category:"Watches", image:"⌚", avgPrice:28500, highPrice:34000, lowPrice:24000, trend:1.8, recentSales:92, sources:["Chrono24","StockX","Bob's Watches"], notes:"White dial commands premium; search for live pricing" },
  { id:"p3", brand:"Chanel", name:"Classic Flap Medium", category:"Handbags", image:"👜", avgPrice:9200, highPrice:11000, lowPrice:7500, trend:3.5, recentSales:72, sources:["The RealReal","Vestiaire Collective","Fashionphile"], notes:"Caviar leather; search for live pricing" },
  { id:"p4", brand:"Cartier", name:"Love Bracelet", category:"Jewelry", image:"💎", avgPrice:6500, highPrice:7500, lowPrice:5600, trend:1.5, recentSales:160, sources:["The RealReal","Fashionphile","Rebag"], notes:"Yellow gold; search for live pricing" },
  { id:"p5", brand:"Patek Philippe", name:"Nautilus 5711", category:"Watches", image:"⌚", avgPrice:128000, highPrice:155000, lowPrice:105000, trend:-2.8, recentSales:14, sources:["Chrono24","Phillips","Sotheby's"], notes:"Discontinued; search for live pricing" },
];

export default function LuxuryTracker() {
  const [view, setView] = useState("portfolio");
  const [owned, setOwned] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [conditionModal, setConditionModal] = useState(null);
  const [allItems, setAllItems] = useState([...POPULAR]);
  const [platformStatus, setPlatformStatus] = useState(null);

  const totalValue = owned.reduce((sum, o) => {
    const item = allItems.find(i => i.id === o.id);
    if (!item) return sum;
    return sum + item.avgPrice * (CONDITIONS.find(c => c.label === o.condition)?.multiplier || 1);
  }, 0);

  const totalChange = owned.reduce((sum, o) => {
    const item = allItems.find(i => i.id === o.id);
    if (!item) return sum;
    const val = item.avgPrice * (CONDITIONS.find(c => c.label === o.condition)?.multiplier || 1);
    return sum + (val * item.trend) / 100;
  }, 0);

  const handleSearch = useCallback(async () => {
    if (!search.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setPlatformStatus(null);
    try {
      const results = await searchAPI(search.trim());
      if (results.length === 0) {
        setSearchError("No results found. Try a different search term.");
      } else {
        setSearchResults(results);
        setAllItems(prev => {
          const existing = new Set(prev.map(i => i.id));
          return [...prev, ...results.filter(r => !existing.has(r.id))];
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

  const ownedCats = new Set(owned.map(o => allItems.find(i => i.id === o.id)?.category).filter(Boolean));
  const sans = "'DM Sans', Helvetica, sans-serif";
  const serif = "'Instrument Serif', Georgia, 'Times New Roman', serif";
  const gold = "#d4af37";
  const goldA = a => `rgba(212,175,55,${a})`;
  const whiteA = a => `rgba(255,255,255,${a})`;

  const renderItem = (item, idx, context) => {
    const io = isOwned(item.id);
    const oc = getOwnedCond(item.id);
    return (
      <div key={item.id} style={{ padding: 22, borderRadius: 14, background: io ? goldA(0.06) : whiteA(0.02), border: `1px solid ${io ? goldA(0.2) : whiteA(0.05)}`, transition: "all 0.2s" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, color: gold, fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em" }}>{item.brand}</div>
            <div style={{ fontSize: 17, marginTop: 3, letterSpacing: "-0.01em", lineHeight: 1.3 }}>{item.name}</div>
          </div>
          {item.imageUrl ? (
            <img src={item.imageUrl} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", marginLeft: 8, flexShrink: 0, background: whiteA(0.05) }} onError={e => { e.target.style.display = "none"; }} />
          ) : (
            <span style={{ fontSize: 28, opacity: 0.6, flexShrink: 0, marginLeft: 8 }}>{item.image}</span>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 22, letterSpacing: "-0.02em" }}>{fmt(item.avgPrice)}</div>
            {item.trend !== 0 && <div style={{ fontSize: 12, fontFamily: sans, fontWeight: 500, marginTop: 2, color: item.trend >= 0 ? "#34d399" : "#f87171" }}>{item.trend >= 0 ? "↑" : "↓"} {Math.abs(item.trend)}% (30d)</div>}
          </div>
          <MiniChart trend={item.trend} seed={idx} />
        </div>
        <div style={{ fontSize: 11, color: "#4a4540", fontFamily: sans, marginBottom: 6 }}>
          {fmt(item.lowPrice)} – {fmt(item.highPrice)}{item.recentSales > 0 ? ` · ${item.recentSales} listings` : ""}
        </div>
        {item.sources?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {item.sources.slice(0, 4).map(s => <span key={s} style={{ padding: "2px 8px", borderRadius: 8, fontSize: 10, background: goldA(0.06), border: `1px solid ${goldA(0.1)}`, fontFamily: sans, color: "#a09880" }}>{s}</span>)}
            {item.sources.length > 4 && <span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 10, background: goldA(0.06), border: `1px solid ${goldA(0.1)}`, fontFamily: sans, color: "#a09880" }}>+{item.sources.length - 4}</span>}
          </div>
        )}
        {item.notes && <div style={{ fontSize: 12, color: "#6a6560", fontFamily: sans, marginBottom: 14, lineHeight: 1.4 }}>{item.notes}</div>}
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

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0b", color: "#e8e4df", fontFamily: serif, position: "relative" }}>
      <div style={{ position: "fixed", top: -200, right: -200, width: 600, height: 600, background: `radial-gradient(circle, ${goldA(0.06)} 0%, transparent 70%)`, pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", bottom: -300, left: -100, width: 500, height: 500, background: `radial-gradient(circle, ${goldA(0.04)} 0%, transparent 70%)`, pointerEvents: "none", zIndex: 0 }} />

      <header style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(10,10,11,0.85)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${goldA(0.12)}`, padding: "0 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: `linear-gradient(135deg, ${gold}, #a08520)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#0a0a0b", fontFamily: sans }}>V</div>
            <span style={{ fontSize: 20, letterSpacing: "-0.02em", color: gold }}>Vault</span>
          </div>
          <nav style={{ display: "flex", gap: 4, fontFamily: sans, fontSize: 13 }}>
            {["portfolio", "search"].map(v => (
              <button key={v} onClick={() => { setView(v); setSelectedItem(null); }}
                style={{ padding: "8px 18px", borderRadius: 20, border: "none", cursor: "pointer", background: view === v ? goldA(0.15) : "transparent", color: view === v ? gold : "#8a8580", fontWeight: view === v ? 600 : 400, transition: "all 0.2s", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "0.02em", textTransform: "uppercase" }}>
                {v === "portfolio" ? "My Vault" : "Search"}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px 80px", position: "relative", zIndex: 1 }}>

        {/* PORTFOLIO */}
        {view === "portfolio" && (
          <div>
            <div style={{ marginBottom: 40 }}>
              <p style={{ fontSize: 13, color: "#6a6560", fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Portfolio Value</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 52, fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 1 }}>{fmt(totalValue)}</span>
                {owned.length > 0 && <span style={{ fontSize: 15, fontFamily: sans, color: totalChange >= 0 ? "#34d399" : "#f87171", fontWeight: 500 }}>{totalChange >= 0 ? "↑" : "↓"} {fmt(Math.abs(totalChange))} (30d)</span>}
              </div>
              <p style={{ fontSize: 13, color: "#4a4540", fontFamily: sans, marginTop: 8 }}>{owned.length} {owned.length === 1 ? "item" : "items"} tracked{ownedCats.size > 0 ? ` across ${ownedCats.size} ${ownedCats.size === 1 ? "category" : "categories"}` : ""}</p>
            </div>

            {owned.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 24px", border: `1px dashed ${goldA(0.2)}`, borderRadius: 16 }}>
                <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>✦</div>
                <p style={{ fontSize: 20, color: "#6a6560", marginBottom: 8 }}>Your vault is empty</p>
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
                  const chg = (val * item.trend) / 100;
                  const isSel = selectedItem?.id === item.id;
                  return (
                    <div key={o.id}>
                      <div onClick={() => setSelectedItem(isSel ? null : item)}
                        style={{ display: "grid", gridTemplateColumns: "44px 1fr auto auto", alignItems: "center", gap: 16, padding: "18px 20px", background: isSel ? goldA(0.06) : whiteA(0.02), borderRadius: idx === 0 && !isSel ? "12px 12px 2px 2px" : idx === owned.length - 1 && !isSel ? "2px 2px 12px 12px" : isSel ? "12px 12px 4px 4px" : 2, cursor: "pointer", transition: "background 0.15s", border: `1px solid ${whiteA(0.04)}` }}>
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: goldA(0.08), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{item.image}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: gold, fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{item.brand}</div>
                          <div style={{ fontSize: 16, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: "#6a6560", fontFamily: sans, marginTop: 2 }}>{o.condition}{item.recentSales > 0 ? ` · ${item.recentSales} listings` : ""}</div>
                        </div>
                        <MiniChart trend={item.trend} seed={idx} />
                        <div style={{ textAlign: "right", minWidth: 100 }}>
                          <div style={{ fontSize: 18, letterSpacing: "-0.02em" }}>{fmt(val)}</div>
                          <div style={{ fontSize: 12, fontFamily: sans, fontWeight: 500, color: chg >= 0 ? "#34d399" : "#f87171" }}>{chg >= 0 ? "+" : ""}{fmt(chg)} ({item.trend > 0 ? "+" : ""}{item.trend}%)</div>
                        </div>
                      </div>
                      {isSel && (
                        <div style={{ padding: 24, borderRadius: "0 0 12px 12px", background: goldA(0.04), border: `1px solid ${goldA(0.1)}`, borderTop: "none", marginBottom: 4 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                            {[{ l: "Market Low", v: fmt(item.lowPrice), c: "#f87171" }, { l: "Average", v: fmt(item.avgPrice), c: "#e8e4df" }, { l: "Market High", v: fmt(item.highPrice), c: "#34d399" }].map(s => (
                              <div key={s.l} style={{ padding: 14, borderRadius: 10, background: whiteA(0.03), border: `1px solid ${whiteA(0.05)}` }}>
                                <div style={{ fontSize: 10, color: "#6a6560", fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{s.l}</div>
                                <div style={{ fontSize: 18, color: s.c, letterSpacing: "-0.02em" }}>{s.v}</div>
                              </div>
                            ))}
                          </div>
                          {item.notes && <div style={{ padding: "12px 16px", borderRadius: 8, marginBottom: 16, background: goldA(0.06), border: `1px solid ${goldA(0.1)}`, fontSize: 13, color: "#a09880", fontFamily: sans, lineHeight: 1.5 }}>💡 {item.notes}</div>}
                          {item.sources?.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 10, color: "#6a6560", fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Data Sources</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {item.sources.map(p => <span key={p} style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11, background: goldA(0.08), border: `1px solid ${goldA(0.15)}`, fontFamily: sans, color: gold }}>{p}</span>)}
                              </div>
                            </div>
                          )}
                          {item.sampleUrls?.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 10, color: "#6a6560", fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Sample Listings</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {item.sampleUrls.slice(0, 3).map((u, i) => (
                                  <a key={i} href={u.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: gold, fontFamily: sans, textDecoration: "none", opacity: 0.8 }}>
                                    {u.platform} →
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: "#4a4540", fontFamily: sans }}>Condition: {o.condition} ({cond?.multiplier >= 1 ? "+" : ""}{Math.round((cond?.multiplier - 1) * 100)}% from avg)</span>
                            <button onClick={e => { e.stopPropagation(); removeOwned(item.id); }} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#f87171", cursor: "pointer", fontSize: 12, fontFamily: sans, fontWeight: 500 }}>Remove</button>
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

        {/* SEARCH */}
        {view === "search" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 28, fontWeight: 400, letterSpacing: "-0.02em", marginBottom: 8 }}>Search Luxury Goods</h2>
              <p style={{ fontSize: 14, color: "#6a6560", fontFamily: sans, marginBottom: 20 }}>Live resale data from The RealReal, Chrono24, StockX, eBay, Vestiaire & more</p>

              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && !searching && handleSearch()}
                    placeholder="Search any luxury item..."
                    style={{ width: "100%", padding: "14px 20px 14px 44px", borderRadius: 12, border: `1px solid ${goldA(0.15)}`, background: whiteA(0.03), color: "#e8e4df", fontSize: 15, fontFamily: sans, outline: "none", boxSizing: "border-box" }} />
                  <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "#6a6560", fontSize: 16 }}>⌕</span>
                  {search && !searching && <button onClick={() => { setSearch(""); setSearchResults([]); setSearchError(null); }} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#6a6560", cursor: "pointer", fontSize: 18, fontFamily: sans }}>×</button>}
                </div>
                <button onClick={handleSearch} disabled={searching || !search.trim()}
                  style={{ padding: "14px 28px", borderRadius: 12, border: "none", cursor: searching ? "wait" : !search.trim() ? "default" : "pointer", background: searching ? goldA(0.1) : `linear-gradient(135deg, ${gold}, #a08520)`, color: searching ? gold : "#0a0a0b", fontFamily: sans, fontSize: 14, fontWeight: 600, opacity: !search.trim() ? 0.4 : 1, whiteSpace: "nowrap" }}>
                  {searching ? "Searching..." : "Search"}
                </button>
              </div>

              {!searching && searchResults.length === 0 && !searchError && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 11, color: "#4a4540", fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Try searching for</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {["Rolex Daytona", "Hermès Birkin", "Chanel Classic Flap", "Patek Philippe Nautilus", "Cartier Love Bracelet", "Louis Vuitton Neverfull", "AP Royal Oak", "Van Cleef Alhambra"].map(s => (
                      <button key={s} onClick={() => { setSearch(s); }}
                        style={{ padding: "8px 16px", borderRadius: 20, border: `1px solid ${whiteA(0.08)}`, background: whiteA(0.02), color: "#8a8580", cursor: "pointer", fontSize: 13, fontFamily: sans, transition: "all 0.15s" }}
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
              <div style={{ textAlign: "center", padding: "60px 24px" }}>
                <div style={{ width: 48, height: 48, margin: "0 auto 20px", borderRadius: "50%", border: `2px solid ${goldA(0.15)}`, borderTopColor: gold, animation: "spin 1s linear infinite" }} />
                <p style={{ fontSize: 16, color: "#8a8580", marginBottom: 8 }}>Searching resale platforms...</p>
                <p style={{ fontSize: 13, color: "#4a4540", fontFamily: sans }}>Scraping live data from 6 platforms</p>
              </div>
            )}

            {/* Error */}
            {searchError && (
              <div style={{ padding: "20px 24px", borderRadius: 12, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", marginBottom: 20 }}>
                <div style={{ color: "#f87171", fontSize: 14, fontFamily: sans }}>{searchError}</div>
              </div>
            )}

            {/* Results */}
            {!searching && searchResults.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: "#6a6560", fontFamily: sans, marginBottom: 16 }}>
                  Found {searchResults.length} items from live resale data
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                  {searchResults.map((item, ri) => renderItem(item, ri, "search"))}
                </div>
              </div>
            )}

            {/* Popular items when no search */}
            {!searching && searchResults.length === 0 && !searchError && !search && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, color: "#4a4540", fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Popular Items</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                  {POPULAR.map((item, ri) => renderItem(item, ri, "popular"))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Condition Modal */}
      {conditionModal && (
        <div onClick={() => setConditionModal(null)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#141415", borderRadius: 20, padding: 32, border: `1px solid ${goldA(0.15)}`, maxWidth: 420, width: "100%", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: 12, color: gold, fontFamily: sans, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>{conditionModal.brand}</div>
            <div style={{ fontSize: 22, marginBottom: 4, letterSpacing: "-0.02em" }}>{conditionModal.name}</div>
            <div style={{ fontSize: 13, color: "#6a6560", fontFamily: sans, marginBottom: 28 }}>Select condition to estimate your item's value</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CONDITIONS.map(c => {
                const ev = conditionModal.avgPrice * c.multiplier;
                return (
                  <button key={c.label} onClick={() => addOwned(conditionModal.id, c.label)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderRadius: 10, border: `1px solid ${whiteA(0.06)}`, background: whiteA(0.02), cursor: "pointer", transition: "all 0.15s", textAlign: "left" }}
                    onMouseEnter={e => { e.currentTarget.style.background = goldA(0.08); e.currentTarget.style.borderColor = goldA(0.2); }}
                    onMouseLeave={e => { e.currentTarget.style.background = whiteA(0.02); e.currentTarget.style.borderColor = whiteA(0.06); }}>
                    <div>
                      <div style={{ fontSize: 15, color: "#e8e4df", fontFamily: serif, marginBottom: 2 }}>{c.label}</div>
                      <div style={{ fontSize: 11, color: "#6a6560", fontFamily: sans }}>{c.desc}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 16, color: "#e8e4df", fontFamily: serif }}>{fmt(ev)}</div>
                      <div style={{ fontSize: 11, color: c.multiplier >= 1 ? "#34d399" : "#6a6560", fontFamily: sans }}>{c.multiplier >= 1 ? "+" : ""}{Math.round((c.multiplier - 1) * 100)}% avg</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setConditionModal(null)} style={{ width: "100%", padding: 12, borderRadius: 10, marginTop: 16, border: `1px solid ${whiteA(0.08)}`, background: "transparent", color: "#6a6560", cursor: "pointer", fontSize: 13, fontFamily: sans }}>Cancel</button>
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
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <Analytics />
    </div>
  );
}

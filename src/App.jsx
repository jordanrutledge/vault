import { useState, useCallback, useEffect, useRef } from "react";

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
  "Louis Vuitton Neverfull", "Audemars Piguet Royal Oak", "Van Cleef Alhambra",
  "Omega Speedmaster", "Goyard St Louis",
];

const CATEGORY_ICONS = { Watches: "◷", Handbags: "◻", Jewelry: "◇", Shoes: "◁", Accessories: "○" };

function fmt(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function loadPortfolio() { try { return JSON.parse(localStorage.getItem("vault_portfolio") || "[]"); } catch { return []; } }
function savePortfolio(i) { try { localStorage.setItem("vault_portfolio", JSON.stringify(i)); } catch {} }
function loadItemCache() { try { return JSON.parse(localStorage.getItem("vault_items") || "[]"); } catch { return []; } }
function saveItemCache(i) { try { localStorage.setItem("vault_items", JSON.stringify(i)); } catch {} }

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
        image: CATEGORY_ICONS[item.category] || "○",
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
  const [hoveredCard, setHoveredCard] = useState(null);
  const inputRef = useRef(null);

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
          return [...prev, ...data.items.filter(r => !existing.has(r.id))];
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

  const sortedResults = [...searchResults].sort((a, b) => {
    if (sortBy === "price-high") return b.avgPrice - a.avgPrice;
    if (sortBy === "price-low") return a.avgPrice - b.avgPrice;
    if (sortBy === "listings") return b.numListings - a.numListings;
    return 0;
  }).filter(item => filterCat === "All" || item.category === filterCat);

  const resultCategories = [...new Set(searchResults.map(i => i.category))];
  const ownedCats = new Set(owned.map(o => allItems.find(i => i.id === o.id)?.category).filter(Boolean));

  // ── Design tokens ──
  const C = {
    bg: "#08090a",
    surface: "#0f1012",
    surfaceHover: "#141618",
    border: "rgba(255,255,255,0.06)",
    borderGold: "rgba(196,160,82,0.25)",
    gold: "#c4a052",
    goldLight: "#d4b46a",
    goldDim: "rgba(196,160,82,0.12)",
    text: "#e2ddd6",
    textMid: "#8a8278",
    textDim: "#4a4642",
    red: "#e05c5c",
    green: "#4aab7a",
  };
  const g = (a) => `rgba(196,160,82,${a})`;
  const w = (a) => `rgba(255,255,255,${a})`;

  const renderCard = (item, idx) => {
    const io = isOwned(item.id);
    const oc = getOwnedCond(item.id);
    const isHov = hoveredCard === item.id;
    const spread = item.highPrice - item.lowPrice;
    const spreadPct = item.avgPrice > 0 ? Math.round((spread / item.avgPrice) * 100) : 0;

    return (
      <div key={item.id}
        onMouseEnter={() => setHoveredCard(item.id)}
        onMouseLeave={() => setHoveredCard(null)}
        style={{
          background: io ? `linear-gradient(135deg, rgba(196,160,82,0.07), rgba(196,160,82,0.03))` : isHov ? C.surfaceHover : C.surface,
          border: `1px solid ${io ? C.borderGold : isHov ? w(0.1) : C.border}`,
          borderRadius: 3,
          padding: "24px 24px 20px",
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          position: "relative",
          overflow: "hidden",
        }}>

        {/* Subtle corner accent */}
        {io && <div style={{ position: "absolute", top: 0, right: 0, width: 40, height: 40, background: `linear-gradient(225deg, ${g(0.3)}, transparent)`, borderRadius: "0 3px 0 0" }} />}

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginBottom: 18 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 11, color: C.gold, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 6, fontWeight: 500 }}>
              {item.brand}
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 18, color: C.text, lineHeight: 1.35, letterSpacing: "0.01em", fontWeight: 400 }}>
              {item.name}
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>
            {item.imageUrl ? (
              <img src={item.imageUrl} alt=""
                style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 2, display: "block", filter: "brightness(0.95) contrast(1.05)" }}
                onError={e => { e.target.style.display = "none"; }} />
            ) : (
              <div style={{ width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 22, fontFamily: "serif", border: `1px solid ${C.border}`, borderRadius: 2 }}>
                {item.image}
              </div>
            )}
          </div>
        </div>

        {/* Price row */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 32, color: C.text, letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 6 }}>
            {fmt(item.avgPrice)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 10, color: C.textDim, letterSpacing: "0.04em" }}>
              {fmt(item.lowPrice)} — {fmt(item.highPrice)}
            </span>
            {spreadPct > 0 && (
              <span style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, color: C.textDim, padding: "1px 5px", border: `1px solid ${C.border}`, borderRadius: 2 }}>
                ±{spreadPct}%
              </span>
            )}
          </div>
        </div>

        {/* Thin divider */}
        <div style={{ height: 1, background: C.border, marginBottom: 14 }} />

        {/* Meta row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {item.sources.slice(0, 3).map(s => (
              <span key={s} style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, color: C.textMid, padding: "2px 6px", border: `1px solid ${C.border}`, borderRadius: 2, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {s === "eBay (Sold)" ? "eBay" : s === "Madison Avenue Couture" ? "MAC" : s === "Ann's Fabulous Finds" ? "AFF" : s === "Privé Porter" ? "PP" : s}
              </span>
            ))}
            {item.sources.length > 3 && (
              <span style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, color: C.textDim, padding: "2px 6px" }}>
                +{item.sources.length - 3}
              </span>
            )}
          </div>
          <span style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, color: C.textDim, letterSpacing: "0.04em" }}>
            {item.numListings} {item.numListings === 1 ? "listing" : "listings"}
          </span>
        </div>

        {/* Action */}
        {io ? (
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1, padding: "9px 12px", background: g(0.1), border: `1px solid ${C.borderGold}`, borderRadius: 2, fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 10, color: C.gold, textAlign: "center", letterSpacing: "0.08em" }}>
              IN VAULT · {oc?.toUpperCase()}
            </div>
            <button onClick={() => removeOwned(item.id)}
              style={{ padding: "9px 12px", background: "transparent", border: `1px solid rgba(224,92,92,0.2)`, borderRadius: 2, color: C.red, cursor: "pointer", fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 10, letterSpacing: "0.04em", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(224,92,92,0.08)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
              REMOVE
            </button>
          </div>
        ) : (
          <button onClick={() => setConditionModal(item)}
            style={{ width: "100%", padding: "10px", background: isHov ? g(0.15) : "transparent", border: `1px solid ${isHov ? C.borderGold : C.border}`, borderRadius: 2, color: isHov ? C.gold : C.textMid, cursor: "pointer", fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 10, letterSpacing: "0.1em", transition: "all 0.2s" }}>
            ADD TO VAULT
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, position: "relative", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>

      {/* Subtle noise texture overlay */}
      <div style={{ position: "fixed", inset: 0, opacity: 0.025, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`, pointerEvents: "none", zIndex: 0 }} />

      {/* Ambient glow */}
      <div style={{ position: "fixed", top: "20%", right: "-10%", width: "40vw", height: "40vw", background: `radial-gradient(ellipse, ${g(0.04)} 0%, transparent 65%)`, pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", bottom: "10%", left: "-5%", width: "30vw", height: "30vw", background: `radial-gradient(ellipse, ${g(0.03)} 0%, transparent 70%)`, pointerEvents: "none", zIndex: 0 }} />

      {/* ── HEADER ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, borderBottom: `1px solid ${C.border}`, background: `rgba(8,9,10,0.92)`, backdropFilter: "blur(24px) saturate(160%)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          {/* Wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="1" y="1" width="16" height="16" stroke={C.gold} strokeWidth="1" fill="none" />
              <rect x="4" y="4" width="10" height="10" fill={C.gold} opacity="0.2" />
              <text x="9" y="12.5" textAnchor="middle" fill={C.gold} fontSize="8" fontFamily="Georgia, serif" fontWeight="400">V</text>
            </svg>
            <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 17, letterSpacing: "0.25em", color: C.text, fontWeight: 400, textTransform: "uppercase" }}>Vault</span>
          </div>

          {/* Nav */}
          <nav style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {[{ key: "portfolio", label: owned.length > 0 ? `Portfolio (${owned.length})` : "Portfolio" }, { key: "search", label: "Search" }].map((v, vi) => (
              <button key={v.key} onClick={() => { setView(v.key); setSelectedItem(null); }}
                style={{
                  padding: "0 20px", height: 56, background: "none", border: "none",
                  borderBottom: view === v.key ? `1px solid ${C.gold}` : "1px solid transparent",
                  color: view === v.key ? C.gold : C.textMid,
                  cursor: "pointer", fontFamily: "'Geist Mono', 'SF Mono', monospace",
                  fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
                  transition: "all 0.2s", marginBottom: -1,
                }}>
                {v.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "48px 32px 100px", position: "relative", zIndex: 1 }}>

        {/* ── PORTFOLIO VIEW ── */}
        {view === "portfolio" && (
          <div>
            {/* Portfolio header */}
            <div style={{ marginBottom: 56, borderBottom: `1px solid ${C.border}`, paddingBottom: 40 }}>
              <div style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, color: C.textDim, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 16 }}>
                Portfolio Value — {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 64, fontWeight: 300, letterSpacing: "-0.03em", lineHeight: 1, color: C.text, marginBottom: 14 }}>
                {fmt(totalValue)}
              </div>
              <div style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 10, color: C.textDim, letterSpacing: "0.08em" }}>
                {owned.length === 0 ? "No items tracked" : `${owned.length} item${owned.length !== 1 ? "s" : ""} across ${[...ownedCats].join(", ") || "—"}`}
              </div>
            </div>

            {owned.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 32px" }}>
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ margin: "0 auto 24px", display: "block", opacity: 0.2 }}>
                  <rect x="2" y="2" width="36" height="36" stroke={C.gold} strokeWidth="1" fill="none" />
                  <rect x="8" y="8" width="24" height="24" stroke={C.gold} strokeWidth="0.5" fill="none" />
                  <line x1="20" y1="8" x2="20" y2="32" stroke={C.gold} strokeWidth="0.5" />
                  <line x1="8" y1="20" x2="32" y2="20" stroke={C.gold} strokeWidth="0.5" />
                </svg>
                <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: C.textMid, marginBottom: 10, fontWeight: 300, letterSpacing: "0.02em" }}>
                  Your portfolio is empty
                </div>
                <div style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 10, color: C.textDim, marginBottom: 32, letterSpacing: "0.04em" }}>
                  Search for luxury goods to begin tracking market value
                </div>
                <button onClick={() => setView("search")}
                  style={{ padding: "10px 28px", background: "transparent", border: `1px solid ${C.borderGold}`, borderRadius: 2, color: C.gold, cursor: "pointer", fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", transition: "all 0.2s" }}
                  onMouseEnter={e => { e.currentTarget.style.background = g(0.1); }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                  Begin Search
                </button>
              </div>
            ) : (
              <div>
                {/* Portfolio table */}
                <div style={{ marginBottom: 4 }}>
                  {/* Table header */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px 140px 100px", gap: 16, padding: "0 0 10px 0", borderBottom: `1px solid ${C.border}`, marginBottom: 2 }}>
                    {["Item", "Condition", "Market Avg", "Your Value", ""].map((h, i) => (
                      <div key={h} style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, color: C.textDim, letterSpacing: "0.1em", textTransform: "uppercase", textAlign: i > 1 ? "right" : "left" }}>{h}</div>
                    ))}
                  </div>

                  {/* Table rows */}
                  {owned.map((o, idx) => {
                    const item = allItems.find(i => i.id === o.id);
                    if (!item) return null;
                    const cond = CONDITIONS.find(c => c.label === o.condition);
                    const val = item.avgPrice * (cond?.multiplier || 1);
                    const isSel = selectedItem?.id === item.id;

                    return (
                      <div key={o.id}>
                        <div onClick={() => setSelectedItem(isSel ? null : item)}
                          style={{
                            display: "grid", gridTemplateColumns: "1fr 140px 140px 140px 100px", gap: 16,
                            padding: "16px 0", borderBottom: `1px solid ${C.border}`,
                            cursor: "pointer", transition: "background 0.15s",
                            background: isSel ? g(0.04) : "transparent",
                          }}
                          onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = w(0.02); }}
                          onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>

                          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 1, flexShrink: 0 }} onError={e => e.target.style.display = "none"} />
                            ) : (
                              <div style={{ width: 36, height: 36, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 14, flexShrink: 0 }}>{item.image}</div>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, color: C.gold, letterSpacing: "0.1em", marginBottom: 3, textTransform: "uppercase" }}>{item.brand}</div>
                              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 15, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                            </div>
                          </div>

                          <div style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 10, color: C.textMid, display: "flex", alignItems: "center" }}>{o.condition}</div>
                          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 16, color: C.textMid, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{fmt(item.avgPrice)}</div>
                          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 16, color: C.text, display: "flex", alignItems: "center", justifyContent: "flex-end", fontWeight: 400 }}>{fmt(val)}</div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                            <span style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, color: C.textDim, letterSpacing: "0.04em" }}>
                              {isSel ? "▲" : "▼"}
                            </span>
                          </div>
                        </div>

                        {/* Expanded detail */}
                        {isSel && (
                          <div style={{ padding: "20px 0 20px 50px", borderBottom: `1px solid ${C.border}`, background: g(0.03) }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 120px) 1fr", gap: 24, marginBottom: 16 }}>
                              {[{ l: "Low", v: fmt(item.lowPrice), c: C.red }, { l: "Average", v: fmt(item.avgPrice), c: C.textMid }, { l: "High", v: fmt(item.highPrice), c: C.green }].map(s => (
                                <div key={s.l}>
                                  <div style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 8, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 }}>{s.l}</div>
                                  <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, color: s.c }}>{s.v}</div>
                                </div>
                              ))}
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {item.sampleUrls?.slice(0, 2).map((u, i) => (
                                  <a key={i} href={u.url} target="_blank" rel="noopener noreferrer"
                                    style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, color: C.gold, textDecoration: "none", letterSpacing: "0.06em" }}>
                                    {u.platform} ↗
                                  </a>
                                ))}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, color: C.textDim, letterSpacing: "0.06em" }}>
                                {o.condition} · {Math.round((cond?.multiplier - 1) * 100) >= 0 ? "+" : ""}{Math.round((cond?.multiplier - 1) * 100)}% from market avg
                              </span>
                              <span style={{ color: C.textDim, fontFamily: "monospace" }}>·</span>
                              <button onClick={e => { e.stopPropagation(); removeOwned(item.id); }}
                                style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, letterSpacing: "0.08em", padding: 0 }}>
                                REMOVE
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SEARCH VIEW ── */}
        {view === "search" && (
          <div>
            {/* Search header */}
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, color: C.textDim, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 20 }}>
                Luxury Resale Intelligence
              </div>

              {/* Search bar */}
              <div style={{ display: "flex", gap: 0, marginBottom: 28, border: `1px solid ${C.border}`, borderRadius: 2, overflow: "hidden", transition: "border-color 0.2s" }}
                onFocus={() => {}} >
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    ref={inputRef}
                    type="text" value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !searching && handleSearch()}
                    placeholder="Rolex Daytona, Hermès Birkin, Cartier Love..."
                    style={{
                      width: "100%", padding: "16px 48px 16px 20px",
                      background: C.surface, border: "none",
                      color: C.text, fontSize: 15,
                      fontFamily: "'Cormorant Garamond', Georgia, serif",
                      letterSpacing: "0.02em", outline: "none",
                    }} />
                  {search && !searching && (
                    <button onClick={() => { setSearch(""); setSearchResults([]); setSearchError(null); setPlatformInfo(null); setFilterCat("All"); inputRef.current?.focus(); }}
                      style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 16, fontFamily: "monospace", lineHeight: 1 }}>
                      ×
                    </button>
                  )}
                </div>
                <button onClick={handleSearch} disabled={searching || !search.trim()}
                  style={{
                    padding: "16px 28px", background: !search.trim() ? "transparent" : C.gold,
                    border: "none", borderLeft: `1px solid ${C.border}`,
                    color: !search.trim() ? C.textDim : C.bg,
                    cursor: searching ? "wait" : !search.trim() ? "default" : "pointer",
                    fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 10,
                    letterSpacing: "0.12em", textTransform: "uppercase",
                    transition: "all 0.2s", whiteSpace: "nowrap",
                  }}>
                  {searching ? "···" : "Search"}
                </button>
              </div>

              {/* Suggestion chips */}
              {!searching && searchResults.length === 0 && !searchError && (
                <div>
                  <div style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 8, color: C.textDim, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12 }}>
                    Market Intelligence
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {POPULAR_SEARCHES.map(s => (
                      <button key={s} onClick={() => setSearch(s)}
                        style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 2, color: C.textMid, cursor: "pointer", fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, letterSpacing: "0.08em", transition: "all 0.15s" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = g(0.4); e.currentTarget.style.color = C.gold; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMid; }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Loading */}
            {searching && (
              <div style={{ padding: "60px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 4, height: 4, background: C.gold, borderRadius: "50%", animation: `pulse 1.2s ${i * 0.2}s ease-in-out infinite`, opacity: 0.6 }} />
                  ))}
                </div>
                <div style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  Querying 8 platforms
                </div>
              </div>
            )}

            {/* Error */}
            {searchError && (
              <div style={{ padding: "16px 20px", border: `1px solid rgba(224,92,92,0.2)`, borderRadius: 2, marginBottom: 20 }}>
                <div style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 10, color: C.red, letterSpacing: "0.06em" }}>{searchError}</div>
              </div>
            )}

            {/* Results */}
            {!searching && searchResults.length > 0 && (
              <div>
                {/* Results header bar */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 15, color: C.textMid }}>
                      {sortedResults.length} result{sortedResults.length !== 1 ? "s" : ""}
                    </span>
                    {platformInfo && (
                      <span style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, color: C.textDim, marginLeft: 12, letterSpacing: "0.06em" }}>
                        via {Object.values(platformInfo).filter(p => p.count > 0).map(p =>
                          p.name === "Madison Avenue Couture" ? "MAC" :
                          p.name === "Ann's Fabulous Finds" ? "AFF" :
                          p.name === "Privé Porter" ? "PP" : p.name
                        ).join(" · ")}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {resultCategories.length > 1 && (
                      <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                        style={{ padding: "5px 10px", background: C.surface, border: `1px solid ${C.border}`, color: C.textMid, fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, letterSpacing: "0.06em", outline: "none", borderRadius: 2, cursor: "pointer" }}>
                        <option value="All">All</option>
                        {resultCategories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                    <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                      style={{ padding: "5px 10px", background: C.surface, border: `1px solid ${C.border}`, color: C.textMid, fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, letterSpacing: "0.06em", outline: "none", borderRadius: 2, cursor: "pointer" }}>
                      <option value="relevance">Relevance</option>
                      <option value="price-high">Price ↓</option>
                      <option value="price-low">Price ↑</option>
                      <option value="listings">Listings</option>
                    </select>
                  </div>
                </div>

                {/* Cards grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 1, background: C.border }}>
                  {sortedResults.map((item, ri) => (
                    <div key={item.id} style={{ background: C.bg }}>
                      {renderCard(item, ri)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── CONDITION MODAL ── */}
      {conditionModal && (
        <div onClick={() => setConditionModal(null)}
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: C.surface, border: `1px solid ${C.border}`, maxWidth: 420, width: "100%", boxShadow: "0 60px 120px rgba(0,0,0,0.6)" }}>

            {/* Modal header */}
            <div style={{ padding: "24px 24px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, color: C.gold, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>{conditionModal.brand}</div>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 18, color: C.text, lineHeight: 1.3 }}>{conditionModal.name}</div>
            </div>

            {/* Condition options */}
            <div style={{ padding: "8px 0" }}>
              {CONDITIONS.map((c, ci) => {
                const ev = conditionModal.avgPrice * c.multiplier;
                return (
                  <button key={c.label} onClick={() => addOwned(conditionModal.id, c.label)}
                    style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", background: "transparent", border: "none", borderBottom: ci < CONDITIONS.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", textAlign: "left", transition: "background 0.1s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = g(0.06); }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    <div>
                      <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 15, color: C.text, marginBottom: 2 }}>{c.label}</div>
                      <div style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, color: C.textDim, letterSpacing: "0.04em" }}>{c.desc}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
                      <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 17, color: C.text }}>{fmt(ev)}</div>
                      <div style={{ fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, color: c.multiplier >= 1 ? C.green : C.textDim, letterSpacing: "0.04em" }}>
                        {c.multiplier >= 1 ? "+" : ""}{Math.round((c.multiplier - 1) * 100)}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Cancel */}
            <div style={{ padding: "0 24px 20px" }}>
              <button onClick={() => setConditionModal(null)}
                style={{ width: "100%", padding: "10px", background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, cursor: "pointer", fontFamily: "'Geist Mono', 'SF Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@300;400;500&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        ::placeholder { color: ${C.textDim}; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 15px; letter-spacing: 0.02em; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        select option { background: ${C.surface}; color: ${C.text}; }
        input:focus { outline: none; }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.4); opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

const API_URL = "";

// ── Supabase (optional auth — app works without it) ──
// To enable: create a free project at supabase.com, paste your URL + anon key
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const CONDITIONS = [
  { label: "New / Unworn", multiplier: 1.15, desc: "Tags attached, never used" },
  { label: "Excellent", multiplier: 1.0, desc: "Minimal signs of use" },
  { label: "Very Good", multiplier: 0.88, desc: "Light wear, fully functional" },
  { label: "Good", multiplier: 0.75, desc: "Moderate wear, some marks" },
  { label: "Fair", multiplier: 0.60, desc: "Visible wear, still functional" },
];

const POPULAR_SEARCHES = [
  "Rolex Daytona", "Hermès Birkin 25", "Chanel Classic Flap",
  "Cartier Love Bracelet", "Patek Philippe Nautilus 5711",
  "Louis Vuitton Neverfull", "Audemars Piguet Royal Oak", "Van Cleef Alhambra",
  "Omega Speedmaster", "Goyard St Louis Tote",
];

const CATEGORIES = ["All", "Watches", "Handbags", "Jewelry", "Shoes", "Accessories"];
const PLATFORMS_SHORT = {
  "Fashionphile": "FP", "Rebag": "RB", "Privé Porter": "PP",
  "Madison Avenue Couture": "MAC", "Ann's Fabulous Finds": "AFF",
  "eBay (Sold)": "eBay", "Beladora": "BLD", "LuxeDH": "LDH",
};

function fmt(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
}

// ── Price history tracking ──
function getPriceHistory(itemKey) {
  try { return JSON.parse(localStorage.getItem(`vault_ph_${itemKey}`) || "[]"); } catch { return []; }
}
function recordPrice(itemKey, price) {
  const h = getPriceHistory(itemKey);
  const today = new Date().toISOString().split("T")[0];
  const filtered = h.filter(e => e.date !== today);
  filtered.push({ date: today, price });
  const recent = filtered.slice(-30);
  try { localStorage.setItem(`vault_ph_${itemKey}`, JSON.stringify(recent)); } catch {}
  return recent;
}
function getTrend(history) {
  if (history.length < 2) return null;
  const old = history[0].price;
  const cur = history[history.length - 1].price;
  return ((cur - old) / old) * 100;
}

// ── Sparkline ──
function Sparkline({ data, width = 80, height = 28, color }) {
  if (!data || data.length < 2) return null;
  const prices = data.map(d => d.price);
  const mn = Math.min(...prices), mx = Math.max(...prices);
  const range = mx - mn || 1;
  const pts = prices.map((p, i) => `${(i / (prices.length - 1)) * width},${height - ((p - mn) / range) * height}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={(prices.length - 1) / (prices.length - 1) * width} cy={height - ((prices[prices.length - 1] - mn) / range) * height} r="2.5" fill={color} />
    </svg>
  );
}

// ── localStorage helpers ──
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
        key: `${item.brand}-${item.name}`.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 40),
        brand: item.brand || "Unknown",
        name: item.name || "Unknown Item",
        category: item.category || "Accessories",
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
  // ── State ──
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
  const [hoveredCard, setHoveredCard] = useState(null);

  // Auth
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState(null); // "login" | "signup" | null
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authSuccess, setAuthSuccess] = useState(null);

  // Filters
  const [filterCat, setFilterCat] = useState("All");
  const [filterPlatform, setFilterPlatform] = useState("All");
  const [filterMinPrice, setFilterMinPrice] = useState("");
  const [filterMaxPrice, setFilterMaxPrice] = useState("");
  const [sortBy, setSortBy] = useState("relevance");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const inputRef = useRef(null);

  // Price history (keyed by item.key)
  const [priceHistory, setPriceHistory] = useState({});

  // ── Auth setup ──
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Persist ──
  useEffect(() => { savePortfolio(owned); }, [owned]);
  useEffect(() => { if (allItems.length) saveItemCache(allItems); }, [allItems]);

  // Record prices when search results come in
  useEffect(() => {
    if (!searchResults.length) return;
    const newHistory = { ...priceHistory };
    for (const item of searchResults) {
      if (item.key && item.avgPrice > 0) {
        newHistory[item.key] = recordPrice(item.key, item.avgPrice);
      }
    }
    setPriceHistory(newHistory);
  }, [searchResults]);

  // Load price history on mount
  useEffect(() => {
    const h = {};
    for (const item of allItems) {
      if (item.key) h[item.key] = getPriceHistory(item.key);
    }
    setPriceHistory(h);
  }, []);

  // ── Portfolio value ──
  const totalValue = useMemo(() => owned.reduce((sum, o) => {
    const item = allItems.find(i => i.id === o.id);
    if (!item) return sum;
    return sum + item.avgPrice * (CONDITIONS.find(c => c.label === o.condition)?.multiplier || 1);
  }, 0), [owned, allItems]);

  // ── Search ──
  const handleSearch = useCallback(async () => {
    if (!search.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setPlatformInfo(null);
    setFiltersOpen(false);
    setFilterCat("All");
    setFilterPlatform("All");
    setFilterMinPrice("");
    setFilterMaxPrice("");
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

  // ── Auth actions ──
  async function handleAuth(mode) {
    if (!supabase) return;
    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccess(null);
    try {
      if (mode === "google") {
        await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
        return;
      }
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
        if (error) throw error;
        setAuthSuccess("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) throw error;
        setAuthView(null);
      }
    } catch (e) { setAuthError(e.message); }
    finally { setAuthLoading(false); }
  }
  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  // ── Portfolio actions ──
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

  // ── Filtered & sorted results ──
  const allPlatforms = useMemo(() => {
    const set = new Set();
    searchResults.forEach(r => r.sources?.forEach(s => set.add(s)));
    return [...set];
  }, [searchResults]);

  const filteredResults = useMemo(() => {
    return searchResults
      .filter(item => filterCat === "All" || item.category === filterCat)
      .filter(item => filterPlatform === "All" || item.sources?.includes(filterPlatform))
      .filter(item => !filterMinPrice || item.avgPrice >= parseFloat(filterMinPrice))
      .filter(item => !filterMaxPrice || item.avgPrice <= parseFloat(filterMaxPrice))
      .sort((a, b) => {
        if (sortBy === "price-high") return b.avgPrice - a.avgPrice;
        if (sortBy === "price-low") return a.avgPrice - b.avgPrice;
        if (sortBy === "listings") return b.numListings - a.numListings;
        return 0;
      });
  }, [searchResults, filterCat, filterPlatform, filterMinPrice, filterMaxPrice, sortBy]);

  const activeFilterCount = [
    filterCat !== "All", filterPlatform !== "All",
    !!filterMinPrice, !!filterMaxPrice, sortBy !== "relevance"
  ].filter(Boolean).length;

  // ── Design tokens ──
  const C = {
    bg: "#08090a", surface: "#0f1012", surfaceHover: "#141618",
    border: "rgba(255,255,255,0.06)", borderGold: "rgba(196,160,82,0.25)",
    gold: "#c4a052", goldDim: "rgba(196,160,82,0.12)",
    text: "#e2ddd6", textMid: "#8a8278", textDim: "#4a4642",
    red: "#e05c5c", green: "#4aab7a",
  };
  const g = (a) => `rgba(196,160,82,${a})`;
  const w = (a) => `rgba(255,255,255,${a})`;
  const MONO = "'Geist Mono', 'SF Mono', 'Consolas', monospace";
  const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";

  // ── Search result card ──
  const renderCard = (item) => {
    const io = isOwned(item.id);
    const oc = getOwnedCond(item.id);
    const isHov = hoveredCard === item.id;
    const ph = item.key ? (priceHistory[item.key] || getPriceHistory(item.key)) : [];
    const trend = getTrend(ph);
    const trendColor = trend === null ? C.textDim : trend >= 0 ? C.green : C.red;

    return (
      <div key={item.id}
        onMouseEnter={() => setHoveredCard(item.id)}
        onMouseLeave={() => setHoveredCard(null)}
        style={{
          background: io ? `linear-gradient(135deg, ${g(0.07)}, ${g(0.03)})` : isHov ? C.surfaceHover : C.surface,
          border: `1px solid ${io ? C.borderGold : isHov ? w(0.1) : C.border}`,
          borderRadius: 3, padding: "22px 22px 18px",
          transition: "all 0.22s cubic-bezier(0.4,0,0.2,1)",
          position: "relative", overflow: "hidden",
        }}>

        {io && <div style={{ position: "absolute", top: 0, right: 0, width: 36, height: 36, background: `linear-gradient(225deg, ${g(0.35)}, transparent)`, borderRadius: "0 3px 0 0" }} />}

        {/* Header */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, justifyContent: "space-between" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.gold, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 5, fontWeight: 500 }}>
              {item.brand} <span style={{ color: C.textDim, letterSpacing: "0.06em" }}>· {item.category}</span>
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 17, color: C.text, lineHeight: 1.3, letterSpacing: "0.01em" }}>
              {item.name}
            </div>
          </div>
          {item.imageUrl ? (
            <img src={item.imageUrl} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 2, flexShrink: 0, filter: "brightness(0.95) contrast(1.05)" }} onError={e => { e.target.style.display = "none"; }} />
          ) : (
            <div style={{ width: 56, height: 56, border: `1px solid ${C.border}`, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 20, flexShrink: 0, fontFamily: SERIF }}>{item.category === "Watches" ? "◷" : item.category === "Handbags" ? "◻" : item.category === "Jewelry" ? "◇" : "○"}</div>
          )}
        </div>

        {/* Price + sparkline */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 30, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
              {fmt(item.avgPrice)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{fmt(item.lowPrice)} — {fmt(item.highPrice)}</span>
              {trend !== null && (
                <span style={{ fontFamily: MONO, fontSize: 9, color: trendColor }}>
                  {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          {ph.length >= 2 ? (
            <Sparkline data={ph} color={trendColor} />
          ) : (
            <div style={{ width: 80, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.04em" }}>NO HISTORY</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: C.border, marginBottom: 12 }} />

        {/* Sources + listings */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {item.sources.slice(0, 4).map(s => (
              <span key={s} style={{ fontFamily: MONO, fontSize: 8, color: C.textMid, padding: "2px 5px", border: `1px solid ${C.border}`, borderRadius: 2, letterSpacing: "0.04em" }}>
                {PLATFORMS_SHORT[s] || s.slice(0, 5).toUpperCase()}
              </span>
            ))}
            {item.sources.length > 4 && <span style={{ fontFamily: MONO, fontSize: 8, color: C.textDim }}>+{item.sources.length - 4}</span>}
          </div>
          <span style={{ fontFamily: MONO, fontSize: 8, color: C.textDim }}>{item.numListings} listing{item.numListings !== 1 ? "s" : ""}</span>
        </div>

        {/* Action */}
        {io ? (
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1, padding: "8px 10px", background: g(0.1), border: `1px solid ${C.borderGold}`, borderRadius: 2, fontFamily: MONO, fontSize: 9, color: C.gold, textAlign: "center", letterSpacing: "0.08em" }}>
              ✓ IN VAULT · {oc?.toUpperCase()}
            </div>
            <button onClick={() => removeOwned(item.id)} style={{ padding: "8px 10px", background: "transparent", border: `1px solid rgba(224,92,92,0.2)`, borderRadius: 2, color: C.red, cursor: "pointer", fontFamily: MONO, fontSize: 9, letterSpacing: "0.04em", transition: "all 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(224,92,92,0.08)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              REMOVE
            </button>
          </div>
        ) : (
          <button onClick={() => setConditionModal(item)} style={{ width: "100%", padding: "9px", background: isHov ? g(0.12) : "transparent", border: `1px solid ${isHov ? C.borderGold : C.border}`, borderRadius: 2, color: isHov ? C.gold : C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", transition: "all 0.2s" }}>
            ADD TO VAULT
          </button>
        )}
      </div>
    );
  };

  // ── Main render ──
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: SERIF, position: "relative" }}>

      {/* Ambient glows */}
      <div style={{ position: "fixed", top: "15%", right: "-8%", width: "35vw", height: "35vw", background: `radial-gradient(ellipse, ${g(0.04)} 0%, transparent 65%)`, pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", bottom: "5%", left: "-5%", width: "28vw", height: "28vw", background: `radial-gradient(ellipse, ${g(0.03)} 0%, transparent 70%)`, pointerEvents: "none", zIndex: 0 }} />

      {/* ── HEADER ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, borderBottom: `1px solid ${C.border}`, background: "rgba(8,9,10,0.94)", backdropFilter: "blur(24px)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>

          {/* Wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="1" y="1" width="18" height="18" stroke={C.gold} strokeWidth="1" fill="none"/>
              <rect x="4.5" y="4.5" width="11" height="11" fill={C.gold} opacity="0.15"/>
              <text x="10" y="14" textAnchor="middle" fill={C.gold} fontSize="9" fontFamily="Georgia, serif">V</text>
            </svg>
            <span style={{ fontFamily: SERIF, fontSize: 17, letterSpacing: "0.22em", color: C.text, textTransform: "uppercase", fontWeight: 400 }}>Vault</span>
          </div>

          {/* Nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {[
              { key: "portfolio", label: owned.length > 0 ? `Portfolio (${owned.length})` : "Portfolio" },
              { key: "search", label: "Search" },
            ].map(v => (
              <button key={v.key} onClick={() => { setView(v.key); setSelectedItem(null); }}
                style={{ padding: "0 18px", height: 56, background: "none", border: "none", borderBottom: view === v.key ? `1px solid ${C.gold}` : "1px solid transparent", color: view === v.key ? C.gold : C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", transition: "all 0.2s", marginBottom: -1 }}>
                {v.label}
              </button>
            ))}

            {/* Auth button */}
            {supabase && (
              user ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 16, paddingLeft: 16, borderLeft: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.06em" }}>{user.email?.split("@")[0]}</span>
                  <button onClick={handleSignOut} style={{ padding: "5px 10px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 2, color: C.textDim, cursor: "pointer", fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em" }}>OUT</button>
                </div>
              ) : (
                <button onClick={() => setAuthView("login")} style={{ marginLeft: 16, padding: "7px 14px", background: "transparent", border: `1px solid ${C.borderGold}`, borderRadius: 2, color: C.gold, cursor: "pointer", fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em" }}>
                  SIGN IN
                </button>
              )
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "44px 32px 100px", position: "relative", zIndex: 1 }}>

        {/* ── PORTFOLIO VIEW ── */}
        {view === "portfolio" && (
          <div>
            {/* Header */}
            <div style={{ marginBottom: 48, paddingBottom: 36, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 14 }}>
                Portfolio Value · {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 60, fontWeight: 300, letterSpacing: "-0.03em", lineHeight: 1, color: C.text, marginBottom: 12 }}>
                {fmt(totalValue)}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.06em" }}>
                {owned.length === 0 ? "No items tracked" : `${owned.length} item${owned.length !== 1 ? "s" : ""}`}
                {!supabase && owned.length > 0 && <span style={{ marginLeft: 12, color: C.textDim, fontSize: 9 }}>· Saved locally · Sign in to sync across devices</span>}
                {supabase && !user && owned.length > 0 && <span style={{ marginLeft: 12 }}><button onClick={() => setAuthView("login")} style={{ background: "none", border: "none", color: C.gold, cursor: "pointer", fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", padding: 0 }}>Sign in to sync →</button></span>}
              </div>
            </div>

            {owned.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 24px" }}>
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none" style={{ margin: "0 auto 24px", display: "block", opacity: 0.18 }}>
                  <rect x="2" y="2" width="40" height="40" stroke={C.gold} strokeWidth="1" fill="none"/>
                  <rect x="9" y="9" width="26" height="26" stroke={C.gold} strokeWidth="0.5" fill="none"/>
                  <line x1="22" y1="9" x2="22" y2="35" stroke={C.gold} strokeWidth="0.5"/>
                  <line x1="9" y1="22" x2="35" y2="22" stroke={C.gold} strokeWidth="0.5"/>
                </svg>
                <div style={{ fontFamily: SERIF, fontSize: 22, color: C.textMid, marginBottom: 10, fontWeight: 300 }}>Your portfolio is empty</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, marginBottom: 32, letterSpacing: "0.04em" }}>Search luxury goods to begin tracking market value</div>
                <button onClick={() => setView("search")} style={{ padding: "10px 28px", background: "transparent", border: `1px solid ${C.borderGold}`, borderRadius: 2, color: C.gold, cursor: "pointer", fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}
                  onMouseEnter={e => e.currentTarget.style.background = g(0.1)}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  Begin Search
                </button>
              </div>
            ) : (
              <div>
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 130px 130px 90px 90px", gap: 16, padding: "0 0 10px", borderBottom: `1px solid ${C.border}`, marginBottom: 2 }}>
                  {["Item", "Condition", "Market Avg", "Your Value", "Trend", ""].map((h, i) => (
                    <div key={h} style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", textTransform: "uppercase", textAlign: i >= 2 ? "right" : "left" }}>{h}</div>
                  ))}
                </div>

                {owned.map((o) => {
                  const item = allItems.find(i => i.id === o.id);
                  if (!item) return null;
                  const cond = CONDITIONS.find(c => c.label === o.condition);
                  const val = item.avgPrice * (cond?.multiplier || 1);
                  const isSel = selectedItem?.id === item.id;
                  const ph = item.key ? (priceHistory[item.key] || []) : [];
                  const trend = getTrend(ph);
                  const trendColor = trend === null ? C.textDim : trend >= 0 ? C.green : C.red;

                  return (
                    <div key={o.id}>
                      <div onClick={() => setSelectedItem(isSel ? null : item)}
                        style={{ display: "grid", gridTemplateColumns: "1fr 130px 130px 130px 90px 90px", gap: 16, padding: "15px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer", transition: "background 0.12s" }}
                        onMouseEnter={e => e.currentTarget.style.background = w(0.02)}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>

                        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 1, flexShrink: 0 }} onError={e => e.target.style.display = "none"} />
                          ) : (
                            <div style={{ width: 36, height: 36, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 14, flexShrink: 0 }}>○</div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontFamily: MONO, fontSize: 8, color: C.gold, letterSpacing: "0.1em", marginBottom: 3, textTransform: "uppercase" }}>{item.brand}</div>
                            <div style={{ fontFamily: SERIF, fontSize: 15, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                          </div>
                        </div>

                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMid, display: "flex", alignItems: "center" }}>{o.condition}</div>
                        <div style={{ fontFamily: SERIF, fontSize: 16, color: C.textMid, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{fmt(item.avgPrice)}</div>
                        <div style={{ fontFamily: SERIF, fontSize: 16, color: C.text, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{fmt(val)}</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                          {ph.length >= 2 ? (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                              <Sparkline data={ph} width={60} height={20} color={trendColor} />
                              <span style={{ fontFamily: MONO, fontSize: 8, color: trendColor }}>{trend >= 0 ? "▲" : "▼"}{Math.abs(trend).toFixed(1)}%</span>
                            </div>
                          ) : <span style={{ fontFamily: MONO, fontSize: 8, color: C.textDim }}>—</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                          <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{isSel ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {isSel && (
                        <div style={{ padding: "20px 0 20px 48px", borderBottom: `1px solid ${C.border}`, background: g(0.03) }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 110px) 1fr", gap: 24, marginBottom: 14 }}>
                            {[{ l: "Low", v: fmt(item.lowPrice), c: C.red }, { l: "Average", v: fmt(item.avgPrice), c: C.textMid }, { l: "High", v: fmt(item.highPrice), c: C.green }].map(s => (
                              <div key={s.l}>
                                <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", marginBottom: 5, textTransform: "uppercase" }}>{s.l}</div>
                                <div style={{ fontFamily: SERIF, fontSize: 18, color: s.c }}>{s.v}</div>
                              </div>
                            ))}
                            <div>
                              <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", marginBottom: 5, textTransform: "uppercase" }}>Sources</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {item.sampleUrls?.slice(0, 3).map((u, i) => (
                                  <a key={i} href={u.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: MONO, fontSize: 9, color: C.gold, textDecoration: "none", letterSpacing: "0.04em" }}>{PLATFORMS_SHORT[u.platform] || u.platform} ↗</a>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{o.condition} · {Math.round((cond?.multiplier - 1) * 100) >= 0 ? "+" : ""}{Math.round((cond?.multiplier - 1) * 100)}% from avg</span>
                            <span style={{ color: C.textDim }}>·</span>
                            <button onClick={e => { e.stopPropagation(); removeOwned(item.id); }} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontFamily: MONO, fontSize: 9, padding: 0 }}>REMOVE</button>
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

        {/* ── SEARCH VIEW ── */}
        {view === "search" && (
          <div>
            <div style={{ marginBottom: 36 }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 18 }}>Luxury Resale Intelligence</div>

              {/* Search bar */}
              <div style={{ display: "flex", gap: 0, border: `1px solid ${C.border}`, borderRadius: 2, overflow: "hidden", marginBottom: 20 }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <input ref={inputRef} type="text" value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !searching && handleSearch()}
                    placeholder="Rolex Daytona, Hermès Birkin, Cartier Love..."
                    style={{ width: "100%", padding: "15px 44px 15px 18px", background: C.surface, border: "none", color: C.text, fontSize: 15, fontFamily: SERIF, letterSpacing: "0.02em", outline: "none" }} />
                  {search && !searching && (
                    <button onClick={() => { setSearch(""); setSearchResults([]); setSearchError(null); setPlatformInfo(null); inputRef.current?.focus(); }}
                      style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
                  )}
                </div>
                <button onClick={handleSearch} disabled={searching || !search.trim()}
                  style={{ padding: "15px 24px", background: !search.trim() ? "transparent" : C.gold, border: "none", borderLeft: `1px solid ${C.border}`, color: !search.trim() ? C.textDim : C.bg, cursor: searching ? "wait" : !search.trim() ? "default" : "pointer", fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", transition: "all 0.2s", whiteSpace: "nowrap", opacity: !search.trim() ? 0.5 : 1 }}>
                  {searching ? "···" : "Search"}
                </button>
              </div>

              {/* Suggestion chips */}
              {!searching && searchResults.length === 0 && !searchError && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>Market Intelligence</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {POPULAR_SEARCHES.map(s => (
                      <button key={s} onClick={() => setSearch(s)}
                        style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 2, color: C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", transition: "all 0.15s" }}
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
              <div style={{ padding: "60px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {[0, 1, 2].map(i => (<div key={i} style={{ width: 4, height: 4, background: C.gold, borderRadius: "50%", animation: `pulse 1.2s ${i * 0.2}s ease-in-out infinite` }} />))}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase" }}>Querying 8 platforms</div>
              </div>
            )}

            {/* Error */}
            {searchError && (
              <div style={{ padding: "14px 18px", border: `1px solid rgba(224,92,92,0.2)`, borderRadius: 2, marginBottom: 20 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.red, letterSpacing: "0.04em" }}>{searchError}</div>
              </div>
            )}

            {/* Results */}
            {!searching && searchResults.length > 0 && (
              <div>
                {/* Results bar + filters toggle */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: SERIF, fontSize: 15, color: C.textMid }}>
                      {filteredResults.length} result{filteredResults.length !== 1 ? "s" : ""}
                    </span>
                    {platformInfo && (
                      <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.05em" }}>
                        via {Object.values(platformInfo).filter(p => p.count > 0).map(p => PLATFORMS_SHORT[p.name] || p.name).join(" · ")}
                      </span>
                    )}
                  </div>
                  <button onClick={() => setFiltersOpen(f => !f)}
                    style={{ padding: "6px 12px", background: filtersOpen ? g(0.1) : "transparent", border: `1px solid ${activeFilterCount > 0 ? C.borderGold : C.border}`, borderRadius: 2, color: activeFilterCount > 0 ? C.gold : C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 6 }}>
                    FILTERS {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}
                  </button>
                </div>

                {/* Filter panel */}
                {filtersOpen && (
                  <div style={{ padding: "20px 24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, marginBottom: 20, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 20 }}>

                    {/* Category */}
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>Category</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {CATEGORIES.map(c => (
                          <button key={c} onClick={() => setFilterCat(c)}
                            style={{ padding: "4px 8px", background: filterCat === c ? g(0.15) : "transparent", border: `1px solid ${filterCat === c ? C.borderGold : C.border}`, borderRadius: 2, color: filterCat === c ? C.gold : C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 8, letterSpacing: "0.06em" }}>
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Platform */}
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>Platform</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {["All", ...allPlatforms].map(p => (
                          <button key={p} onClick={() => setFilterPlatform(p)}
                            style={{ padding: "4px 8px", background: filterPlatform === p ? g(0.15) : "transparent", border: `1px solid ${filterPlatform === p ? C.borderGold : C.border}`, borderRadius: 2, color: filterPlatform === p ? C.gold : C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 8, letterSpacing: "0.06em" }}>
                            {p === "All" ? "All" : (PLATFORMS_SHORT[p] || p.slice(0, 8))}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Price range */}
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>Price Range</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="number" placeholder="Min" value={filterMinPrice} onChange={e => setFilterMinPrice(e.target.value)}
                          style={{ width: "100%", padding: "6px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, color: C.text, fontFamily: MONO, fontSize: 10, outline: "none" }} />
                        <span style={{ color: C.textDim, fontFamily: MONO, fontSize: 10 }}>—</span>
                        <input type="number" placeholder="Max" value={filterMaxPrice} onChange={e => setFilterMaxPrice(e.target.value)}
                          style={{ width: "100%", padding: "6px 8px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, color: C.text, fontFamily: MONO, fontSize: 10, outline: "none" }} />
                      </div>
                    </div>

                    {/* Sort */}
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>Sort By</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {[["relevance", "Relevance"], ["price-high", "Price ↓"], ["price-low", "Price ↑"], ["listings", "Listings"]].map(([val, label]) => (
                          <button key={val} onClick={() => setSortBy(val)}
                            style={{ padding: "4px 8px", background: sortBy === val ? g(0.15) : "transparent", border: `1px solid ${sortBy === val ? C.borderGold : C.border}`, borderRadius: 2, color: sortBy === val ? C.gold : C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 8, letterSpacing: "0.06em" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reset */}
                    {activeFilterCount > 0 && (
                      <div style={{ display: "flex", alignItems: "flex-end" }}>
                        <button onClick={() => { setFilterCat("All"); setFilterPlatform("All"); setFilterMinPrice(""); setFilterMaxPrice(""); setSortBy("relevance"); }}
                          style={{ padding: "6px 12px", background: "transparent", border: `1px solid rgba(224,92,92,0.2)`, borderRadius: 2, color: C.red, cursor: "pointer", fontFamily: MONO, fontSize: 8, letterSpacing: "0.08em" }}>
                          RESET ALL
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 1, background: C.border }}>
                  {filteredResults.map(item => (
                    <div key={item.id} style={{ background: C.bg }}>{renderCard(item)}</div>
                  ))}
                </div>

                {filteredResults.length === 0 && (
                  <div style={{ padding: "40px 0", textAlign: "center", fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.08em" }}>
                    No results match current filters
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── AUTH MODAL ── */}
      {authView && supabase && (
        <div onClick={() => setAuthView(null)} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, maxWidth: 380, width: "100%", boxShadow: "0 60px 120px rgba(0,0,0,0.7)" }}>

            <div style={{ padding: "28px 28px 24px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.gold, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>Vault</div>
              <div style={{ fontFamily: SERIF, fontSize: 20, color: C.text }}>{authView === "login" ? "Sign in to your vault" : "Create your vault"}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginTop: 4, letterSpacing: "0.04em" }}>Sync your portfolio across all devices</div>
            </div>

            <div style={{ padding: "24px 28px" }}>
              {/* Google OAuth */}
              <button onClick={() => handleAuth("google")} disabled={authLoading}
                style={{ width: "100%", padding: "11px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 2, color: C.text, cursor: "pointer", fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = w(0.15)}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                <svg width="14" height="14" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Continue with Google
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <span style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.08em" }}>OR</span>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                <input type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                  style={{ padding: "11px 14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, color: C.text, fontFamily: MONO, fontSize: 11, outline: "none", letterSpacing: "0.04em" }} />
                <input type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAuth(authView)}
                  style={{ padding: "11px 14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, color: C.text, fontFamily: MONO, fontSize: 11, outline: "none", letterSpacing: "0.04em" }} />
              </div>

              {authError && <div style={{ fontFamily: MONO, fontSize: 9, color: C.red, marginBottom: 12, letterSpacing: "0.04em" }}>{authError}</div>}
              {authSuccess && <div style={{ fontFamily: MONO, fontSize: 9, color: C.green, marginBottom: 12, letterSpacing: "0.04em" }}>{authSuccess}</div>}

              <button onClick={() => handleAuth(authView)} disabled={authLoading || !authEmail || !authPassword}
                style={{ width: "100%", padding: "11px", background: C.gold, border: "none", borderRadius: 2, color: C.bg, cursor: authLoading ? "wait" : "pointer", fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", transition: "opacity 0.15s", opacity: authLoading || !authEmail || !authPassword ? 0.5 : 1 }}>
                {authLoading ? "···" : authView === "login" ? "Sign In" : "Create Account"}
              </button>

              <div style={{ marginTop: 16, textAlign: "center" }}>
                <button onClick={() => { setAuthView(authView === "login" ? "signup" : "login"); setAuthError(null); setAuthSuccess(null); }}
                  style={{ background: "none", border: "none", color: C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em" }}>
                  {authView === "login" ? "No account? Create one →" : "Have an account? Sign in →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CONDITION MODAL ── */}
      {conditionModal && (
        <div onClick={() => setConditionModal(null)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, maxWidth: 420, width: "100%", boxShadow: "0 60px 120px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "24px 24px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.gold, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 5 }}>{conditionModal.brand}</div>
              <div style={{ fontFamily: SERIF, fontSize: 18, color: C.text, lineHeight: 1.3 }}>{conditionModal.name}</div>
            </div>
            <div>
              {CONDITIONS.map((c, ci) => {
                const ev = conditionModal.avgPrice * c.multiplier;
                return (
                  <button key={c.label} onClick={() => addOwned(conditionModal.id, c.label)}
                    style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 24px", background: "transparent", border: "none", borderBottom: ci < CONDITIONS.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", transition: "background 0.1s", textAlign: "left" }}
                    onMouseEnter={e => e.currentTarget.style.background = g(0.06)}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div>
                      <div style={{ fontFamily: SERIF, fontSize: 15, color: C.text, marginBottom: 2 }}>{c.label}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.04em" }}>{c.desc}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
                      <div style={{ fontFamily: SERIF, fontSize: 17, color: C.text }}>{fmt(ev)}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: c.multiplier >= 1 ? C.green : C.textDim }}>{c.multiplier >= 1 ? "+" : ""}{Math.round((c.multiplier - 1) * 100)}%</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{ padding: "12px 24px 20px" }}>
              <button onClick={() => setConditionModal(null)} style={{ width: "100%", padding: "10px", background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, cursor: "pointer", fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", borderRadius: 2 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@300;400;500&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        ::placeholder { color: #4a4642; font-family: 'Cormorant Garamond', Georgia, serif; letter-spacing: 0.02em; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 2px; }
        select option, input { background: #08090a; color: #e2ddd6; }
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.5); opacity: 1; } }
      `}</style>
    </div>
  );
}

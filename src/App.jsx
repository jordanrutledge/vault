import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

const API_URL = "";
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
const PURCHASE_LOCATIONS = ["Boutique", "eBay", "Fashionphile", "Rebag", "Privé Porter", "Consignment", "Private Sale", "Gift", "Auction", "Other"];
const PRESET_TAGS = ["Investment", "Daily Use", "Special Occasion", "Grail", "Gift", "Inherited", "Vintage", "Limited Edition", "Reselling"];

const PLATFORMS_SHORT = {
  "Fashionphile": "FP", "Rebag": "RB", "Privé Porter": "PP",
  "Madison Avenue Couture": "MAC", "Ann's Fabulous Finds": "AFF",
  "eBay (Sold)": "eBay", "Beladora": "BLD", "LuxeDH": "LDH",
};

function fmt(n) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0); }
function fmtDate(d) { if (!d) return "—"; return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }

// Price history
function getPriceHistory(k) { try { return JSON.parse(localStorage.getItem(`vault_ph_${k}`) || "[]"); } catch { return []; } }
function recordPrice(k, price) {
  const h = getPriceHistory(k);
  const today = new Date().toISOString().split("T")[0];
  const filtered = h.filter(e => e.date !== today);
  filtered.push({ date: today, price });
  const recent = filtered.slice(-30);
  try { localStorage.setItem(`vault_ph_${k}`, JSON.stringify(recent)); } catch {}
  return recent;
}
function getTrend(history) {
  if (!history || history.length < 2) return null;
  return ((history[history.length - 1].price - history[0].price) / history[0].price) * 100;
}

const FRONTEND_BRANDS = [
  "Rolex","Patek Philippe","Audemars Piguet","Omega","Cartier","Hermès","Hermes",
  "Chanel","Louis Vuitton","Gucci","Prada","Dior","Christian Dior","Goyard",
  "Van Cleef & Arpels","Tiffany","Bottega Veneta","Celine","Bulgari","Bvlgari",
  "Nike","Jordan","IWC","Tudor","Breitling","Hublot","Panerai","Fendi",
  "Balenciaga","Saint Laurent","Valentino","Givenchy","Loewe","Miu Miu",
  "Versace","Burberry","Chloe","Rimowa","TAG Heuer","Zenith","Jaeger-LeCoultre",
  "Vacheron Constantin","Richard Mille","Piaget",
];
function extractBrand(q) {
  const l = (q || "").toLowerCase();
  for (const b of FRONTEND_BRANDS) { if (l.includes(b.toLowerCase())) return b; }
  return "";
}

function Sparkline({ data, width = 80, height = 28, color }) {
  if (!data || data.length < 2) return null;
  const prices = data.map(d => d.price);
  const mn = Math.min(...prices), mx = Math.max(...prices), range = mx - mn || 1;
  const pts = prices.map((p, i) => `${(i / (prices.length - 1)) * width},${height - ((p - mn) / range) * height}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={(prices.length - 1) / (prices.length - 1) * width} cy={height - ((prices[prices.length - 1] - mn) / range) * height} r="2.5" fill={color} />
    </svg>
  );
}

function loadPortfolio() { try { return JSON.parse(localStorage.getItem("vault_portfolio") || "[]"); } catch { return []; } }
function savePortfolio(i) { try { localStorage.setItem("vault_portfolio", JSON.stringify(i)); } catch {} }
function loadItemCache() { try { return JSON.parse(localStorage.getItem("vault_items") || "[]"); } catch { return []; } }
function saveItemCache(i) { try { localStorage.setItem("vault_items", JSON.stringify(i)); } catch {} }

async function searchAPI(query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28000);
  try {
    const resp = await fetch(`${API_URL}/api/search`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 30 }), signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    return {
      items: (data.items || []).map((item, i) => ({
        id: `api-${Date.now()}-${i}`,
        key: `${item.brand}-${item.name}`.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 40),
        brand: item.brand || "Unknown", name: item.name || "Unknown Item",
        category: item.category || "Accessories",
        avgPrice: item.avgPrice || 0, highPrice: item.highPrice || 0, lowPrice: item.lowPrice || 0,
        numListings: item.numListings || 0, sources: item.sources || [],
        imageUrl: item.imageUrl || null, sampleUrls: item.sampleUrls || [],
      })),
      platforms: data.platforms || {}, totalListings: data.totalListings || 0,
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") throw new Error("Search timed out — try again");
    throw err;
  }
}

// ── Landing Page ──
function LandingPage({ onEnter, C, g, MONO, SERIF }) {
  const scrollRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    const card = cardRef.current;
    if (!el || !card) return;

    function onScroll() {
      const y = el.scrollTop;
      const tilt = Math.max(0, 35 - (y / 500) * 35);
      const sc = Math.min(1, 0.7 + (y / 500) * 0.3);
      const shadow = `0 ${30 + tilt * 3}px ${80 + tilt * 6}px rgba(0,0,0,0.75), 0 0 80px rgba(196,160,82,0.06)`;
      card.style.transform = `rotateX(${tilt}deg) scale(${sc})`;
      card.style.boxShadow = shadow;
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const BRANDS = ["Rolex", "Hermès", "Chanel", "Cartier", "Patek Philippe", "Louis Vuitton", "Audemars Piguet", "Van Cleef & Arpels", "Omega", "Goyard", "Dior", "Bottega Veneta", "Bulgari", "Tiffany & Co", "Prada"];

  return (
    <div ref={scrollRef} style={{ height: "100vh", overflowY: "auto", background: C.bg, color: C.text, fontFamily: SERIF, position: "relative" }}>
      <div style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", width: "80vw", height: "50vh", background: `radial-gradient(ellipse, ${g(0.07)} 0%, transparent 60%)`, pointerEvents: "none", zIndex: 0 }} />

      {/* Nav */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, padding: "0 40px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(8,9,10,0.75)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${g(0.08)}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="1" y="1" width="18" height="18" stroke={C.gold} strokeWidth="1" fill="none"/><rect x="4.5" y="4.5" width="11" height="11" fill={C.gold} opacity="0.15"/><text x="10" y="14" textAnchor="middle" fill={C.gold} fontSize="9" fontFamily="Georgia,serif">V</text></svg>
          <span style={{ fontFamily: SERIF, fontSize: 15, letterSpacing: "0.22em", color: C.text, textTransform: "uppercase" }}>Vault</span>
        </div>
        <button onClick={onEnter} style={{ padding: "7px 18px", background: "transparent", border: `1px solid ${g(0.3)}`, borderRadius: 2, color: C.gold, cursor: "pointer", fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", transition: "all 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.background = g(0.1)} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          ENTER APP
        </button>
      </header>

      {/* Hero */}
      <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 52, paddingBottom: 40, paddingLeft: 24, paddingRight: 24, position: "relative", zIndex: 1, textAlign: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: C.gold, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 28, padding: "5px 14px", border: `1px solid ${g(0.25)}`, background: g(0.06), display: "inline-block" }}>
          Luxury Resale Intelligence
        </div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: "clamp(40px, 7vw, 84px)", lineHeight: 1.06, letterSpacing: "-0.03em", color: C.text, maxWidth: 860, marginBottom: 24 }}>
          Know what your <span style={{ color: C.gold, fontStyle: "italic" }}>collection</span> is worth
        </h1>
        <p style={{ fontFamily: MONO, fontSize: 11, color: C.textMid, letterSpacing: "0.05em", maxWidth: 500, lineHeight: 1.85, marginBottom: 44 }}>
          Live resale market data for watches, handbags, and jewelry — aggregated across 8 platforms, updated in real time.
        </p>
        <div style={{ display: "flex", gap: 12, marginBottom: 72, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={onEnter} style={{ padding: "14px 40px", background: C.gold, border: "none", borderRadius: 2, color: C.bg, cursor: "pointer", fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 500, transition: "opacity 0.15s" }} onMouseEnter={e => e.currentTarget.style.opacity = "0.85"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
            Start Tracking
          </button>
          <button onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.clientHeight * 0.85, behavior: "smooth" })}
            style={{ padding: "14px 36px", background: "transparent", border: `1px solid ${g(0.22)}`, borderRadius: 2, color: C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = g(0.5); e.currentTarget.style.color = C.gold; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = g(0.22); e.currentTarget.style.color = C.textMid; }}>
            See How It Works
          </button>
        </div>

        {/* 3D scroll card */}
        <div style={{ width: "100%", maxWidth: 860, perspective: "1400px", perspectiveOrigin: "50% -10%" }}>
          <div ref={cardRef}
            style={{ width: "100%", transform: "rotateX(35deg) scale(0.7)", transformOrigin: "top center", border: `1px solid ${g(0.18)}`, borderRadius: 6, overflow: "hidden", boxShadow: `0 135px 290px rgba(0,0,0,0.75), 0 0 80px ${g(0.06)}`, willChange: "transform, box-shadow" }}>
            {/* Browser chrome */}
            <div style={{ background: "#111215", padding: "10px 14px", borderBottom: `1px solid ${g(0.1)}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", gap: 5 }}>{["#e05c5c","#d4a72c","#4aab7a"].map((c,i) => <div key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: 0.7 }} />)}</div>
              <div style={{ flex: 1, margin: "0 12px", padding: "4px 12px", background: g(0.05), border: `1px solid ${g(0.1)}`, fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.04em", textAlign: "center" }}>vault.rutledge.app</div>
            </div>
            {/* Mock UI */}
            <div style={{ background: C.bg, padding: "24px 32px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, paddingBottom: 16, borderBottom: `1px solid ${g(0.07)}` }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 7, color: C.textDim, letterSpacing: "0.12em", marginBottom: 6 }}>PORTFOLIO · APRIL 2026</div>
                  <div style={{ fontFamily: SERIF, fontSize: 40, color: C.text, letterSpacing: "-0.03em", lineHeight: 1 }}>$124,800</div>
                </div>
                <div style={{ display: "flex", gap: 24 }}>
                  {[["COST BASIS","$98,200",C.textMid],["UNREALIZED P&L","+$26,600",C.green]].map(([l,v,c]) => (
                    <div key={l} style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: MONO, fontSize: 7, color: C.textDim, letterSpacing: "0.1em", marginBottom: 4 }}>{l}</div>
                      <div style={{ fontFamily: SERIF, fontSize: 22, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              {[
                ["ROLEX","Daytona 116500LN","Excellent","$28,400","$28,400","+$6,400",true],
                ["HERMÈS","Birkin 25 Togo Noir","New / Unworn","$38,200","$43,930","+$13,930",true],
                ["CHANEL","Classic Flap Medium","Very Good","$9,800","$8,624","-$1,376",false],
                ["AUDEMARS PIGUET","Royal Oak 15500ST","Excellent","$44,400","$44,400","+$8,400",true],
              ].map(([brand,name,cond,mkt,val,pnl,pos],i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 100px 90px", gap: 12, padding: "10px 0", borderBottom: `1px solid ${g(0.05)}`, alignItems: "center" }}>
                  <div><div style={{ fontFamily: MONO, fontSize: 7, color: C.gold, letterSpacing: "0.1em", marginBottom: 2 }}>{brand}</div><div style={{ fontFamily: SERIF, fontSize: 12, color: C.text }}>{name}</div></div>
                  <div style={{ fontFamily: MONO, fontSize: 8, color: C.textMid }}>{cond}</div>
                  <div style={{ fontFamily: SERIF, fontSize: 12, color: C.textMid, textAlign: "right" }}>{mkt}</div>
                  <div style={{ fontFamily: SERIF, fontSize: 12, color: C.text, textAlign: "right" }}>{val}</div>
                  <div style={{ fontFamily: SERIF, fontSize: 12, color: pos ? C.green : C.red, textAlign: "right" }}>{pnl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Scroll cue */}
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: 0.4, animation: "fadeUpDown 2.2s ease-in-out infinite" }}>
          <div style={{ fontFamily: MONO, fontSize: 7, color: C.textDim, letterSpacing: "0.14em" }}>SCROLL</div>
          <svg width="10" height="14" viewBox="0 0 10 14" fill="none"><path d="M5 0v11M1 7l4 5 4-5" stroke={C.textDim} strokeWidth="1" strokeLinecap="round"/></svg>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "80px 40px", position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.gold, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 14 }}>How It Works</div>
            <div style={{ fontFamily: SERIF, fontSize: "clamp(26px, 4vw, 42px)", color: C.text, fontWeight: 300 }}>Market intelligence for serious collectors</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", border: `1px solid ${g(0.12)}` }}>
            {[
              { stat: "8", label: "Live Platforms", desc: "Fashionphile, Rebag, Privé Porter, eBay & more scraped in real time" },
              { stat: "Live", label: "Market Pricing", desc: "IQR-filtered across thousands of listings — no outliers, no noise" },
              { stat: "Full", label: "Portfolio Analytics", desc: "Cost basis, P&L, trends, sparklines, tags, condition tracking" },
            ].map((f, i, arr) => (
              <div key={i} style={{ padding: "36px 30px", background: C.bg, borderRight: i < arr.length - 1 ? `1px solid ${g(0.1)}` : "none" }}>
                <div style={{ fontFamily: SERIF, fontSize: 44, color: C.gold, letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 10 }}>{f.stat}</div>
                <div style={{ fontFamily: MONO, fontSize: 8, color: C.textMid, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>{f.label}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, lineHeight: 1.75 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Brand ticker */}
      <section style={{ padding: "0 0 80px", overflow: "hidden", position: "relative", zIndex: 1 }}>
        <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.16em", textTransform: "uppercase", textAlign: "center", marginBottom: 20 }}>Tracked across top brands</div>
        <div style={{ display: "flex", animation: "ticker 35s linear infinite", width: "max-content" }}>
          {[...BRANDS,...BRANDS].map((b,i) => (
            <div key={i} style={{ padding: "8px 28px", fontFamily: SERIF, fontSize: 15, color: i % 5 === 0 ? C.gold : C.textDim, whiteSpace: "nowrap", borderRight: `1px solid ${g(0.08)}`, letterSpacing: "0.04em" }}>{b}</div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ padding: "60px 40px 120px", textAlign: "center", position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <svg width="52" height="52" viewBox="0 0 20 20" fill="none" style={{ margin: "0 auto 28px", display: "block" }}>
            <rect x="1" y="1" width="18" height="18" stroke={C.gold} strokeWidth="0.8" fill="none"/>
            <rect x="4.5" y="4.5" width="11" height="11" fill={C.gold} opacity="0.12"/>
            <text x="10" y="14" textAnchor="middle" fill={C.gold} fontSize="9" fontFamily="Georgia,serif">V</text>
          </svg>
          <div style={{ fontFamily: SERIF, fontSize: "clamp(26px, 4vw, 44px)", color: C.text, fontWeight: 300, lineHeight: 1.2, marginBottom: 18 }}>Your collection deserves<br /><span style={{ fontStyle: "italic" }}>better intelligence</span></div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMid, letterSpacing: "0.06em", lineHeight: 1.85, marginBottom: 40 }}>Free to use. No credit card. Your portfolio stays private.</div>
          <button onClick={onEnter} style={{ padding: "16px 52px", background: C.gold, border: "none", borderRadius: 2, color: C.bg, cursor: "pointer", fontFamily: MONO, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 500, transition: "opacity 0.15s" }} onMouseEnter={e => e.currentTarget.style.opacity = "0.85"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
            Enter Vault
          </button>
          <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.08em" }}>8 platforms · Live data · Portfolio tracking</div>
        </div>
      </section>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@300;400;500&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes fadeUpDown { 0%,100% { opacity:0.4; transform:translateY(0); } 50% { opacity:0.8; transform:translateY(5px); } }
      `}</style>
    </div>
  );
}


// ── CatalogBrowse Component ──────────────────────────────────────────────
// ── CatalogBrowse Component ──────────────────────────────────────────────
function CatalogBrowse({
  C, g, w, MONO, SERIF, isMobile, fmt, API_URL,
  catItems, setCatItems, catLoading, setCatLoading,
  catTotal, setCatTotal, catPage, setCatPage,
  catTotalPages, setCatTotalPages, catCategory, setCatCategory,
  catBrand, setCatBrand, catSubcat, setCatSubcat,
  catSort, setCatSort, catQ, setCatQ, catQInput, setCatQInput,
  catFacets, setCatFacets, liveItems, setLiveItems,
  liveFetching, setLiveFetching, catDebounceRef,
  isOwned, getOwned, openAddModal,
  searchResults, setSearchResults, search, setSearch,
  searching, handleSearch, searchError, allItems, setAllItems,
  filteredResults, filterCat, setFilterCat, filterPlatform, setFilterPlatform,
  filterMinPrice, setFilterMinPrice, filterMaxPrice, setFilterMaxPrice,
  sortBy, setSortBy, platformInfo, setDetailModal, inputRef,
}) {
  const BROWSE_CATS = ["All","Watches","Handbags","Clothing","Shoes","Jewelry","Small Leather Goods","Accessories"];
  const SORT_OPTIONS = [
    { value:"popular",    label:"Most Popular" },
    { value:"name",       label:"Name A–Z" },
    { value:"price-high", label:"Price: High to Low" },
    { value:"price-low",  label:"Price: Low to High" },
  ];

  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);
  const [catModal, setCatModal] = React.useState(null); // catalog item detail modal
  const [brandSearch,       setBrandSearch]       = React.useState("");
  const [priceMin,          setPriceMin]          = React.useState("");
  const [priceMax,          setPriceMax]          = React.useState("");
  const [suggestions,       setSuggestions]       = React.useState([]);
  const [showSuggestions,   setShowSuggestions]   = React.useState(false);
  const [suggestLoading,    setSuggestLoading]    = React.useState(false);
  const suggestRef   = React.useRef(null);
  const suggestTimer = React.useRef(null);
  const searchBoxRef = React.useRef(null);

  // Close suggestions on outside click
  React.useEffect(() => {
    function onClickOut(e) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, []);

  // ── Fetch catalog items ──
  async function fetchCatalog(opts = {}) {
    const {
      page = catPage, category = catCategory, brand = catBrand,
      subcat = catSubcat, sort = catSort, q = catQ,
      pmin = priceMin, pmax = priceMax,
    } = opts;
    setCatLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 48, sort });
      if (category && category !== "All") params.set("category", category);
      if (brand)  params.set("brand", brand);
      if (subcat) params.set("subcategory", subcat);
      if (q)      params.set("q", q);
      if (pmin)   params.set("price_min", pmin);
      if (pmax)   params.set("price_max", pmax);
      const resp = await fetch(`${API_URL}/api/catalog?${params}`);
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setCatItems(data.items || []);
      setCatTotal(data.total || 0);
      setCatPage(data.page || 1);
      setCatTotalPages(data.totalPages || 1);
      setCatFacets(data.facets || {});
      // If catalog returns 0 results for a text query → trigger live scraper
      if (data.enriching && q) {
        triggerLiveSearch(q);
      }
    } catch (e) {
      console.error("[catalog fetch]", e.message);
    } finally {
      setCatLoading(false);
    }
  }

  // Load on mount
  React.useEffect(() => { fetchCatalog(); }, []);

  // ── Typeahead ──
  async function fetchSuggestions(q) {
    if (!q || q.length < 2) { setSuggestions([]); return; }
    setSuggestLoading(true);
    try {
      const resp = await fetch(`${API_URL}/api/suggest?q=${encodeURIComponent(q)}&limit=8`);
      const data = await resp.json();
      setSuggestions(data.suggestions || []);
      setShowSuggestions(true);
    } catch { setSuggestions([]); }
    finally { setSuggestLoading(false); }
  }

  function handleQInput(val) {
    setCatQInput(val);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(() => fetchSuggestions(val), 180);
    if (catDebounceRef.current) clearTimeout(catDebounceRef.current);
    catDebounceRef.current = setTimeout(() => applyFilter("q", val), 500);
  }

  function applySuggestion(s) {
    setShowSuggestions(false);
    if (s.type === "brand") {
      setCatQInput("");
      applyFilter("brand", s.brand);
    } else {
      setCatQInput(s.label);
      applyFilter("q", s.label);
    }
  }

  // ── Live scraper fallback when catalog is empty ──
  async function triggerLiveSearch(q) {
    setSearchResults([{ _discovering: true, id: "discovering", brand:"", name:"", category:"", avgPrice:0, lowPrice:0, highPrice:0, numListings:0, sources:[], imageUrl:null, sampleUrls:[] }]);
    try {
      const resp = await fetch(`${API_URL}/api/search`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, limit: 20 }),
      });
      const data = await resp.json();
      if (data.items?.length) {
        setSearchResults(data.items.map((item, i) => ({
          id: `api-${Date.now()}-${i}`,
          key: `${item.brand}-${item.name}`.toLowerCase().replace(/[^a-z0-9]/g,"-").slice(0,40),
          brand: item.brand || "Unknown", name: item.name || q,
          category: item.category || "Accessories",
          avgPrice: item.avgPrice||0, highPrice: item.highPrice||0, lowPrice: item.lowPrice||0,
          numListings: item.numListings||0, sources: item.sources||[],
          imageUrl: item.imageUrl||null, sampleUrls: item.sampleUrls||[],
          fromLiveScraper: true,
        })));
      } else {
        setSearchResults([]);
      }
    } catch { setSearchResults([]); }
  }

  function applyFilter(key, val) {
    const opts = { page:1, category:catCategory, brand:catBrand, subcat:catSubcat, sort:catSort, q:catQ, pmin:priceMin, pmax:priceMax };
    opts[key] = val;
    if (key === "category") { setCatCategory(val); setCatBrand(""); setCatSubcat(""); opts.brand=""; opts.subcat=""; }
    if (key === "brand")    { setCatBrand(val); setCatSubcat(""); opts.subcat=""; }
    if (key === "subcat")     setCatSubcat(val);
    if (key === "sort")       setCatSort(val);
    if (key === "q")          setCatQ(val);
    if (key === "pmin")       setPriceMin(val);
    if (key === "pmax")       setPriceMax(val);
    setCatPage(1);
    setSearchResults([]); // clear any previous live results
    fetchCatalog(opts);
  }

  function applyPrice() {
    applyFilter("pmin", priceMin);
    fetchCatalog({ page:1, category:catCategory, brand:catBrand, subcat:catSubcat, sort:catSort, q:catQ, pmin:priceMin, pmax:priceMax });
  }

  function clearAll() {
    setCatCategory("All"); setCatBrand(""); setCatSubcat(""); setCatQ(""); setCatQInput("");
    setPriceMin(""); setPriceMax(""); setSuggestions([]); setSearchResults([]);
    fetchCatalog({ category:"All", brand:"", subcat:"", q:"", page:1, pmin:"", pmax:"" });
  }

  function goPage(p) {
    setCatPage(p);
    fetchCatalog({ page: p });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Get live prices for a catalog item ──
  function buildLiveQuery(item) {
    const brand  = item.brand || "";
    const line   = item.line  || "";
    const model  = item.model_number || "";
    const display= item.display_name || "";

    // Detect internal/garbage SKUs — contains multiple dashes or starts with digit-dash pattern
    const isInternalSku = /^\d{2}-|[A-Z0-9]{4,}-[A-Z0-9]{4,}/.test(model);

    if (!isInternalSku && model && model.length <= 20) {
      // Real reference number — use brand + model (e.g. "Rolex 116500LN")
      return (brand + " " + model).trim();
    }

    if (line && line !== brand) {
      // Has a real product line — use brand + line (e.g. "Hermès Birkin", "Omega Speedmaster")
      return (brand + " " + line).trim();
    }

    // Fall back: extract first 3-4 meaningful words from display_name, strip brand prefix
    const stripped = display
      .replace(new RegExp(brand, "gi"), "")
      .replace(/\b(stainless steel|yellow gold|rose gold|white gold|leather|canvas|monogram|quilted|limited edition|automatic|quartz|chronograph)\b/gi, "")
      .replace(/\s+/g, " ").trim();
    const words = stripped.split(" ").filter(w => w.length > 2 && !/^\d{8,}$/.test(w)).slice(0, 3);
    const q = (brand + " " + words.join(" ")).trim();
    return q || brand;
  }

  async function getLivePrices(item) {
    const query = buildLiveQuery(item);
    setLiveFetching(prev => ({ ...prev, [item.id]: true }));
    try {
      const resp = await fetch(`${API_URL}/api/search`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 20 }),
      });
      const data = await resp.json();
      if (data.items?.length) {
        const best = data.items[0];
        setLiveItems(prev => ({ ...prev, [item.id]: { avgPrice:best.avgPrice, lowPrice:best.lowPrice, highPrice:best.highPrice, numListings:best.numListings, sources:best.sources, imageUrl:best.imageUrl, sampleUrls:best.sampleUrls } }));
        const mapped = { id:item.id, key:item.id, brand:item.brand, name:item.display_name, category:item.category, avgPrice:best.avgPrice, lowPrice:best.lowPrice, highPrice:best.highPrice, numListings:best.numListings, sources:best.sources, imageUrl:best.imageUrl||item.image_url, sampleUrls:best.sampleUrls };
        setAllItems(prev => { const ex = prev.find(i => i.id === item.id); return ex ? prev.map(i => i.id===item.id ? mapped : i) : [...prev, mapped]; });
      } else {
        setLiveItems(prev => ({ ...prev, [item.id]: { noResults: true } }));
      }
    } catch (e) {
      setLiveItems(prev => ({ ...prev, [item.id]: { error: true } }));
    } finally {
      setLiveFetching(prev => ({ ...prev, [item.id]: false }));
    }
  }

  const hasActiveFilters = catBrand || catSubcat || catQ || catCategory !== "All" || priceMin || priceMax;
  const liveResults = searchResults.filter(r => r.fromLiveScraper);
  const discovering = searchResults.some(r => r._discovering);

  // ── Sidebar content ──
  const sidebarContent = (
    <div style={{ display:"flex", flexDirection:"column", gap:0 }}>

      {/* Categories */}
      <div style={{ marginBottom:4 }}>
        <div style={{ fontFamily:MONO, fontSize:8, color:C.textDim, letterSpacing:"0.14em", textTransform:"uppercase", padding:"0 0 8px", borderBottom:`1px solid ${C.border}`, marginBottom:6 }}>Category</div>
        {BROWSE_CATS.map(cat => (
          <button key={cat} onClick={() => applyFilter("category", cat)}
            style={{ display:"block", width:"100%", textAlign:"left", padding:"7px 10px", background: catCategory===cat ? g(0.1) : "transparent", border:"none", borderLeft:`2px solid ${catCategory===cat ? C.gold : "transparent"}`, color: catCategory===cat ? C.gold : C.textMid, cursor:"pointer", fontFamily:MONO, fontSize:10, letterSpacing:"0.04em", transition:"all 0.1s", marginBottom:1 }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Subcategories */}
      {(catFacets.suggestedSubcats?.length > 0 || catFacets.subcategories?.length > 0) && (
        <div style={{ marginTop:20, marginBottom:2 }}>
          <div style={{ fontFamily:MONO, fontSize:8, color:C.textDim, letterSpacing:"0.14em", textTransform:"uppercase", padding:"0 0 8px", borderBottom:`1px solid ${C.border}`, marginBottom:10 }}>Style</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
            {(catFacets.suggestedSubcats?.length ? catFacets.suggestedSubcats : catFacets.subcategories?.map(s=>s.name)||[]).map(sub => (
              <button key={sub} onClick={() => applyFilter("subcat", catSubcat===sub ? "" : sub)}
                style={{ padding:"4px 9px", background: catSubcat===sub ? g(0.15) : "transparent", border:`1px solid ${catSubcat===sub ? C.gold : C.border}`, borderRadius:2, color: catSubcat===sub ? C.gold : C.textMid, cursor:"pointer", fontFamily:MONO, fontSize:9, transition:"all 0.1s" }}>
                {sub}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Brand */}
      {catCategory !== "All" && (
        <div style={{ marginTop:20 }}>
          <div style={{ fontFamily:MONO, fontSize:8, color:C.textDim, letterSpacing:"0.14em", textTransform:"uppercase", padding:"0 0 8px", borderBottom:`1px solid ${C.border}`, marginBottom:8 }}>Brand</div>
          <input type="text" placeholder="Filter brands..." value={brandSearch} onChange={e => setBrandSearch(e.target.value)}
            style={{ width:"100%", padding:"7px 10px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:2, color:C.text, fontFamily:MONO, fontSize:10, outline:"none", marginBottom:8, boxSizing:"border-box" }} />
          <div style={{ maxHeight:200, overflowY:"auto" }}>
            {(catFacets.suggestedBrands?.length ? catFacets.suggestedBrands : catFacets.brands?.map(b=>b.name)||[])
              .filter(b => !brandSearch || b.toLowerCase().includes(brandSearch.toLowerCase()))
              .map(brand => {
                const facet = catFacets.brands?.find(b=>b.name===brand);
                return (
                  <button key={brand} onClick={() => applyFilter("brand", catBrand===brand ? "" : brand)}
                    style={{ display:"flex", justifyContent:"space-between", alignItems:"center", width:"100%", textAlign:"left", padding:"6px 10px", background: catBrand===brand ? g(0.1) : "transparent", border:"none", borderLeft:`2px solid ${catBrand===brand ? C.gold : "transparent"}`, color: catBrand===brand ? C.gold : C.textMid, cursor:"pointer", fontFamily:MONO, fontSize:10, transition:"all 0.1s", marginBottom:1 }}>
                    <span>{brand}</span>
                    {facet && <span style={{ fontSize:8, color:C.textDim }}>{facet.count.toLocaleString()}</span>}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Price Range */}
      <div style={{ marginTop:20 }}>
        <div style={{ fontFamily:MONO, fontSize:8, color:C.textDim, letterSpacing:"0.14em", textTransform:"uppercase", padding:"0 0 8px", borderBottom:`1px solid ${C.border}`, marginBottom:10 }}>Price Range</div>
        <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:8 }}>
          <input type="number" placeholder="Min" value={priceMin} onChange={e => setPriceMin(e.target.value)} onKeyDown={e => e.key==="Enter" && applyPrice()}
            style={{ flex:1, padding:"6px 8px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:2, color:C.text, fontFamily:MONO, fontSize:10, outline:"none", minWidth:0 }} />
          <span style={{ color:C.textDim, fontFamily:MONO, fontSize:9 }}>–</span>
          <input type="number" placeholder="Max" value={priceMax} onChange={e => setPriceMax(e.target.value)} onKeyDown={e => e.key==="Enter" && applyPrice()}
            style={{ flex:1, padding:"6px 8px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:2, color:C.text, fontFamily:MONO, fontSize:10, outline:"none", minWidth:0 }} />
        </div>
        {/* Quick price chips */}
        <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
          {[["Under $5K","","5000"],["$5K–15K","5000","15000"],["$15K–50K","15000","50000"],["$50K+","50000",""]].map(([lbl,mn,mx]) => {
            const active = priceMin===mn && priceMax===mx;
            return (
              <button key={lbl} onClick={() => { setPriceMin(mn); setPriceMax(mx); fetchCatalog({ page:1, category:catCategory, brand:catBrand, subcat:catSubcat, sort:catSort, q:catQ, pmin:mn, pmax:mx }); }}
                style={{ padding:"3px 8px", background: active ? g(0.15) : "transparent", border:`1px solid ${active ? C.gold : C.border}`, borderRadius:2, color: active ? C.gold : C.textMid, cursor:"pointer", fontFamily:MONO, fontSize:8, letterSpacing:"0.04em" }}>
                {lbl}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sort */}
      <div style={{ marginTop:20 }}>
        <div style={{ fontFamily:MONO, fontSize:8, color:C.textDim, letterSpacing:"0.14em", textTransform:"uppercase", padding:"0 0 8px", borderBottom:`1px solid ${C.border}`, marginBottom:8 }}>Sort</div>
        {SORT_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => applyFilter("sort", opt.value)}
            style={{ display:"block", width:"100%", textAlign:"left", padding:"6px 10px", background: catSort===opt.value ? g(0.1) : "transparent", border:"none", borderLeft:`2px solid ${catSort===opt.value ? C.gold : "transparent"}`, color: catSort===opt.value ? C.gold : C.textMid, cursor:"pointer", fontFamily:MONO, fontSize:10, transition:"all 0.1s", marginBottom:1 }}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Clear all */}
      {hasActiveFilters && (
        <button onClick={clearAll}
          style={{ marginTop:24, padding:"8px", width:"100%", background:"transparent", border:`1px solid ${C.border}`, borderRadius:2, color:C.textDim, cursor:"pointer", fontFamily:MONO, fontSize:9, letterSpacing:"0.1em" }}>
          CLEAR ALL FILTERS
        </button>
      )}
    </div>
  );

  // ── Catalog item card ──
  const renderCatCard = (item) => {
    const live    = liveItems[item.id];
    const owned   = isOwned(item.id);
    const entry   = getOwned(item.id);
    const fetching= liveFetching[item.id];
    const hasLive = live && !live.noResults && !live.error;
    const imgSrc  = (hasLive && live.imageUrl) ? live.imageUrl : item.image_url;

    const addableItem = hasLive
      ? { id:item.id, key:item.id, brand:item.brand, name:item.display_name, category:item.category, avgPrice:live.avgPrice, lowPrice:live.lowPrice, highPrice:live.highPrice, numListings:live.numListings, sources:live.sources||[], imageUrl:live.imageUrl||item.image_url, sampleUrls:live.sampleUrls||[] }
      : { id:item.id, key:item.id, brand:item.brand, name:item.display_name, category:item.category, avgPrice:item.msrp||0, lowPrice:item.msrp||0, highPrice:item.msrp||0, numListings:0, sources:[], imageUrl:item.image_url };

    return (
      <div key={item.id}
        style={{ background: owned ? `linear-gradient(135deg,${g(0.07)},${g(0.03)})` : C.surface, border:`1px solid ${owned ? C.borderGold : C.border}`, borderRadius:3, overflow:"hidden", display:"flex", flexDirection:"column", transition:"border-color 0.2s" }}
        onMouseEnter={e => { if (!owned) e.currentTarget.style.borderColor="rgba(255,255,255,0.1)"; }}
        onMouseLeave={e => { if (!owned) e.currentTarget.style.borderColor=C.border; }}>

        {/* Image */}
        <div style={{ position:"relative", background:"#0a0b0c", height:160, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", cursor:"pointer" }}
          onClick={() => setCatModal(item)}>
          {imgSrc ? (
            <img src={imgSrc} alt={item.display_name}
              style={{ width:"100%", height:160, objectFit:"contain", padding:"12px", boxSizing:"border-box" }}
              onError={e => { e.target.style.display="none"; e.target.nextSibling && (e.target.nextSibling.style.display="flex"); }} />
          ) : null}
          {/* Placeholder — shown when no image or img fails */}
          <div style={{ display: imgSrc ? "none" : "flex", position:"absolute", inset:0, alignItems:"center", justifyContent:"center", flexDirection:"column", gap:4, padding:"12px" }}>
            <div style={{ fontFamily:SERIF, fontSize:28, color:C.textDim, opacity:0.2 }}>
              {item.category==="Watches" ? "◷" : item.category==="Handbags" ? "◻" : item.category==="Jewelry" ? "◇" : item.category==="Shoes" ? "◁" : item.category==="Clothing" ? "◈" : "○"}
            </div>
            <div style={{ fontFamily:MONO, fontSize:8, color:C.textDim, opacity:0.4, letterSpacing:"0.1em", textAlign:"center", lineHeight:1.4 }}>
              {item.model_number || item.subcategory || item.category}
            </div>
          </div>
          {owned && (
            <div style={{ position:"absolute", top:8, right:8, padding:"3px 7px", background:g(0.25), border:`1px solid ${g(0.4)}`, fontFamily:MONO, fontSize:7, color:C.gold, letterSpacing:"0.08em" }}>
              IN VAULT
            </div>
          )}
          {hasLive && (
            <div style={{ position:"absolute", bottom:8, left:8, padding:"2px 6px", background:"rgba(8,9,10,0.85)", border:`1px solid ${C.border}`, fontFamily:MONO, fontSize:7, color:C.green, letterSpacing:"0.08em" }}>
              LIVE ↗
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ padding:"12px 13px 10px", flex:1, display:"flex", flexDirection:"column", gap:3 }}>
          <div style={{ fontFamily:MONO, fontSize:8, color:C.gold, letterSpacing:"0.12em", textTransform:"uppercase" }}>{item.brand}</div>
          <div style={{ fontFamily:SERIF, fontSize:13, color:C.text, lineHeight:1.3, flex:1 }}>
            {(() => {
              // Smart display: show line + model, or strip brand from display_name
              if (item.line && item.model_number) return `${item.line} ${item.model_number}`;
              if (item.line) return item.line;
              if (item.model_number && !item.display_name.includes(item.model_number)) return item.display_name.replace(new RegExp(item.brand, 'i'), '').trim();
              return item.display_name.replace(new RegExp(item.brand, 'i'), '').trim().replace(/^\s*-\s*/, '');
            })()}
          </div>
          {item.material && <div style={{ fontFamily:MONO, fontSize:8, color:C.textDim }}>{item.material}{item.size_cm ? " · "+item.size_cm : ""}</div>}

          {/* Price */}
          <div style={{ marginTop:4 }}>
            {hasLive ? (
              <div>
                <div style={{ fontFamily:SERIF, fontSize:19, color:C.text, letterSpacing:"-0.02em" }}>{fmt(live.avgPrice)}</div>
                <div style={{ fontFamily:MONO, fontSize:8, color:C.textDim, marginTop:1 }}>
                  {fmt(live.lowPrice)} – {fmt(live.highPrice)} · {live.numListings} listings
                </div>
              </div>
            ) : item.msrp ? (
              <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim }}>MSRP {fmt(item.msrp)}</div>
            ) : (
              <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, opacity:0.4 }}>—</div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding:"0 11px 11px", display:"flex", gap:5 }}>
          {owned ? (
            <div style={{ flex:1, padding:"7px", background:g(0.08), border:`1px solid ${g(0.2)}`, borderRadius:2, fontFamily:MONO, fontSize:8, color:C.gold, textAlign:"center" }}>
              ✓ {entry?.condition?.toUpperCase() || "IN VAULT"}
            </div>
          ) : hasLive ? (
            <button onClick={() => openAddModal(addableItem)}
              style={{ flex:1, padding:"7px", background:"transparent", border:`1px solid ${C.borderGold}`, borderRadius:2, color:C.gold, cursor:"pointer", fontFamily:MONO, fontSize:8, letterSpacing:"0.08em", transition:"background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background=g(0.12)}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}>
              ADD TO VAULT
            </button>
          ) : (
            <button onClick={e => { e.stopPropagation(); getLivePrices(item); }} disabled={fetching}
              style={{ flex:1, padding:"7px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:2, color: fetching ? C.textDim : C.textMid, cursor: fetching ? "wait" : "pointer", fontFamily:MONO, fontSize:8, letterSpacing:"0.06em", transition:"all 0.15s" }}
              onMouseEnter={e => { if (!fetching) { e.currentTarget.style.borderColor=C.gold; e.currentTarget.style.color=C.gold; } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.textMid; }}>
              {fetching ? "SEARCHING..." : "GET LIVE PRICES"}
            </button>
          )}
          <button onClick={() => setCatModal(item)}
            style={{ padding:"7px 10px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:2, color:C.textMid, cursor:"pointer", fontFamily:MONO, fontSize:10, letterSpacing:"0.04em", transition:"all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor=C.gold; e.currentTarget.style.color=C.gold; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.textMid; }}>
            ···
          </button>
        </div>
      </div>
    );
  };

  // ── Main render ──
  return (<>
    <div style={{ display:"flex", flexDirection:"column", minHeight:"60vh" }}>

      {/* ── Mobile category strip (always visible) ── */}
      {isMobile && (
        <div style={{ display:"flex", overflowX:"auto", gap:6, marginBottom:12, paddingBottom:4, WebkitOverflowScrolling:"touch" }}>
          {BROWSE_CATS.map(cat => (
            <button key={cat} onClick={() => applyFilter("category", cat)}
              style={{ flexShrink:0, padding:"6px 12px", background: catCategory===cat ? g(0.15) : "transparent", border:`1px solid ${catCategory===cat ? C.gold : C.border}`, borderRadius:2, color: catCategory===cat ? C.gold : C.textMid, cursor:"pointer", fontFamily:MONO, fontSize:9, letterSpacing:"0.08em", whiteSpace:"nowrap" }}>
              {cat}
            </button>
          ))}
        </div>
      )}

      <div style={{ display:"flex", gap:0, flex:1 }}>

        {/* ── Sidebar (desktop) ── */}
        {!isMobile && (
          <div style={{ width:220, flexShrink:0, paddingRight:28, borderRight:`1px solid ${C.border}` }}>
            {sidebarContent}
          </div>
        )}

        {/* ── Main content ── */}
        <div style={{ flex:1, minWidth:0, paddingLeft: isMobile ? 0 : 28 }}>

          {/* Search bar with typeahead */}
          <div style={{ marginBottom:14, position:"relative" }} ref={searchBoxRef}>
            <div style={{ display:"flex", gap:8 }}>
              <div style={{ flex:1, display:"flex", border:`1px solid ${showSuggestions && suggestions.length ? C.gold : C.border}`, background:C.surface, borderRadius:2, overflow:"visible", position:"relative", transition:"border-color 0.15s" }}>
                {/* Search icon */}
                <div style={{ display:"flex", alignItems:"center", paddingLeft:12, color:C.textDim, fontSize:13, flexShrink:0 }}>⌕</div>
                <input
                  type="text"
                  placeholder="Search — Rolex Daytona 116500, Birkin 25, Chanel Flap..."
                  value={catQInput}
                  onChange={e => handleQInput(e.target.value)}
                  onFocus={() => catQInput.length > 1 && suggestions.length && setShowSuggestions(true)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { setShowSuggestions(false); applyFilter("q", catQInput); }
                    if (e.key === "Escape") { setShowSuggestions(false); }
                  }}
                  style={{ flex:1, padding:"12px 8px", background:"transparent", border:"none", color:C.text, fontFamily:MONO, fontSize:11, outline:"none" }}
                />
                {catQInput && (
                  <button onClick={() => { setCatQInput(""); applyFilter("q", ""); setSuggestions([]); }}
                    style={{ padding:"0 12px", background:"transparent", border:"none", color:C.textDim, cursor:"pointer", fontSize:16 }}>×</button>
                )}
              </div>
              {isMobile && (
                <button onClick={() => setMobileFiltersOpen(v => !v)}
                  style={{ padding:"0 13px", background: mobileFiltersOpen ? g(0.12) : "transparent", border:`1px solid ${mobileFiltersOpen ? C.gold : C.border}`, borderRadius:2, color: mobileFiltersOpen ? C.gold : C.textMid, cursor:"pointer", fontFamily:MONO, fontSize:9, flexShrink:0 }}>
                  FILTER{hasActiveFilters ? " ●" : ""}
                </button>
              )}
            </div>

            {/* ── Typeahead dropdown ── */}
            {showSuggestions && suggestions.length > 0 && (
              <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right: isMobile ? 56 : 0, zIndex:200, background:C.surface, border:`1px solid ${g(0.3)}`, borderRadius:2, boxShadow:"0 12px 40px rgba(0,0,0,0.6)", overflow:"hidden" }}>
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => applySuggestion(s)}
                    style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"10px 14px", background:"transparent", border:"none", borderBottom: i < suggestions.length-1 ? `1px solid ${C.border}` : "none", cursor:"pointer", textAlign:"left", transition:"background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background=g(0.08)}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                    {/* Thumbnail */}
                    <div style={{ width:32, height:32, flexShrink:0, background:"#0a0b0c", display:"flex", alignItems:"center", justifyContent:"center", borderRadius:2, overflow:"hidden" }}>
                      {s.imageUrl
                        ? <img src={s.imageUrl} alt="" style={{ width:32, height:32, objectFit:"contain" }} onError={e => e.target.style.display="none"} />
                        : <span style={{ fontFamily:MONO, fontSize:10, color:C.textDim }}>{s.type==="brand" ? "◈" : "○"}</span>
                      }
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontFamily:SERIF, fontSize:13, color:C.text, lineHeight:1.2 }}>{s.label}</div>
                      {s.sublabel && <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, marginTop:1 }}>{s.sublabel}</div>}
                    </div>
                    <div style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
                      {s.type === "brand" && <span style={{ fontFamily:MONO, fontSize:8, color:C.gold, padding:"1px 5px", border:`1px solid ${g(0.25)}`, borderRadius:2 }}>BRAND</span>}
                      {s.msrp && <span style={{ fontFamily:MONO, fontSize:8, color:C.textDim }}>{fmt(s.msrp)}</span>}
                      {s.count && <span style={{ fontFamily:MONO, fontSize:8, color:C.textDim }}>{s.count.toLocaleString()} items</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mobile filters drawer */}
          {isMobile && mobileFiltersOpen && (
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:2, padding:"16px", marginBottom:14 }}>
              {sidebarContent}
            </div>
          )}

          {/* Active filter chips + count */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8, marginBottom:16 }}>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap", alignItems:"center" }}>
              {catCategory !== "All" && <FilterChip label={catCategory} onRemove={() => applyFilter("category","All")} g={g} C={C} MONO={MONO} />}
              {catBrand    && <FilterChip label={catBrand}    onRemove={() => applyFilter("brand","")}    g={g} C={C} MONO={MONO} />}
              {catSubcat   && <FilterChip label={catSubcat}   onRemove={() => applyFilter("subcat","")}   g={g} C={C} MONO={MONO} />}
              {catQ        && <FilterChip label={`"${catQ}"`} onRemove={() => { setCatQInput(""); applyFilter("q",""); }} g={g} C={C} MONO={MONO} />}
              {(priceMin||priceMax) && <FilterChip label={`${priceMin ? "$"+Number(priceMin).toLocaleString() : ""}${priceMin&&priceMax?"–":""}${priceMax ? "$"+Number(priceMax).toLocaleString() : "+"}`} onRemove={() => { setPriceMin(""); setPriceMax(""); fetchCatalog({ page:1, category:catCategory, brand:catBrand, subcat:catSubcat, sort:catSort, q:catQ, pmin:"", pmax:"" }); }} g={g} C={C} MONO={MONO} />}
            </div>
            <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim }}>
              {catLoading ? "Loading..." : `${catTotal.toLocaleString()} items`}
            </div>
          </div>

          {/* ── Live scraper results (when catalog is empty + query) ── */}
          {discovering && (
            <div style={{ padding:"32px", textAlign:"center", border:`1px solid ${g(0.15)}`, background:g(0.03), marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:8 }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:C.gold, animation:"pulse 1s ease-in-out infinite" }} />
                <span style={{ fontFamily:MONO, fontSize:9, color:C.gold, letterSpacing:"0.16em" }}>SEARCHING THE OPEN WEB</span>
              </div>
              <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim }}>Not in catalog — checking live marketplaces...</div>
            </div>
          )}

          {liveResults.length > 0 && !discovering && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontFamily:MONO, fontSize:8, color:C.gold, letterSpacing:"0.14em", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:C.gold }} />
                LIVE MARKET RESULTS FOR "{catQ || catQInput}"
              </div>
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(200px,1fr))", gap:1, background:C.border }}>
                {liveResults.map(item => (
                  <div key={item.id} style={{ background:C.bg }}>
                    {/* Reuse the existing renderCard from parent via prop */}
                    <div style={{ background:C.surface, border:`1px solid ${C.border}`, padding:"14px 14px 12px", display:"flex", flexDirection:"column", gap:6 }}>
                      <div style={{ fontFamily:MONO, fontSize:8, color:C.gold, letterSpacing:"0.1em" }}>{item.brand} · {item.category}</div>
                      <div style={{ fontFamily:SERIF, fontSize:14, color:C.text }}>{item.name}</div>
                      <div style={{ fontFamily:SERIF, fontSize:20, color:C.text }}>{fmt(item.avgPrice)}</div>
                      <div style={{ fontFamily:MONO, fontSize:8, color:C.textDim }}>{item.numListings} listings · {(item.sources||[]).slice(0,3).join(", ")}</div>
                      <button onClick={() => openAddModal(item)}
                        style={{ padding:"7px", background:"transparent", border:`1px solid ${C.borderGold}`, borderRadius:2, color:C.gold, cursor:"pointer", fontFamily:MONO, fontSize:8 }}>
                        ADD TO VAULT
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Catalog grid ── */}
          {!discovering && (
            catLoading ? (
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(200px,1fr))", gap:1, background:C.border }}>
                {Array.from({ length:12 }).map((_,i) => (
                  <div key={i} style={{ background:C.surface, height:280, opacity:0.4, animation:"pulse 1.5s ease-in-out infinite", animationDelay:`${i*0.08}s` }} />
                ))}
              </div>
            ) : catItems.length === 0 && liveResults.length === 0 ? (
              <div style={{ padding:"60px 0", textAlign:"center" }}>
                <div style={{ fontFamily:SERIF, fontSize:22, color:C.textMid, marginBottom:8, fontWeight:300 }}>No items found</div>
                <div style={{ fontFamily:MONO, fontSize:10, color:C.textDim, marginBottom:16 }}>Try different filters or a broader search term</div>
                {hasActiveFilters && (
                  <button onClick={clearAll} style={{ padding:"8px 20px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:2, color:C.textMid, cursor:"pointer", fontFamily:MONO, fontSize:9 }}>
                    CLEAR ALL FILTERS
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(200px,1fr))", gap:1, background:C.border }}>
                {catItems.map(item => (
                  <div key={item.id} style={{ background:C.bg }}>
                    {renderCatCard(item)}
                  </div>
                ))}
              </div>
            )
          )}

          {/* ── Pagination ── */}
          {catTotalPages > 1 && !catLoading && catItems.length > 0 && (
            <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:5, marginTop:32, flexWrap:"wrap" }}>
              <button onClick={() => goPage(1)} disabled={catPage===1}
                style={{ padding:"6px 10px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:2, color: catPage===1 ? C.textDim : C.textMid, cursor: catPage===1 ? "default" : "pointer", fontFamily:MONO, fontSize:9 }}>«</button>
              <button onClick={() => goPage(catPage-1)} disabled={catPage===1}
                style={{ padding:"6px 12px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:2, color: catPage===1 ? C.textDim : C.textMid, cursor: catPage===1 ? "default" : "pointer", fontFamily:MONO, fontSize:9 }}>‹</button>
              {Array.from({ length: Math.min(7, catTotalPages) }, (_,i) => {
                const p = catPage <= 4 ? i+1 : catPage > catTotalPages-4 ? catTotalPages-6+i : catPage-3+i;
                if (p < 1 || p > catTotalPages) return null;
                return (
                  <button key={p} onClick={() => goPage(p)}
                    style={{ padding:"6px 10px", background: p===catPage ? g(0.15) : "transparent", border:`1px solid ${p===catPage ? C.gold : C.border}`, borderRadius:2, color: p===catPage ? C.gold : C.textMid, cursor:"pointer", fontFamily:MONO, fontSize:9, minWidth:32 }}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => goPage(catPage+1)} disabled={catPage===catTotalPages}
                style={{ padding:"6px 12px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:2, color: catPage===catTotalPages ? C.textDim : C.textMid, cursor: catPage===catTotalPages ? "default" : "pointer", fontFamily:MONO, fontSize:9 }}>›</button>
              <button onClick={() => goPage(catTotalPages)} disabled={catPage===catTotalPages}
                style={{ padding:"6px 10px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:2, color: catPage===catTotalPages ? C.textDim : C.textMid, cursor: catPage===catTotalPages ? "default" : "pointer", fontFamily:MONO, fontSize:9 }}>»</button>
              <span style={{ fontFamily:MONO, fontSize:9, color:C.textDim, marginLeft:6 }}>
                Page {catPage} of {catTotalPages.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>

  </>
  );
}


// ── Catalog Item Detail Modal ─────────────────────────────────────────────
function CatalogItemModal({ item, catalogItem, liveData, onClose, onGetLive, onAdd, onDetail, isOwned, getOwned, isFetching, C, g, MONO, SERIF, fmt, isMobile }) {
  const live    = liveData;
  const hasLive = live && !live.noResults && !live.error;
  const owned   = isOwned(item.id);
  const entry   = getOwned(item.id);
  const ci      = catalogItem || item; // catalog-enriched version

  // Build specs list from catalog fields
  // Build specs from all available catalog columns — only show non-null
  const specDefs = [
    ["Category",      ci.category],
    ["Style",         ci.subcategory],
    ["Reference",     ci.reference_family || ci.model_number],
    ["Movement",      ci.movement],
    ["Case Size",     ci.case_size_mm ? ci.case_size_mm + "mm" : null],
    ["Dial",          ci.dial_color],
    ["Material",      ci.material],
    ["Bracelet",      ci.bracelet_material],
    ["Size",          ci.size_cm],
    ["Gender",        ci.gender],
    ["Year",          ci.year_introduced ? String(ci.year_introduced)
                      : ci.year_from && ci.year_to ? ci.year_from + "–" + ci.year_to
                      : ci.year_from ? ci.year_from + "+"
                      : null],
    ["Edition",       ci.limited_edition ? "Limited Edition" : null],
    ["Description",   ci.description],
    ["Retail (MSRP)", ci.msrp ? fmt(ci.msrp) : null],
    ["Source",        ci.source === "chrono24-kaggle" ? "Chrono24 / Kaggle"
                      : ci.source === "watchbase" ? "WatchBase"
                      : ci.source === "enriched" ? "AI Discovery"
                      : ci.source ? ci.source.replace(/-/g," ").replace(/\w/g,c=>c.toUpperCase())
                      : null],
  ];
  const specs = specDefs.filter(([, v]) => v !== null && v !== undefined && v !== "");

  const imgSrc = (hasLive && live.imageUrl) ? live.imageUrl : ci.image_url || item.imageUrl;

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", padding: isMobile ? "0" : "24px" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#0d0e10", border:`1px solid ${g(0.2)}`, borderRadius:4, width:"100%", maxWidth:900, maxHeight: isMobile ? "100dvh" : "90vh", overflowY:"auto", display:"flex", flexDirection: isMobile ? "column" : "row", position:"relative" }}>

        {/* Close */}
        <button onClick={onClose} style={{ position:"absolute", top:14, right:14, zIndex:10, background:"transparent", border:"none", color:C.textDim, cursor:"pointer", fontSize:20, lineHeight:1, padding:"4px 8px" }}>×</button>

        {/* ── Left: Image + actions ── */}
        <div style={{ width: isMobile ? "100%" : 360, flexShrink:0, background:"#08090a", display:"flex", flexDirection:"column" }}>
          {/* Image */}
          <div style={{ flex:1, minHeight: isMobile ? 220 : 320, display:"flex", alignItems:"center", justifyContent:"center", padding:24, position:"relative" }}>
            {imgSrc ? (
              <img src={imgSrc} alt={ci.display_name}
                style={{ maxWidth:"100%", maxHeight: isMobile ? 200 : 280, objectFit:"contain" }}
                onError={e => e.target.style.display="none"} />
            ) : (
              <div style={{ textAlign:"center", opacity:0.15 }}>
                <div style={{ fontFamily:SERIF, fontSize:64, color:C.textDim }}>
                  {ci.category==="Watches" ? "◷" : ci.category==="Handbags" ? "◻" : ci.category==="Jewelry" ? "◇" : "○"}
                </div>
                <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, marginTop:8 }}>{ci.model_number || "No image"}</div>
              </div>
            )}
            {owned && (
              <div style={{ position:"absolute", top:12, left:12, padding:"3px 8px", background:g(0.25), border:`1px solid ${g(0.4)}`, fontFamily:MONO, fontSize:7, color:C.gold, letterSpacing:"0.1em" }}>IN VAULT</div>
            )}
            {hasLive && (
              <div style={{ position:"absolute", bottom:12, left:12, padding:"2px 7px", background:"rgba(8,9,10,0.9)", border:`1px solid ${C.green}`, fontFamily:MONO, fontSize:7, color:C.green, letterSpacing:"0.08em" }}>LIVE DATA</div>
            )}
          </div>

          {/* Price */}
          <div style={{ padding:"16px 20px", borderTop:`1px solid ${g(0.1)}` }}>
            {hasLive ? (
              <>
                <div style={{ fontFamily:SERIF, fontSize:32, color:C.text, letterSpacing:"-0.02em", marginBottom:4 }}>{fmt(live.avgPrice)}</div>
                <div style={{ display:"flex", justifyContent:"space-between", fontFamily:MONO, fontSize:9, color:C.textDim, marginBottom:10 }}>
                  <span>Low {fmt(live.lowPrice)}</span>
                  <span>High {fmt(live.highPrice)}</span>
                </div>
                <div style={{ fontFamily:MONO, fontSize:8, color:C.textDim, marginBottom:14 }}>
                  {live.numListings} listings across {(live.sources||[]).slice(0,4).join(", ")}
                </div>
              </>
            ) : ci.msrp ? (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontFamily:MONO, fontSize:8, color:C.textDim, letterSpacing:"0.1em", marginBottom:4 }}>RETAIL (MSRP)</div>
                <div style={{ fontFamily:SERIF, fontSize:28, color:C.textMid }}>{fmt(ci.msrp)}</div>
              </div>
            ) : (
              <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, marginBottom:14 }}>No pricing data yet</div>
            )}

            {/* Action buttons */}
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {owned ? (
                <div style={{ padding:"9px", background:g(0.08), border:`1px solid ${g(0.2)}`, borderRadius:2, fontFamily:MONO, fontSize:9, color:C.gold, textAlign:"center" }}>
                  ✓ {entry?.condition?.toUpperCase() || "IN VAULT"} · {entry?.purchasePrice ? fmt(entry.purchasePrice) : ""}
                </div>
              ) : hasLive ? (
                <button onClick={() => { onAdd({ id:item.id, key:item.id, brand:ci.brand, name:ci.display_name, category:ci.category, avgPrice:live.avgPrice, lowPrice:live.lowPrice, highPrice:live.highPrice, numListings:live.numListings, sources:live.sources||[], imageUrl:live.imageUrl||ci.image_url, sampleUrls:live.sampleUrls||[] }); onClose(); }}
                  style={{ padding:"10px", background:"transparent", border:`1px solid ${C.gold}`, borderRadius:2, color:C.gold, cursor:"pointer", fontFamily:MONO, fontSize:9, letterSpacing:"0.1em" }}>
                  ADD TO VAULT
                </button>
              ) : (
                <button onClick={() => onGetLive(ci)} disabled={isFetching}
                  style={{ padding:"10px", background:"transparent", border:`1px solid ${isFetching ? C.border : C.textMid}`, borderRadius:2, color: isFetching ? C.textDim : C.textMid, cursor: isFetching ? "wait" : "pointer", fontFamily:MONO, fontSize:9, letterSpacing:"0.08em" }}>
                  {isFetching ? "SEARCHING LIVE PRICES..." : "GET LIVE PRICES"}
                </button>
              )}
              {hasLive && (
                <button onClick={() => { onDetail({ id:item.id, key:item.id, brand:ci.brand, name:ci.display_name, category:ci.category, avgPrice:live.avgPrice, lowPrice:live.lowPrice, highPrice:live.highPrice, numListings:live.numListings, sources:live.sources||[], imageUrl:live.imageUrl||ci.image_url, sampleUrls:live.sampleUrls||[] }); onClose(); }}
                  style={{ padding:"9px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:2, color:C.textMid, cursor:"pointer", fontFamily:MONO, fontSize:9, letterSpacing:"0.08em" }}>
                  VIEW FULL DETAIL →
                </button>
              )}
              {live?.sampleUrls?.length > 0 && (
                <div style={{ marginTop:4 }}>
                  <div style={{ fontFamily:MONO, fontSize:7, color:C.textDim, letterSpacing:"0.1em", marginBottom:5 }}>LIVE LISTINGS</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                    {live.sampleUrls.slice(0,4).map((u,i) => (
                      <a key={i} href={u.url} target="_blank" rel="noopener noreferrer"
                        style={{ padding:"3px 8px", background:g(0.08), border:`1px solid ${C.border}`, borderRadius:2, fontFamily:MONO, fontSize:8, color:C.textMid, textDecoration:"none" }}>
                        {u.platform?.split(" ")[0] || "View"}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Details ── */}
        <div style={{ flex:1, padding: isMobile ? "20px 16px" : "28px 28px", overflowY:"auto" }}>

          {/* Header */}
          <div style={{ marginBottom:20, paddingBottom:16, borderBottom:`1px solid ${g(0.1)}` }}>
            <div style={{ fontFamily:MONO, fontSize:8, color:C.gold, letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:6 }}>{ci.brand}</div>
            <div style={{ fontFamily:SERIF, fontSize: isMobile ? 22 : 28, color:C.text, lineHeight:1.2, marginBottom:6 }}>{ci.display_name.replace(new RegExp(ci.brand, 'i'), '').trim()}</div>
            {ci.limited_edition && (
              <span style={{ padding:"2px 8px", background:g(0.12), border:`1px solid ${g(0.3)}`, fontFamily:MONO, fontSize:8, color:C.gold }}>LIMITED EDITION</span>
            )}
          </div>

          {/* Description */}
          {ci.description && (
            <div style={{ marginBottom:20, fontFamily:MONO, fontSize:10, color:C.textMid, lineHeight:1.8 }}>{ci.description}</div>
          )}

          {/* Specs grid */}
          {specs.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontFamily:MONO, fontSize:8, color:C.textDim, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:10 }}>Specifications</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1px", background:g(0.08), border:`1px solid ${g(0.08)}` }}>
                {specs.map(([label, value], i) => value ? (
                  <div key={i} style={{ padding:"8px 12px", background:"#0d0e10", display:"flex", flexDirection:"column", gap:2 }}>
                    <div style={{ fontFamily:MONO, fontSize:7, color:C.textDim, letterSpacing:"0.1em", textTransform:"uppercase" }}>{label}</div>
                    <div style={{ fontFamily:MONO, fontSize:10, color:C.text }}>{String(value)}</div>
                  </div>
                ) : null)}
              </div>
            </div>
          )}

          {/* Condition value table (if live prices) */}
          {hasLive && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontFamily:MONO, fontSize:8, color:C.textDim, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:10 }}>Estimated Value by Condition</div>
              <div style={{ border:`1px solid ${g(0.1)}`, borderRadius:2, overflow:"hidden" }}>
                {[
                  { label:"New / Unworn", mult:1.15 },
                  { label:"Excellent",    mult:1.00 },
                  { label:"Very Good",    mult:0.88 },
                  { label:"Good",         mult:0.75 },
                  { label:"Fair",         mult:0.60 },
                ].map((c, i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 12px", borderBottom: i < 4 ? `1px solid ${g(0.06)}` : "none", background: i===1 ? g(0.05) : "transparent" }}>
                    <div style={{ fontFamily:MONO, fontSize:9, color: i===1 ? C.gold : C.textMid }}>{c.label}</div>
                    <div style={{ fontFamily:SERIF, fontSize:14, color: i===1 ? C.text : C.textMid }}>{fmt(Math.round(live.avgPrice * c.mult))}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live listings */}
          {hasLive && live.sampleUrls?.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontFamily:MONO, fontSize:8, color:C.textDim, letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:10 }}>Live Listings</div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {live.sampleUrls.slice(0,5).map((u, i) => (
                  <a key={i} href={u.url} target="_blank" rel="noopener noreferrer"
                    style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:g(0.04), border:`1px solid ${g(0.1)}`, borderRadius:2, textDecoration:"none", transition:"border-color 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor=C.gold}
                    onMouseLeave={e => e.currentTarget.style.borderColor=g(0.1)}>
                    <span style={{ fontFamily:MONO, fontSize:9, color:C.textMid }}>{u.platform}</span>
                    <span style={{ fontFamily:MONO, fontSize:9, color:C.gold }}>View ↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* No results state */}
          {live && live.noResults && (
            <div style={{ marginBottom:20, padding:"14px", background:g(0.04), border:`1px solid ${g(0.08)}`, borderRadius:2 }}>
              <div style={{ fontFamily:MONO, fontSize:9, color:C.textDim, lineHeight:1.7 }}>No active listings found on our 12 platforms. This item may be rare or recently sold out. Try again later or add at MSRP.</div>
            </div>
          )}

          {/* Source badge */}
          {ci.source && (
            <div style={{ fontFamily:MONO, fontSize:8, color:C.textDim }}>
              Data: {ci.source === "watchbase" ? "WatchBase" : ci.source === "enriched" ? "AI Discovery" : ci.source === "fashionphile" ? "Fashionphile" : ci.source === "rebag" ? "Rebag" : ci.source.charAt(0).toUpperCase() + ci.source.slice(1)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────

// ── Tiny helper component ──
function FilterChip({ label, onRemove, g, C, MONO }) {
  return (
    <span style={{ padding:"3px 9px", background:g(0.1), border:`1px solid ${g(0.25)}`, borderRadius:2, fontFamily:MONO, fontSize:9, color:C.gold, display:"flex", alignItems:"center", gap:5 }}>
      {label}
      <button onClick={onRemove} style={{ background:"none", border:"none", color:C.gold, cursor:"pointer", padding:0, lineHeight:1, fontSize:11 }}>×</button>
    </span>
  );
}
// ─────────────────────────────────────────────────────────────────────────
export default function LuxuryTracker() {
  // Show landing for new visitors; skip if they already have portfolio data
  const [showLanding, setShowLanding] = useState(() => {
    const hasPortfolio = (() => { try { return JSON.parse(localStorage.getItem("vault_portfolio") || "[]").length > 0; } catch { return false; } })();
    const hasVisited = localStorage.getItem("vault_visited") === "1";
    return !hasPortfolio && !hasVisited;
  });

  function enterApp() {
    localStorage.setItem("vault_visited", "1");
    setShowLanding(false);
  }

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [view, setView] = useState("portfolio");
  const [owned, setOwned] = useState(() => loadPortfolio());
  const [searchResults, setSearchResults] = useState([]);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [addModal, setAddModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [detailModal, setDetailModal] = useState(null); // item detail popup
  const [lightbox, setLightbox] = useState(false); // fullscreen image
  const [searchHistory, setSearchHistory] = useState(() => { try { return JSON.parse(localStorage.getItem("vault_search_history") || "[]"); } catch { return []; } });
  const [allItems, setAllItems] = useState(() => loadItemCache());
  const [platformInfo, setPlatformInfo] = useState(null);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [priceHistory, setPriceHistory] = useState({});
  const [filterCat, setFilterCat] = useState("All");
  const [filterPlatform, setFilterPlatform] = useState("All");
  const [filterMinPrice, setFilterMinPrice] = useState("");
  const [filterMaxPrice, setFilterMaxPrice] = useState("");
  const [sortBy, setSortBy] = useState("relevance");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authSuccess, setAuthSuccess] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null); // null | 'syncing' | 'synced' | 'error'
  // ── Catalog browse state ──
  const [catItems,     setCatItems]     = useState([]);
  const [catLoading,   setCatLoading]   = useState(false);
  const [catTotal,     setCatTotal]     = useState(0);
  const [catPage,      setCatPage]      = useState(1);
  const [catTotalPages,setCatTotalPages]= useState(1);
  const [catCategory,  setCatCategory]  = useState("All");
  const [catBrand,     setCatBrand]     = useState("");
  const [catSubcat,    setCatSubcat]    = useState("");
  const [catSort,      setCatSort]      = useState("popular");
  const [catQ,         setCatQ]         = useState("");
  const [catFacets,    setCatFacets]    = useState({ brands: [], subcategories: [], suggestedBrands: [], suggestedSubcats: [] });
  const [catQInput,    setCatQInput]    = useState("");
  const [liveItems,    setLiveItems]    = useState({});   // itemId -> live price data
  const [liveFetching, setLiveFetching] = useState({});  // itemId -> bool
  const catDebounceRef = useRef(null);

  const inputRef = useRef(null);

  // Add/edit form state
  const [formCondition, setFormCondition] = useState("Excellent");
  const [formPurchasePrice, setFormPurchasePrice] = useState("");
  const [formPurchaseDate, setFormPurchaseDate] = useState("");
  const [formPurchaseLocation, setFormPurchaseLocation] = useState("");
  const [formTags, setFormTags] = useState([]);
  const [formNotes, setFormNotes] = useState("");
  const [formSerial, setFormSerial] = useState("");
  const [formCustomTag, setFormCustomTag] = useState("");

  // ── Supabase sync helpers ──
  async function syncPortfolioToSupabase(entries, userId) {
    if (!supabase || !userId) return;
    setSyncStatus("syncing");
    try {
      const rows = entries.map(o => {
        const item = allItems.find(i => i.id === o.id);
        return {
          user_id: userId,
          item_id: o.id,
          item_key: item?.key || null,
          item_data: item ? { brand: item.brand, name: item.name, category: item.category, avgPrice: item.avgPrice, highPrice: item.highPrice, lowPrice: item.lowPrice, numListings: item.numListings, sources: item.sources, imageUrl: item.imageUrl, sampleUrls: item.sampleUrls } : {},
          condition: o.condition,
          purchase_price: o.purchasePrice || null,
          purchase_date: o.purchaseDate || null,
          purchase_location: o.purchaseLocation || null,
          tags: o.tags || [],
          notes: o.notes || null,
          serial_number: o.serialNumber || null,
          added_date: o.addedDate || new Date().toISOString(),
          updated_date: new Date().toISOString(),
        };
      });
      if (rows.length > 0) {
        await supabase.from("portfolios").upsert(rows, { onConflict: "user_id,item_id" });
      }
      const ownedIds = entries.map(o => o.id);
      const { data: existing } = await supabase.from("portfolios").select("item_id").eq("user_id", userId);
      const toDelete = (existing || []).map(r => r.item_id).filter(id => !ownedIds.includes(id));
      if (toDelete.length > 0) {
        await supabase.from("portfolios").delete().eq("user_id", userId).in("item_id", toDelete);
      }
      setSyncStatus("synced");
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (e) {
      console.error("[sync to supabase]", e.message);
      setSyncStatus("error");
      setTimeout(() => setSyncStatus(null), 4000);
    }
  }

  async function loadPortfolioFromSupabase(userId) {
    if (!supabase || !userId) return null;
    try {
      const { data, error } = await supabase.from("portfolios").select("*").eq("user_id", userId);
      if (error || !data?.length) return null;
      // Restore owned entries and item cache
      const restoredOwned = data.map(r => ({
        id: r.item_id,
        condition: r.condition,
        purchasePrice: r.purchase_price,
        purchaseDate: r.purchase_date,
        purchaseLocation: r.purchase_location,
        tags: r.tags || [],
        notes: r.notes,
        serialNumber: r.serial_number,
        addedDate: r.added_date,
        updatedDate: r.updated_date,
      }));
      const restoredItems = data
        .filter(r => r.item_data && r.item_data.name)
        .map(r => ({ id: r.item_id, key: r.item_key, ...r.item_data }));
      return { owned: restoredOwned, items: restoredItems };
    } catch (e) { console.error("[load from supabase]", e.message); return null; }
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        const remote = await loadPortfolioFromSupabase(u.id);
        if (remote) {
          setOwned(remote.owned);
          savePortfolio(remote.owned);
          setAllItems(prev => {
            const ex = new Set(prev.map(i => i.id));
            const newItems = remote.items.filter(i => !ex.has(i.id));
            const merged = [...prev, ...newItems];
            saveItemCache(merged);
            return merged;
          });
        }
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        const remote = await loadPortfolioFromSupabase(u.id);
        if (remote) {
          setOwned(remote.owned);
          savePortfolio(remote.owned);
          setAllItems(prev => {
            const ex = new Set(prev.map(i => i.id));
            const newItems = remote.items.filter(i => !ex.has(i.id));
            const merged = [...prev, ...newItems];
            saveItemCache(merged);
            return merged;
          });
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Persist locally always; sync to Supabase when logged in
  useEffect(() => {
    savePortfolio(owned);
    if (user) syncPortfolioToSupabase(owned, user.id);
  }, [owned, user]);
  useEffect(() => { if (allItems.length) saveItemCache(allItems); }, [allItems]);

  useEffect(() => {
    if (!searchResults.length) return;
    const nh = { ...priceHistory };
    for (const item of searchResults) {
      if (item.key && item.avgPrice > 0) nh[item.key] = recordPrice(item.key, item.avgPrice);
    }
    setPriceHistory(nh);
  }, [searchResults]);

  useEffect(() => {
    const h = {};
    for (const item of allItems) { if (item.key) h[item.key] = getPriceHistory(item.key); }
    setPriceHistory(h);
  }, []);

  // ── Portfolio analytics ──
  const analytics = useMemo(() => {
    let totalValue = 0, costBasis = 0, gainers = [], losers = [];
    for (const o of owned) {
      const item = allItems.find(i => i.id === o.id);
      if (!item) continue;
      const cond = CONDITIONS.find(c => c.label === o.condition);
      const val = item.avgPrice * (cond?.multiplier || 1);
      totalValue += val;
      if (o.purchasePrice) {
        costBasis += o.purchasePrice;
        const pnl = val - o.purchasePrice;
        const pct = (pnl / o.purchasePrice) * 100;
        if (pnl >= 0) gainers.push({ item, o, val, pnl, pct });
        else losers.push({ item, o, val, pnl, pct });
      }
    }
    gainers.sort((a, b) => b.pct - a.pct);
    losers.sort((a, b) => a.pct - b.pct);
    return { totalValue, costBasis, totalPnL: costBasis > 0 ? totalValue - costBasis : null, gainers, losers };
  }, [owned, allItems]);

  // ── Keyboard shortcuts (filteredResults ref kept in sync via ref to avoid stale closure) ──
  const filteredResultsRef = useRef([]);
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        if (lightbox) { setLightbox(false); return; }
        if (detailModal) { setDetailModal(null); return; }
        if (addModal) { setAddModal(null); return; }
        if (editModal) { setEditModal(null); return; }
        if (authView) { setAuthView(null); return; }
      }
      if (detailModal && filteredResultsRef.current.length > 1) {
        const fr = filteredResultsRef.current;
        const idx = fr.findIndex(i => i.id === detailModal.id);
        if (e.key === "ArrowRight" && idx < fr.length - 1) setDetailModal(fr[idx + 1]);
        if (e.key === "ArrowLeft" && idx > 0) setDetailModal(fr[idx - 1]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, detailModal, addModal, editModal, authView]);

  const handleSearch = useCallback(async () => {
    if (!search.trim()) return;
    const q = search.trim();
    setSearchHistory(prev => {
      const next = [q, ...prev.filter(h => h !== q)].slice(0, 8);
      try { localStorage.setItem("vault_search_history", JSON.stringify(next)); } catch {}
      return next;
    });
    setSearching(true); setSearchError(null); setSearchResults([]); setPlatformInfo(null);
    setFiltersOpen(false); setFilterCat("All"); setFilterPlatform("All"); setFilterMinPrice(""); setFilterMaxPrice("");
    try {
      const data = await searchAPI(search.trim());

      // Zero results — kick off AI enrichment pipeline
      if (data.enriching) {
        setSearchError(null);
        setSearching(true);
        // Show a special discovering state
        setSearchResults([{ _discovering: true, id: "discovering", brand: "", name: "", category: "", avgPrice: 0, lowPrice: 0, highPrice: 0, numListings: 0, sources: [], imageUrl: null, sampleUrls: [] }]);
        try {
          const enrichResp = await fetch(`${API_URL}/api/enrich`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: q }),
          });
          const enrichData = await enrichResp.json();
          if (enrichData.liveListings?.length > 0) {
            // Convert live listings into search result format
            const enrichedItems = [{
              id: `enriched-${Date.now()}`,
              key: (enrichData.enriched?.brand || q).toLowerCase().replace(/[^a-z0-9]/g, "-"),
              brand: enrichData.enriched?.brand || extractBrand(q) || q.split(" ")[0],
              name: enrichData.enriched?.displayName || q,
              category: enrichData.enriched?.category || "Accessories",
              avgPrice: enrichData.avgMarketPrice || 0,
              lowPrice: Math.min(...enrichData.liveListings.map(l => l.price).filter(Boolean)) || 0,
              highPrice: Math.max(...enrichData.liveListings.map(l => l.price).filter(Boolean)) || 0,
              numListings: enrichData.totalFound || 0,
              sources: [...new Set(enrichData.liveListings.map(l => l.platform))],
              imageUrl: enrichData.liveListings.find(l => l.imageUrl)?.imageUrl || null,
              sampleUrls: enrichData.liveListings.slice(0, 5).map(l => ({ platform: l.platform, url: l.url })),
              msrp: enrichData.msrp,
              enriched: true,
              description: enrichData.enriched?.description,
            }];
            setSearchResults(enrichedItems);
            setAllItems(prev => { const ex = new Set(prev.map(i => i.id)); return [...prev, ...enrichedItems.filter(r => !ex.has(r.id))]; });
          } else if (enrichData.enriched && enrichData.enriched.confidence !== "none") {
            // Identified but no market listings yet — show what we know
            const partialItem = {
              id: `enriched-${Date.now()}`,
              key: enrichData.enriched.brand?.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Date.now(),
              brand: enrichData.enriched.brand || q.split(" ")[0],
              name: enrichData.enriched.displayName || q,
              category: enrichData.enriched.category || "Accessories",
              avgPrice: enrichData.msrp || 0,
              lowPrice: enrichData.msrp || 0,
              highPrice: enrichData.msrp || 0,
              numListings: 0,
              sources: ["Brand Site"],
              imageUrl: null,
              sampleUrls: [],
              msrp: enrichData.msrp,
              enriched: true,
              noMarketData: true,
              description: enrichData.enriched.description,
            };
            setSearchResults([partialItem]);
            setAllItems(prev => { const ex = new Set(prev.map(i => i.id)); return [...prev, partialItem].filter(r => !ex.has(r.id) || r === partialItem); });
          } else {
            setSearchResults([]);
            setSearchError("This item could not be found anywhere on the web. Double-check the brand and product name.");
          }
        } catch (enrichErr) {
          setSearchResults([]);
          setSearchError("No results found. Try a different search term.");
        }
        return;
      }

      if (!data.items.length) { setSearchError("No results found. Try a different search term."); setSearchResults([]); }
      else {
        setSearchResults(data.items); setPlatformInfo(data.platforms);
        setAllItems(prev => { const ex = new Set(prev.map(i => i.id)); return [...prev, ...data.items.filter(r => !ex.has(r.id))]; });
      }
    } catch (err) { setSearchError(err.message || "Search failed."); }
    finally { setSearching(false); }
  }, [search]);

  async function handleAuth(mode) {
    if (!supabase) return;
    setAuthLoading(true); setAuthError(null); setAuthSuccess(null);
    try {
      if (mode === "google") { await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } }); return; }
      if (mode === "signup") { const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword }); if (error) throw error; setAuthSuccess("Account created! You are now signed in."); }
      else { const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword }); if (error) throw error; setAuthView(null); }
    } catch (e) { setAuthError(e.message); }
    finally { setAuthLoading(false); }
  }

  function openAddModal(item) {
    setFormCondition("Excellent"); setFormPurchasePrice(""); setFormPurchaseDate("");
    setFormPurchaseLocation(""); setFormTags([]); setFormNotes(""); setFormSerial(""); setFormCustomTag("");
    setAddModal(item);
  }

  function openEditModal(o, item) {
    setFormCondition(o.condition || "Excellent");
    setFormPurchasePrice(o.purchasePrice ? String(o.purchasePrice) : "");
    setFormPurchaseDate(o.purchaseDate || "");
    setFormPurchaseLocation(o.purchaseLocation || "");
    setFormTags(o.tags || []);
    setFormNotes(o.notes || "");
    setFormSerial(o.serialNumber || "");
    setFormCustomTag("");
    setEditModal({ o, item });
  }

  function saveEntry(itemId) {
    const entry = {
      id: itemId, condition: formCondition,
      purchasePrice: formPurchasePrice ? parseFloat(formPurchasePrice) : null,
      purchaseDate: formPurchaseDate || null,
      purchaseLocation: formPurchaseLocation || null,
      tags: formTags,
      notes: formNotes || null,
      serialNumber: formSerial || null,
      addedDate: editModal ? (editModal.o.addedDate) : new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    };
    setOwned(prev => [...prev.filter(o => o.id !== itemId), entry]);
    setAddModal(null); setEditModal(null);
  }

  function removeOwned(itemId) {
    setOwned(prev => prev.filter(o => o.id !== itemId));
    if (selectedItem?.id === itemId) setSelectedItem(null);
  }

  function toggleTag(tag) {
    setFormTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  function addCustomTag() {
    if (formCustomTag.trim() && !formTags.includes(formCustomTag.trim())) {
      setFormTags(prev => [...prev, formCustomTag.trim()]);
      setFormCustomTag("");
    }
  }

  function isOwned(id) { return owned.some(o => o.id === id); }
  function getOwned(id) { return owned.find(o => o.id === id); }

  const allPlatforms = useMemo(() => { const s = new Set(); searchResults.forEach(r => r.sources?.forEach(p => s.add(p))); return [...s]; }, [searchResults]);

  const filteredResults = useMemo(() => {
    const results = searchResults
      .filter(i => filterCat === "All" || i.category === filterCat)
      .filter(i => filterPlatform === "All" || i.sources?.includes(filterPlatform))
      .filter(i => !filterMinPrice || i.avgPrice >= parseFloat(filterMinPrice))
      .filter(i => !filterMaxPrice || i.avgPrice <= parseFloat(filterMaxPrice))
      .sort((a, b) => sortBy === "price-high" ? b.avgPrice - a.avgPrice : sortBy === "price-low" ? a.avgPrice - b.avgPrice : sortBy === "listings" ? b.numListings - a.numListings : 0);
    filteredResultsRef.current = results;
    return results;
  }, [searchResults, filterCat, filterPlatform, filterMinPrice, filterMaxPrice, sortBy]);

  const activeFilterCount = [filterCat !== "All", filterPlatform !== "All", !!filterMinPrice, !!filterMaxPrice, sortBy !== "relevance"].filter(Boolean).length;

  const C = {
    bg: "#08090a", surface: "#0f1012", surfaceHover: "#141618",
    border: "rgba(255,255,255,0.06)", borderGold: "rgba(196,160,82,0.25)",
    gold: "#c4a052", text: "#e2ddd6", textMid: "#8a8278", textDim: "#4a4642",
    red: "#e05c5c", green: "#4aab7a",
  };
  const g = a => `rgba(196,160,82,${a})`;
  const w = a => `rgba(255,255,255,${a})`;
  const MONO = "'Geist Mono','SF Mono','Consolas',monospace";
  const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif";

  // ── Landing page ──
  if (showLanding) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap');
          @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@300;400;500&display=swap');
          * { margin: 0; padding: 0; box-sizing: border-box; }
        `}</style>
        <LandingPage onEnter={enterApp} C={C} g={g} MONO={MONO} SERIF={SERIF} />
      </>
    );
  }

  // ── Search card ──
  const renderCard = (item) => {
    const io = isOwned(item.id);
    const oe = getOwned(item.id);
    const isHov = hoveredCard === item.id;
    const ph = item.key ? (priceHistory[item.key] || getPriceHistory(item.key)) : [];
    const trend = getTrend(ph);
    const tc = trend === null ? C.textDim : trend >= 0 ? C.green : C.red;

    return (
      <div key={item.id} onMouseEnter={() => setHoveredCard(item.id)} onMouseLeave={() => setHoveredCard(null)}
        style={{ background: io ? `linear-gradient(135deg,${g(0.07)},${g(0.03)})` : isHov ? C.surfaceHover : C.surface, border: `1px solid ${io ? C.borderGold : isHov ? w(0.1) : C.border}`, borderRadius: 3, padding: "22px 22px 18px", transition: "all 0.22s cubic-bezier(0.4,0,0.2,1)", position: "relative", overflow: "hidden" }}>

        {io && <div style={{ position: "absolute", top: 0, right: 0, width: 36, height: 36, background: `linear-gradient(225deg,${g(0.35)},transparent)`, borderRadius: "0 3px 0 0" }} />}

        <div style={{ display: "flex", gap: 12, marginBottom: 16, justifyContent: "space-between" }}>
          <div style={{ minWidth: 0, flex: 1, cursor: "pointer" }} onClick={() => setDetailModal(item)}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.gold, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 5 }}>
              {item.brand} <span style={{ color: C.textDim }}>· {item.category}</span>
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 17, color: C.text, lineHeight: 1.3 }}>{item.name}</div>
            {oe?.tags?.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 6 }}>
                {oe.tags.map(t => <span key={t} style={{ fontFamily: MONO, fontSize: 7, color: C.gold, padding: "1px 5px", border: `1px solid ${g(0.2)}`, borderRadius: 2, letterSpacing: "0.04em" }}>{t}</span>)}
              </div>
            )}
          </div>
          <div onClick={() => setDetailModal(item)} style={{ cursor: "pointer", flexShrink: 0 }}>
            {item.imageUrl ? <img src={item.imageUrl} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 2, display: "block", transition: "opacity 0.15s" }} onError={e => e.target.style.display = "none"} /> : <div style={{ width: 56, height: 56, border: `1px solid ${C.border}`, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 20 }}>○</div>}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 30, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>{fmt(item.avgPrice)}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{fmt(item.lowPrice)} — {fmt(item.highPrice)}</span>
              {trend !== null && <span style={{ fontFamily: MONO, fontSize: 9, color: tc }}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%</span>}
            </div>
            {/* P&L vs purchase price */}
            {oe?.purchasePrice > 0 && (
              <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 9, color: item.avgPrice >= oe.purchasePrice ? C.green : C.red }}>
                {item.avgPrice >= oe.purchasePrice ? "+" : ""}{fmt(item.avgPrice - oe.purchasePrice)} vs paid {fmt(oe.purchasePrice)}
              </div>
            )}
          </div>
          {ph.length >= 2 ? <Sparkline data={ph} color={tc} /> : <span style={{ fontFamily: MONO, fontSize: 8, color: C.textDim }}>NO HISTORY</span>}
        </div>

        <div style={{ height: 1, background: C.border, marginBottom: 12 }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {item.sources.slice(0, 4).map(s => <span key={s} style={{ fontFamily: MONO, fontSize: 8, color: C.textMid, padding: "2px 5px", border: `1px solid ${C.border}`, borderRadius: 2 }}>{PLATFORMS_SHORT[s] || s.slice(0, 5).toUpperCase()}</span>)}
            {item.sources.length > 4 && <span style={{ fontFamily: MONO, fontSize: 8, color: C.textDim }}>+{item.sources.length - 4}</span>}
          </div>
          <span style={{ fontFamily: MONO, fontSize: 8, color: C.textDim }}>{item.numListings} listing{item.numListings !== 1 ? "s" : ""}</span>
        </div>

        {io ? (
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1, padding: "8px 10px", background: g(0.1), border: `1px solid ${C.borderGold}`, borderRadius: 2, fontFamily: MONO, fontSize: 9, color: C.gold, textAlign: "center", letterSpacing: "0.06em" }}>
              ✓ IN VAULT · {oe.condition?.toUpperCase()}
            </div>
            <button onClick={() => openEditModal(oe, item)} style={{ padding: "8px 10px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 2, color: C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 9 }}>EDIT</button>
            <button onClick={() => removeOwned(item.id)} style={{ padding: "8px 10px", background: "transparent", border: "1px solid rgba(224,92,92,0.2)", borderRadius: 2, color: C.red, cursor: "pointer", fontFamily: MONO, fontSize: 9 }} onMouseEnter={e => e.currentTarget.style.background = "rgba(224,92,92,0.08)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>✕</button>
          </div>
        ) : (
          <button onClick={() => openAddModal(item)} style={{ width: "100%", padding: "9px", background: isHov ? g(0.12) : "transparent", border: `1px solid ${isHov ? C.borderGold : C.border}`, borderRadius: 2, color: isHov ? C.gold : C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", transition: "all 0.2s" }}>
            ADD TO VAULT
          </button>
        )}
      </div>
    );
  };

  // ── Add/Edit form ──
  const renderForm = (item, isEdit) => {
    const cond = CONDITIONS.find(c => c.label === formCondition);
    const est = item.avgPrice * (cond?.multiplier || 1);
    const pnl = formPurchasePrice ? est - parseFloat(formPurchasePrice) : null;

    return (
      <div onClick={() => { setAddModal(null); setEditModal(null); }} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflowY: "auto" }}>
        <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 60px 120px rgba(0,0,0,0.7)" }}>

          {/* Modal header */}
          <div style={{ padding: "22px 24px 18px", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.surface, zIndex: 1 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.gold, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 3 }}>{isEdit ? "Edit Entry" : "Add to Vault"} · {item.brand}</div>
            <div style={{ fontFamily: SERIF, fontSize: 18, color: C.text, lineHeight: 1.25 }}>{item.name}</div>
            {/* Live value estimate */}
            <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", marginBottom: 3 }}>MARKET AVG</div>
                <div style={{ fontFamily: SERIF, fontSize: 18, color: C.textMid }}>{fmt(item.avgPrice)}</div>
              </div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", marginBottom: 3 }}>YOUR VALUE</div>
                <div style={{ fontFamily: SERIF, fontSize: 18, color: C.text }}>{fmt(est)}</div>
              </div>
              {pnl !== null && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", marginBottom: 3 }}>UNREALIZED P&L</div>
                  <div style={{ fontFamily: SERIF, fontSize: 18, color: pnl >= 0 ? C.green : C.red }}>{pnl >= 0 ? "+" : ""}{fmt(pnl)}</div>
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Condition */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>Condition</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {CONDITIONS.map(c => (
                  <button key={c.label} onClick={() => setFormCondition(c.label)}
                    style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: formCondition === c.label ? g(0.1) : "transparent", border: `1px solid ${formCondition === c.label ? C.borderGold : C.border}`, borderRadius: 2, cursor: "pointer", textAlign: "left", transition: "all 0.1s" }}>
                    <div>
                      <span style={{ fontFamily: SERIF, fontSize: 14, color: C.text }}>{c.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginLeft: 10 }}>{c.desc}</span>
                    </div>
                    <span style={{ fontFamily: SERIF, fontSize: 14, color: formCondition === c.label ? C.gold : C.textMid, flexShrink: 0, marginLeft: 12 }}>
                      {fmt(item.avgPrice * c.multiplier)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Purchase details */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>Purchase Details</div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, marginBottom: 5 }}>PRICE PAID</div>
                  <input type="number" placeholder="0" value={formPurchasePrice} onChange={e => setFormPurchasePrice(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, color: C.text, fontFamily: MONO, fontSize: 12, outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, marginBottom: 5 }}>DATE PURCHASED</div>
                  <input type="date" value={formPurchaseDate} onChange={e => setFormPurchaseDate(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, color: C.text, fontFamily: MONO, fontSize: 11, outline: "none", colorScheme: "dark" }} />
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, marginBottom: 5 }}>WHERE PURCHASED</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {PURCHASE_LOCATIONS.map(loc => (
                    <button key={loc} onClick={() => setFormPurchaseLocation(formPurchaseLocation === loc ? "" : loc)}
                      style={{ padding: "4px 10px", background: formPurchaseLocation === loc ? g(0.15) : "transparent", border: `1px solid ${formPurchaseLocation === loc ? C.borderGold : C.border}`, borderRadius: 2, color: formPurchaseLocation === loc ? C.gold : C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 9, letterSpacing: "0.04em" }}>
                      {loc}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>Tags</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                {PRESET_TAGS.map(tag => (
                  <button key={tag} onClick={() => toggleTag(tag)}
                    style={{ padding: "4px 10px", background: formTags.includes(tag) ? g(0.15) : "transparent", border: `1px solid ${formTags.includes(tag) ? C.borderGold : C.border}`, borderRadius: 2, color: formTags.includes(tag) ? C.gold : C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 9 }}>
                    {tag}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="text" placeholder="Add custom tag..." value={formCustomTag} onChange={e => setFormCustomTag(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addCustomTag()}
                  style={{ flex: 1, padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, color: C.text, fontFamily: MONO, fontSize: 11, outline: "none" }} />
                <button onClick={addCustomTag} style={{ padding: "8px 14px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 2, color: C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 9 }}>ADD</button>
              </div>
              {formTags.filter(t => !PRESET_TAGS.includes(t)).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                  {formTags.filter(t => !PRESET_TAGS.includes(t)).map(t => (
                    <span key={t} style={{ padding: "3px 8px", background: g(0.08), border: `1px solid ${g(0.2)}`, borderRadius: 2, fontFamily: MONO, fontSize: 9, color: C.gold, display: "flex", alignItems: "center", gap: 5 }}>
                      {t} <button onClick={() => toggleTag(t)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Serial + Notes */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, marginBottom: 5 }}>SERIAL NUMBER</div>
                <input type="text" placeholder="Optional" value={formSerial} onChange={e => setFormSerial(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, color: C.text, fontFamily: MONO, fontSize: 11, outline: "none" }} />
              </div>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, marginBottom: 5 }}>NOTES</div>
                <input type="text" placeholder="Optional" value={formNotes} onChange={e => setFormNotes(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, color: C.text, fontFamily: MONO, fontSize: 11, outline: "none" }} />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => saveEntry(item.id)}
                style={{ flex: 1, padding: "12px", background: C.gold, border: "none", borderRadius: 2, color: C.bg, cursor: "pointer", fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 500 }}>
                {isEdit ? "Save Changes" : "Add to Vault"}
              </button>
              <button onClick={() => { setAddModal(null); setEditModal(null); }}
                style={{ padding: "12px 18px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 2, color: C.textDim, cursor: "pointer", fontFamily: MONO, fontSize: 10 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Item Detail Modal ──
  const renderDetailModal = () => {
    const item = detailModal;
    if (!item) return null;
    const io = isOwned(item.id);
    const oe = getOwned(item.id);
    const ph = item.key ? (priceHistory[item.key] || getPriceHistory(item.key)) : [];
    const trend = getTrend(ph);
    const tc = trend === null ? C.textDim : trend >= 0 ? C.green : C.red;
    const spread = item.highPrice - item.lowPrice;
    const spreadPct = item.avgPrice > 0 ? Math.round((spread / item.avgPrice) * 100) : 0;
    const currentIdx = filteredResults.findIndex(i => i.id === item.id);
    const hasPrev = currentIdx > 0;
    const hasNext = currentIdx < filteredResults.length - 1;

    return (
      <>
        {/* Lightbox — fullscreen image */}
        {lightbox && item.imageUrl && (
          <div onClick={() => setLightbox(false)}
            style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.97)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
            <img src={item.imageUrl} alt={item.name}
              style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", boxShadow: "0 40px 120px rgba(0,0,0,0.8)" }} />
            <button onClick={() => setLightbox(false)}
              style={{ position: "absolute", top: 20, right: 20, width: 36, height: 36, background: "rgba(255,255,255,0.08)", border: `1px solid ${C.border}`, borderRadius: "50%", color: C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
              ×
            </button>
            <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.1em" }}>
              PRESS ESC TO CLOSE
            </div>
          </div>
        )}

        {/* Detail modal */}
        <div onClick={() => setDetailModal(null)}
          style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(0,0,0,0.92)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>

          {/* Prev/Next arrow navigation */}
          {hasPrev && (
            <button onClick={e => { e.stopPropagation(); setDetailModal(filteredResults[currentIdx - 1]); setLightbox(false); }}
              style={{ position: "fixed", left: 16, top: "50%", transform: "translateY(-50%)", zIndex: 260, width: 40, height: 40, background: "rgba(15,16,18,0.9)", border: `1px solid ${C.border}`, borderRadius: "50%", color: C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = g(0.4); e.currentTarget.style.color = C.gold; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMid; }}>
              ‹
            </button>
          )}
          {hasNext && (
            <button onClick={e => { e.stopPropagation(); setDetailModal(filteredResults[currentIdx + 1]); setLightbox(false); }}
              style={{ position: "fixed", right: 16, top: "50%", transform: "translateY(-50%)", zIndex: 260, width: 40, height: 40, background: "rgba(15,16,18,0.9)", border: `1px solid ${C.border}`, borderRadius: "50%", color: C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = g(0.4); e.currentTarget.style.color = C.gold; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMid; }}>
              ›
            </button>
          )}

          <div onClick={e => e.stopPropagation()}
            style={{ background: C.surface, border: `1px solid ${C.border}`, maxWidth: 820, width: "100%", maxHeight: "88vh", boxShadow: "0 80px 160px rgba(0,0,0,0.8)", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", overflow: "hidden" }}>

            {/* Left: Image panel */}
            <div style={{ position: "relative", background: "#0a0b0c", display: "flex", alignItems: "center", justifyContent: "center", minHeight: isMobile ? 220 : 460, borderRight: isMobile ? "none" : `1px solid ${C.border}`, borderBottom: isMobile ? `1px solid ${C.border}` : "none" }}>
              {item.imageUrl ? (
                <>
                  <img src={item.imageUrl} alt={item.name}
                    onClick={() => setLightbox(true)}
                    style={{ width: "100%", height: "100%", minHeight: isMobile ? 220 : 460, objectFit: "contain", display: "block", padding: "16px", boxSizing: "border-box", cursor: "zoom-in", transition: "transform 0.3s ease" }}
                    onMouseEnter={e => !isMobile && (e.target.style.transform = "scale(1.03)")}
                    onMouseLeave={e => !isMobile && (e.target.style.transform = "scale(1)")}
                    onError={e => e.target.style.display = "none"} />
                  {/* Zoom hint */}
                  <div onClick={() => setLightbox(true)}
                    style={{ position: "absolute", bottom: 14, right: 14, padding: "4px 10px", background: "rgba(8,9,10,0.85)", border: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.08em", cursor: "zoom-in", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: 4 }}>
                    ⊕ FULL SIZE
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 40 }}>
                  <div style={{ fontFamily: SERIF, fontSize: 72, color: C.textDim, opacity: 0.15, lineHeight: 1 }}>
                    {item.category === "Watches" ? "◷" : item.category === "Handbags" ? "◻" : item.category === "Jewelry" ? "◇" : item.category === "Shoes" ? "◁" : "○"}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.12em", textAlign: "center" }}>
                    NO IMAGE AVAILABLE
                  </div>
                </div>
              )}

              {/* Top overlays */}
              <div style={{ position: "absolute", top: 14, left: 14, display: "flex", gap: 6 }}>
                <span style={{ padding: "3px 8px", background: "rgba(8,9,10,0.85)", border: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 8, color: C.textMid, letterSpacing: "0.1em", textTransform: "uppercase", backdropFilter: "blur(8px)" }}>
                  {item.category}
                </span>
                {io && <span style={{ padding: "3px 8px", background: g(0.2), border: `1px solid ${g(0.4)}`, fontFamily: MONO, fontSize: 8, color: C.gold, letterSpacing: "0.08em", backdropFilter: "blur(8px)" }}>IN VAULT</span>}
              </div>

              {/* Close button */}
              <button onClick={() => setDetailModal(null)}
                style={{ position: "absolute", top: 14, right: 14, width: 28, height: 28, background: "rgba(8,9,10,0.85)", border: `1px solid ${C.border}`, borderRadius: "50%", color: C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }}>
                ×
              </button>

              {/* Item counter */}
              {filteredResults.length > 1 && (
                <div style={{ position: "absolute", bottom: 14, left: 14, fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.08em" }}>
                  {currentIdx + 1} / {filteredResults.length}
                </div>
              )}
            </div>

            {/* Right: Details panel (scrollable) */}
            <div style={{ display: "flex", flexDirection: "column", maxHeight: isMobile ? "50vh" : "88vh", overflow: "hidden" }}>
              {/* Scrollable content */}
              <div style={{ flex: 1, overflowY: "auto", padding: "28px 26px 0" }}>

                {/* Brand + Name */}
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.gold, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>{item.brand}</div>
                  <div style={{ fontFamily: SERIF, fontSize: 21, color: C.text, lineHeight: 1.25 }}>{item.name}</div>
                </div>

                {/* Price block */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontFamily: SERIF, fontSize: 42, color: C.text, letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 10 }}>{fmt(item.avgPrice)}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 8 }}>
                    {[{ l: "Low", v: fmt(item.lowPrice), c: C.red }, { l: "Average", v: fmt(item.avgPrice), c: C.textMid }, { l: "High", v: fmt(item.highPrice), c: C.green }].map(s => (
                      <div key={s.l}>
                        <div style={{ fontFamily: MONO, fontSize: 7, color: C.textDim, letterSpacing: "0.1em", marginBottom: 3, textTransform: "uppercase" }}>{s.l}</div>
                        <div style={{ fontFamily: SERIF, fontSize: 14, color: s.c }}>{s.v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>
                    {spreadPct > 0 ? `±${spreadPct}% spread · ` : ""}{item.numListings} listing{item.numListings !== 1 ? "s" : ""} across {item.sources.length} platform{item.sources.length !== 1 ? "s" : ""}
                  </div>
                </div>

                {/* Condition value table */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Value by Condition</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {CONDITIONS.map(c => (
                      <div key={c.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: io && oe?.condition === c.label ? g(0.08) : "transparent", border: `1px solid ${io && oe?.condition === c.label ? g(0.2) : "transparent"}`, borderRadius: 2 }}>
                        <div>
                          <span style={{ fontFamily: MONO, fontSize: 9, color: io && oe?.condition === c.label ? C.gold : C.textMid }}>{c.label}</span>
                          {io && oe?.condition === c.label && <span style={{ fontFamily: MONO, fontSize: 8, color: C.gold, marginLeft: 6 }}>← yours</span>}
                        </div>
                        <span style={{ fontFamily: SERIF, fontSize: 14, color: io && oe?.condition === c.label ? C.gold : C.textMid }}>{fmt(item.avgPrice * c.multiplier)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Price history */}
                {ph.length >= 2 && (
                  <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Price History</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <Sparkline data={ph} width={140} height={44} color={tc} />
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: tc, marginBottom: 3 }}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%</div>
                        <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim }}>{ph[0].date}</div>
                        <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim }}>→ {ph[ph.length - 1].date}</div>
                        <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, marginTop: 3 }}>{ph.length} data point{ph.length !== 1 ? "s" : ""}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Live listings */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Live Listings</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {(item.sampleUrls?.length > 0 ? item.sampleUrls : item.sources.map(s => ({ platform: s, url: null }))).map((u, i) => (
                      u.url ? (
                        <a key={i} href={u.url} target="_blank" rel="noopener noreferrer"
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: C.bg, border: `1px solid ${C.border}`, textDecoration: "none", transition: "all 0.15s", borderRadius: 1 }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = g(0.35); e.currentTarget.style.background = g(0.04); }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bg; }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMid }}>{u.platform}</span>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.gold }}>View listing ↗</span>
                        </a>
                      ) : (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 1 }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMid }}>{u.platform}</span>
                          <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>No direct link</span>
                        </div>
                      )
                    ))}
                  </div>
                </div>

                {/* In Vault status */}
                {io && oe && (
                  <div style={{ marginBottom: 20, paddingBottom: 0 }}>
                    <div style={{ padding: "14px 16px", background: g(0.06), border: `1px solid ${C.borderGold}`, borderRadius: 2, marginBottom: 10 }}>
                      <div style={{ fontFamily: MONO, fontSize: 8, color: C.gold, letterSpacing: "0.1em", marginBottom: 10, textTransform: "uppercase" }}>Your Entry</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div><div style={{ fontFamily: MONO, fontSize: 7, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Condition</div><div style={{ fontFamily: SERIF, fontSize: 14, color: C.text }}>{oe.condition}</div></div>
                        {oe.purchasePrice && <div><div style={{ fontFamily: MONO, fontSize: 7, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Paid</div><div style={{ fontFamily: SERIF, fontSize: 14, color: C.text }}>{fmt(oe.purchasePrice)}</div></div>}
                        {oe.purchaseDate && <div><div style={{ fontFamily: MONO, fontSize: 7, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Purchased</div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textMid }}>{fmtDate(oe.purchaseDate)}</div></div>}
                        {oe.purchaseLocation && <div><div style={{ fontFamily: MONO, fontSize: 7, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>From</div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textMid }}>{oe.purchaseLocation}</div></div>}
                        {oe.serialNumber && <div><div style={{ fontFamily: MONO, fontSize: 7, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Serial</div><div style={{ fontFamily: MONO, fontSize: 10, color: C.textMid }}>{oe.serialNumber}</div></div>}
                        {oe.purchasePrice && <div><div style={{ fontFamily: MONO, fontSize: 7, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>P&L</div><div style={{ fontFamily: SERIF, fontSize: 14, color: item.avgPrice >= oe.purchasePrice ? C.green : C.red }}>{item.avgPrice >= oe.purchasePrice ? "+" : ""}{fmt(item.avgPrice - oe.purchasePrice)}</div></div>}
                      </div>
                      {oe.notes && <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 9, color: C.textMid, padding: "6px 10px", background: w(0.03), borderRadius: 2 }}>{oe.notes}</div>}
                      {oe.tags?.length > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 10 }}>{oe.tags.map(t => <span key={t} style={{ fontFamily: MONO, fontSize: 7, color: C.gold, padding: "2px 6px", border: `1px solid ${g(0.25)}`, borderRadius: 2 }}>{t}</span>)}</div>}
                    </div>
                  </div>
                )}

                {/* Keyboard hint */}
                {filteredResults.length > 1 && (
                  <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, textAlign: "center", marginBottom: 16, letterSpacing: "0.06em" }}>
                    ← → to navigate · ESC to close
                  </div>
                )}
              </div>

              {/* Sticky bottom CTA */}
              <div style={{ padding: "14px 26px 18px", borderTop: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
                {io && oe ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setDetailModal(null); openEditModal(oe, item); }}
                      style={{ flex: 1, padding: "11px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 2, color: C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", transition: "all 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = g(0.4); e.currentTarget.style.color = C.gold; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMid; }}>
                      EDIT ENTRY
                    </button>
                    <button onClick={() => { removeOwned(item.id); setDetailModal(null); }}
                      style={{ padding: "11px 16px", background: "transparent", border: "1px solid rgba(224,92,92,0.2)", borderRadius: 2, color: C.red, cursor: "pointer", fontFamily: MONO, fontSize: 9, transition: "all 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(224,92,92,0.08)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      REMOVE
                    </button>
                  </div>
                ) : (
                  <button onClick={() => { setDetailModal(null); openAddModal(item); }}
                    style={{ width: "100%", padding: "13px", background: C.gold, border: "none", borderRadius: 2, color: C.bg, cursor: "pointer", fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 500, transition: "opacity 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.9"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                    Add to Vault
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: SERIF, position: "relative" }}>
      <div style={{ position: "fixed", top: "15%", right: "-8%", width: "35vw", height: "35vw", background: `radial-gradient(ellipse,${g(0.04)} 0%,transparent 65%)`, pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", bottom: "5%", left: "-5%", width: "28vw", height: "28vw", background: `radial-gradient(ellipse,${g(0.03)} 0%,transparent 70%)`, pointerEvents: "none", zIndex: 0 }} />

      {/* ── HEADER ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, borderBottom: `1px solid ${C.border}`, background: "rgba(8,9,10,0.94)", backdropFilter: "blur(24px)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: isMobile ? "0 16px" : "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
          {/* Logo */}
          <button onClick={() => setShowLanding(true)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <rect x="1" y="1" width="18" height="18" stroke={C.gold} strokeWidth="1" fill="none"/>
              <rect x="4.5" y="4.5" width="11" height="11" fill={C.gold} opacity="0.15"/>
              <text x="10" y="14" textAnchor="middle" fill={C.gold} fontSize="9" fontFamily="Georgia,serif">V</text>
            </svg>
            {!isMobile && <span style={{ fontFamily: SERIF, fontSize: 15, letterSpacing: "0.22em", color: C.text, textTransform: "uppercase" }}>Vault</span>}
          </button>

          {/* Nav tabs */}
          <div style={{ display: "flex", alignItems: "center", flex: isMobile ? 1 : "unset", justifyContent: isMobile ? "center" : "unset" }}>
            {[{ key: "portfolio", label: isMobile ? `Portfolio${owned.length > 0 ? ` (${owned.length})` : ""}` : (owned.length > 0 ? `Portfolio (${owned.length})` : "Portfolio") }, { key: "search", label: "Search" }].map(v => (
              <button key={v.key} onClick={() => { setView(v.key); setSelectedItem(null); }}
                style={{ padding: isMobile ? "0 14px" : "0 18px", height: 52, background: "none", border: "none", borderBottom: view === v.key ? `1px solid ${C.gold}` : "1px solid transparent", color: view === v.key ? C.gold : C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: isMobile ? 9 : 10, letterSpacing: "0.12em", textTransform: "uppercase", transition: "all 0.2s", marginBottom: -1 }}>
                {v.label}
              </button>
            ))}
          </div>

          {/* Auth / sync */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {syncStatus && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: syncStatus === "syncing" ? C.gold : syncStatus === "synced" ? C.green : C.red, animation: syncStatus === "syncing" ? "pulse 1s ease-in-out infinite" : "none" }} />
                {!isMobile && <span style={{ fontFamily: MONO, fontSize: 8, color: syncStatus === "syncing" ? C.gold : syncStatus === "synced" ? C.green : C.red, letterSpacing: "0.06em" }}>
                  {syncStatus === "syncing" ? "SAVING" : syncStatus === "synced" ? "SYNCED" : "ERR"}
                </span>}
              </div>
            )}
            {supabase && (user ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 8, borderLeft: `1px solid ${C.border}` }}>
                {!isMobile && <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{user.email?.split("@")[0]}</span>}
                <button onClick={() => supabase.auth.signOut()} style={{ padding: "5px 8px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 2, color: C.textDim, cursor: "pointer", fontFamily: MONO, fontSize: 9 }}>OUT</button>
              </div>
            ) : (
              <button onClick={() => setAuthView("login")} style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${C.borderGold}`, borderRadius: 2, color: C.gold, cursor: "pointer", fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em" }}>
                {isMobile ? "LOG IN" : "SIGN IN"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: isMobile ? "24px 16px 100px" : "44px 32px 100px", position: "relative", zIndex: 1 }}>

        {/* ── PORTFOLIO ── */}
        {view === "portfolio" && (
          <div>
            {/* Analytics header */}
            <div style={{ marginBottom: 40, paddingBottom: 32, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 14 }}>
                Portfolio · {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 28, alignItems: "end" }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", marginBottom: 6 }}>MARKET VALUE</div>
                  <div style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 300, letterSpacing: "-0.03em", lineHeight: 1, color: C.text }}>{fmt(analytics.totalValue)}</div>
                </div>
                {analytics.costBasis > 0 && <>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", marginBottom: 6 }}>COST BASIS</div>
                    <div style={{ fontFamily: SERIF, fontSize: 32, color: C.textMid, letterSpacing: "-0.02em" }}>{fmt(analytics.costBasis)}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", marginBottom: 6 }}>UNREALIZED P&L</div>
                    <div style={{ fontFamily: SERIF, fontSize: 32, color: analytics.totalPnL >= 0 ? C.green : C.red, letterSpacing: "-0.02em" }}>
                      {analytics.totalPnL >= 0 ? "+" : ""}{fmt(analytics.totalPnL)}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: analytics.totalPnL >= 0 ? C.green : C.red, marginTop: 2 }}>
                      {analytics.totalPnL >= 0 ? "+" : ""}{((analytics.totalPnL / analytics.costBasis) * 100).toFixed(1)}% return
                    </div>
                  </div>
                </>}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.06em", marginTop: 12 }}>
                {owned.length} item{owned.length !== 1 ? "s" : ""}
                {supabase && !user && owned.length > 0 && <span style={{ marginLeft: 12 }}>· <button onClick={() => setAuthView("login")} style={{ background: "none", border: "none", color: C.gold, cursor: "pointer", fontFamily: MONO, fontSize: 9, padding: 0 }}>Sign in to sync →</button></span>}
              </div>
            </div>

            {/* Best/worst performers */}
            {(analytics.gainers.length > 0 || analytics.losers.length > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
                {analytics.gainers.length > 0 && (
                  <div style={{ padding: "16px 20px", background: "rgba(74,171,122,0.04)", border: "1px solid rgba(74,171,122,0.15)", borderRadius: 2 }}>
                    <div style={{ fontFamily: MONO, fontSize: 8, color: C.green, letterSpacing: "0.12em", marginBottom: 10, textTransform: "uppercase" }}>Top Gainer</div>
                    {analytics.gainers.slice(0, 1).map(({ item, pnl, pct }) => (
                      <div key={item.id}>
                        <div style={{ fontFamily: SERIF, fontSize: 15, color: C.text, marginBottom: 3 }}>{item.name}</div>
                        <div style={{ fontFamily: MONO, fontSize: 11, color: C.green }}>+{fmt(pnl)} · +{pct.toFixed(1)}%</div>
                      </div>
                    ))}
                  </div>
                )}
                {analytics.losers.length > 0 && (
                  <div style={{ padding: "16px 20px", background: "rgba(224,92,92,0.04)", border: "1px solid rgba(224,92,92,0.15)", borderRadius: 2 }}>
                    <div style={{ fontFamily: MONO, fontSize: 8, color: C.red, letterSpacing: "0.12em", marginBottom: 10, textTransform: "uppercase" }}>Biggest Dip</div>
                    {analytics.losers.slice(0, 1).map(({ item, pnl, pct }) => (
                      <div key={item.id}>
                        <div style={{ fontFamily: SERIF, fontSize: 15, color: C.text, marginBottom: 3 }}>{item.name}</div>
                        <div style={{ fontFamily: MONO, fontSize: 11, color: C.red }}>{fmt(pnl)} · {pct.toFixed(1)}%</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {owned.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 24px" }}>
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none" style={{ margin: "0 auto 24px", display: "block", opacity: 0.18 }}>
                  <rect x="2" y="2" width="40" height="40" stroke={C.gold} strokeWidth="1" fill="none"/>
                  <line x1="22" y1="9" x2="22" y2="35" stroke={C.gold} strokeWidth="0.5"/>
                  <line x1="9" y1="22" x2="35" y2="22" stroke={C.gold} strokeWidth="0.5"/>
                </svg>
                <div style={{ fontFamily: SERIF, fontSize: 22, color: C.textMid, marginBottom: 10, fontWeight: 300 }}>Your portfolio is empty</div>
                <button onClick={() => setView("search")} style={{ padding: "10px 28px", background: "transparent", border: `1px solid ${C.borderGold}`, borderRadius: 2, color: C.gold, cursor: "pointer", fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em" }} onMouseEnter={e => e.currentTarget.style.background = g(0.1)} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>Begin Search</button>
              </div>
            ) : isMobile ? (
              /* ── MOBILE: stacked portfolio cards ── */
              <div style={{ display: "flex", flexDirection: "column", gap: 1, background: C.border }}>
                {owned.map((o) => {
                  const item = allItems.find(i => i.id === o.id);
                  if (!item) return null;
                  const cond = CONDITIONS.find(c => c.label === o.condition);
                  const val = item.avgPrice * (cond?.multiplier || 1);
                  const pnl = o.purchasePrice ? val - o.purchasePrice : null;
                  const isSel = selectedItem?.id === item.id;
                  return (
                    <div key={o.id} style={{ background: C.bg }}>
                      <div onClick={() => setSelectedItem(isSel ? null : item)}
                        style={{ padding: "14px 16px", cursor: "pointer", display: "flex", gap: 12, alignItems: "center" }}>
                        {item.imageUrl ? <img src={item.imageUrl} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 2, flexShrink: 0 }} onError={e => e.target.style.display="none"} /> : <div style={{ width: 48, height: 48, border: `1px solid ${C.border}`, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, flexShrink: 0 }}>○</div>}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: MONO, fontSize: 8, color: C.gold, letterSpacing: "0.1em", marginBottom: 2, textTransform: "uppercase" }}>{item.brand}</div>
                          <div style={{ fontFamily: SERIF, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                          <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginTop: 2 }}>{o.condition}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontFamily: SERIF, fontSize: 16, color: C.text }}>{fmt(val)}</div>
                          {pnl !== null && <div style={{ fontFamily: MONO, fontSize: 9, color: pnl >= 0 ? C.green : C.red }}>{pnl >= 0 ? "+" : ""}{fmt(pnl)}</div>}
                        </div>
                      </div>
                      {isSel && (
                        <div style={{ padding: "12px 16px 16px", borderTop: `1px solid ${C.border}`, background: g(0.03) }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                            {[["Low", fmt(item.lowPrice), C.red], ["Market", fmt(item.avgPrice), C.textMid], ["High", fmt(item.highPrice), C.green]].map(([l, v, c]) => (
                              <div key={l}><div style={{ fontFamily: MONO, fontSize: 7, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>{l}</div><div style={{ fontFamily: SERIF, fontSize: 14, color: c }}>{v}</div></div>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={e => { e.stopPropagation(); openEditModal(o, item); }} style={{ flex: 1, padding: "9px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 2, color: C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 9 }}>EDIT</button>
                            <button onClick={e => { e.stopPropagation(); setDetailModal(item); }} style={{ flex: 1, padding: "9px", background: "transparent", border: `1px solid ${C.borderGold}`, borderRadius: 2, color: C.gold, cursor: "pointer", fontFamily: MONO, fontSize: 9 }}>DETAILS</button>
                            <button onClick={e => { e.stopPropagation(); removeOwned(item.id); }} style={{ padding: "9px 12px", background: "transparent", border: "1px solid rgba(224,92,92,0.2)", borderRadius: 2, color: C.red, cursor: "pointer", fontFamily: MONO, fontSize: 9 }}>✕</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 120px 100px 100px", gap: 16, padding: "0 0 10px", borderBottom: `1px solid ${C.border}`, marginBottom: 2 }}>
                  {["Item", "Condition", "Market", "Value", "P&L", ""].map((h, i) => (
                    <div key={i} style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", textTransform: "uppercase", textAlign: i >= 2 ? "right" : "left" }}>{h}</div>
                  ))}
                </div>

                {owned.map((o) => {
                  const item = allItems.find(i => i.id === o.id);
                  if (!item) return null;
                  const cond = CONDITIONS.find(c => c.label === o.condition);
                  const val = item.avgPrice * (cond?.multiplier || 1);
                  const pnl = o.purchasePrice ? val - o.purchasePrice : null;
                  const isSel = selectedItem?.id === item.id;
                  const ph = item.key ? (priceHistory[item.key] || []) : [];
                  const trend = getTrend(ph);
                  const tc = trend === null ? C.textDim : trend >= 0 ? C.green : C.red;

                  return (
                    <div key={o.id}>
                      <div onClick={() => setSelectedItem(isSel ? null : item)}
                        style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 120px 100px 100px", gap: 16, padding: "14px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer", transition: "background 0.12s" }}
                        onMouseEnter={e => e.currentTarget.style.background = w(0.02)}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>

                        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                          {item.imageUrl ? <img src={item.imageUrl} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 1, flexShrink: 0 }} onError={e => e.target.style.display = "none"} /> : <div style={{ width: 36, height: 36, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 14, flexShrink: 0 }}>○</div>}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontFamily: MONO, fontSize: 8, color: C.gold, letterSpacing: "0.1em", marginBottom: 2, textTransform: "uppercase" }}>{item.brand}</div>
                            <div style={{ fontFamily: SERIF, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                            {o.tags?.length > 0 && <div style={{ display: "flex", gap: 3, marginTop: 3, flexWrap: "wrap" }}>{o.tags.slice(0,3).map(t => <span key={t} style={{ fontFamily: MONO, fontSize: 7, color: C.gold, padding: "1px 4px", border: `1px solid ${g(0.2)}`, borderRadius: 1 }}>{t}</span>)}</div>}
                          </div>
                        </div>

                        <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMid, display: "flex", alignItems: "center" }}>{o.condition}</div>
                        <div style={{ fontFamily: SERIF, fontSize: 15, color: C.textMid, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{fmt(item.avgPrice)}</div>
                        <div style={{ fontFamily: SERIF, fontSize: 15, color: C.text, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>{fmt(val)}</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                          {pnl !== null ? (
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontFamily: SERIF, fontSize: 13, color: pnl >= 0 ? C.green : C.red }}>{pnl >= 0 ? "+" : ""}{fmt(pnl)}</div>
                              <div style={{ fontFamily: MONO, fontSize: 8, color: pnl >= 0 ? C.green : C.red }}>{pnl >= 0 ? "+" : ""}{((pnl / o.purchasePrice) * 100).toFixed(1)}%</div>
                            </div>
                          ) : <span style={{ fontFamily: MONO, fontSize: 8, color: C.textDim }}>—</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                          <span style={{ fontFamily: MONO, fontSize: 9, color: C.textDim }}>{isSel ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {isSel && (
                        <div style={{ padding: "18px 0 18px 48px", borderBottom: `1px solid ${C.border}`, background: g(0.03) }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 16, marginBottom: 14 }}>
                            {[{ l: "Low", v: fmt(item.lowPrice), c: C.red }, { l: "Average", v: fmt(item.avgPrice), c: C.textMid }, { l: "High", v: fmt(item.highPrice), c: C.green }].map(s => (
                              <div key={s.l}>
                                <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", marginBottom: 4, textTransform: "uppercase" }}>{s.l}</div>
                                <div style={{ fontFamily: SERIF, fontSize: 17, color: s.c }}>{s.v}</div>
                              </div>
                            ))}
                            {o.purchaseDate && <div><div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", marginBottom: 4, textTransform: "uppercase" }}>Purchased</div><div style={{ fontFamily: MONO, fontSize: 11, color: C.textMid }}>{fmtDate(o.purchaseDate)}</div></div>}
                            {o.purchaseLocation && <div><div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", marginBottom: 4, textTransform: "uppercase" }}>From</div><div style={{ fontFamily: MONO, fontSize: 11, color: C.textMid }}>{o.purchaseLocation}</div></div>}
                            {o.serialNumber && <div><div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.1em", marginBottom: 4, textTransform: "uppercase" }}>Serial</div><div style={{ fontFamily: MONO, fontSize: 11, color: C.textMid }}>{o.serialNumber}</div></div>}
                          </div>
                          {o.notes && <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMid, marginBottom: 12, padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 2 }}>{o.notes}</div>}
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <button onClick={e => { e.stopPropagation(); openEditModal(o, item); }} style={{ padding: "6px 14px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 2, color: C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 9 }}>EDIT</button>
                            {item.sampleUrls?.slice(0, 2).map((u, i) => <a key={i} href={u.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: MONO, fontSize: 9, color: C.gold, textDecoration: "none" }}>{PLATFORMS_SHORT[u.platform] || u.platform} ↗</a>)}
                            <button onClick={e => { e.stopPropagation(); removeOwned(item.id); }} style={{ marginLeft: "auto", background: "none", border: "none", color: C.red, cursor: "pointer", fontFamily: MONO, fontSize: 9 }}>REMOVE</button>
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
          <CatalogBrowse
            C={C} g={g} w={w} MONO={MONO} SERIF={SERIF}
            isMobile={isMobile}
            catItems={catItems} setCatItems={setCatItems}
            catLoading={catLoading} setCatLoading={setCatLoading}
            catTotal={catTotal} setCatTotal={setCatTotal}
            catPage={catPage} setCatPage={setCatPage}
            catTotalPages={catTotalPages} setCatTotalPages={setCatTotalPages}
            catCategory={catCategory} setCatCategory={setCatCategory}
            catBrand={catBrand} setCatBrand={setCatBrand}
            catSubcat={catSubcat} setCatSubcat={setCatSubcat}
            catSort={catSort} setCatSort={setCatSort}
            catQ={catQ} setCatQ={setCatQ}
            catQInput={catQInput} setCatQInput={setCatQInput}
            catFacets={catFacets} setCatFacets={setCatFacets}
            liveItems={liveItems} setLiveItems={setLiveItems}
            liveFetching={liveFetching} setLiveFetching={setLiveFetching}
            catDebounceRef={catDebounceRef}
            isOwned={isOwned} getOwned={getOwned}
            openAddModal={openAddModal}
            searchResults={searchResults} setSearchResults={setSearchResults}
            search={search} setSearch={setSearch}
            searching={searching}
            handleSearch={handleSearch}
            searchError={searchError}
            allItems={allItems} setAllItems={setAllItems}
            filteredResults={filteredResults}
            filterCat={filterCat} setFilterCat={setFilterCat}
            filterPlatform={filterPlatform} setFilterPlatform={setFilterPlatform}
            filterMinPrice={filterMinPrice} setFilterMinPrice={setFilterMinPrice}
            filterMaxPrice={filterMaxPrice} setFilterMaxPrice={setFilterMaxPrice}
            sortBy={sortBy} setSortBy={setSortBy}
            platformInfo={platformInfo}
            setDetailModal={setDetailModal}
            inputRef={inputRef}
            fmt={fmt}
            API_URL={API_URL}
          />
        )}
      </main>

      {/* Detail modal */}
      {detailModal && renderDetailModal()}

      {/* Add modal */}
      {addModal && renderForm(addModal, false)}
      {editModal && renderForm(editModal.item, true)}

      {/* Auth modal */}
      {authView && supabase && (
        <div onClick={() => setAuthView(null)} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, maxWidth: 380, width: "100%", boxShadow: "0 60px 120px rgba(0,0,0,0.7)" }}>
            <div style={{ padding: "28px 28px 24px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.gold, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>Vault</div>
              <div style={{ fontFamily: SERIF, fontSize: 20, color: C.text }}>{authView === "login" ? "Sign in to your vault" : "Create your vault"}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textDim, marginTop: 4 }}>Sync your portfolio across all devices</div>
            </div>
            <div style={{ padding: "24px 28px" }}>
              <button onClick={() => { if (supabase) supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } }); }} disabled={authLoading}
                style={{ width: "100%", padding: "11px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 2, color: C.text, cursor: "pointer", fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.borderColor = w(0.15)} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                <svg width="14" height="14" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Continue with Google
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <span style={{ fontFamily: MONO, fontSize: 8, color: C.textDim }}>OR</span>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                <input type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} style={{ padding: "11px 14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, color: C.text, fontFamily: MONO, fontSize: 11, outline: "none" }} />
                <input type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAuth(authView)} style={{ padding: "11px 14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, color: C.text, fontFamily: MONO, fontSize: 11, outline: "none" }} />
              </div>
              {authError && <div style={{ fontFamily: MONO, fontSize: 9, color: C.red, marginBottom: 12 }}>{authError}</div>}
              {authSuccess && <div style={{ fontFamily: MONO, fontSize: 9, color: C.green, marginBottom: 12 }}>{authSuccess}</div>}
              <button onClick={() => handleAuth(authView)} disabled={authLoading || !authEmail || !authPassword} style={{ width: "100%", padding: "11px", background: C.gold, border: "none", borderRadius: 2, color: C.bg, cursor: "pointer", fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", opacity: authLoading || !authEmail || !authPassword ? 0.5 : 1 }}>
                {authLoading ? "···" : authView === "login" ? "Sign In" : "Create Account"}
              </button>
              <div style={{ marginTop: 16, textAlign: "center" }}>
                <button onClick={() => { setAuthView(authView === "login" ? "signup" : "login"); setAuthError(null); setAuthSuccess(null); }} style={{ background: "none", border: "none", color: C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 9 }}>
                  {authView === "login" ? "No account? Create one →" : "Have an account? Sign in →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@300;400;500&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        ::placeholder { color: #4a4642; font-family: 'Cormorant Garamond',Georgia,serif; letter-spacing: 0.02em; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 2px; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); }
        @keyframes pulse { 0%,100% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.5); opacity: 1; } }
      `}</style>
    </div>
  );
}

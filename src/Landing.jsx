// ── Landing Page Component ──
// Inserted before the main LuxuryTracker export
// Uses scroll-driven 3D container tilt inspired by Aceternity

function LandingPage({ onEnter, C, g, MONO, SERIF }) {
  const scrollRef = useRef(null);
  const cardRef = useRef(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() { setScrollY(el.scrollTop); }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Tilt: goes from 35deg at 0 scroll to 0deg at 400px scroll
  const tilt = Math.max(0, 35 - (scrollY / 400) * 35);
  const scale = 0.72 + (scrollY / 400) * 0.28;
  const clampedScale = Math.min(1, Math.max(0.72, scale));

  const BRANDS = ["Rolex", "Hermès", "Chanel", "Cartier", "Patek Philippe", "Louis Vuitton", "Audemars Piguet", "Van Cleef", "Omega", "Goyard", "Dior", "Bottega Veneta", "Bulgari", "Tiffany & Co", "Prada"];
  const FEATURES = [
    { stat: "8", label: "Live Platforms", desc: "Fashionphile, Rebag, Privé Porter, eBay & more" },
    { stat: "Real-time", label: "Market Data", desc: "IQR-filtered pricing across thousands of listings" },
    { stat: "Full", label: "Portfolio Analytics", desc: "Cost basis, P&L, trends, tags and condition tracking" },
  ];

  return (
    <div ref={scrollRef} style={{ height: "100vh", overflowY: "auto", background: C.bg, color: C.text, fontFamily: SERIF, scrollBehavior: "smooth", position: "relative" }}>

      {/* Ambient glows */}
      <div style={{ position: "fixed", top: "0", left: "50%", transform: "translateX(-50%)", width: "60vw", height: "60vh", background: `radial-gradient(ellipse, ${g(0.06)} 0%, transparent 60%)`, pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", bottom: 0, right: "-10%", width: "40vw", height: "40vh", background: `radial-gradient(ellipse, ${g(0.04)} 0%, transparent 65%)`, pointerEvents: "none", zIndex: 0 }} />

      {/* Thin top bar */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, padding: "0 40px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${g(0.08)}`, background: "rgba(8,9,10,0.7)", backdropFilter: "blur(20px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <rect x="1" y="1" width="18" height="18" stroke={C.gold} strokeWidth="1" fill="none"/>
            <rect x="4.5" y="4.5" width="11" height="11" fill={C.gold} opacity="0.15"/>
            <text x="10" y="14" textAnchor="middle" fill={C.gold} fontSize="9" fontFamily="Georgia,serif">V</text>
          </svg>
          <span style={{ fontFamily: SERIF, fontSize: 15, letterSpacing: "0.22em", color: C.text, textTransform: "uppercase" }}>Vault</span>
        </div>
        <button onClick={onEnter} style={{ padding: "7px 18px", background: "transparent", border: `1px solid ${g(0.3)}`, borderRadius: 2, color: C.gold, cursor: "pointer", fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em" }}
          onMouseEnter={e => e.currentTarget.style.background = g(0.1)}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          ENTER APP
        </button>
      </header>

      {/* ── HERO ── */}
      <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px 0", position: "relative", zIndex: 1, textAlign: "center" }}>

        {/* Eyebrow */}
        <div style={{ fontFamily: MONO, fontSize: 9, color: C.gold, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 28, padding: "5px 14px", border: `1px solid ${g(0.25)}`, borderRadius: 2, background: g(0.06), display: "inline-block" }}>
          Luxury Resale Intelligence
        </div>

        {/* Headline */}
        <h1 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: "clamp(42px, 7vw, 88px)", lineHeight: 1.05, letterSpacing: "-0.03em", color: C.text, maxWidth: 900, marginBottom: 28 }}>
          Know what your<br />
          <span style={{ color: C.gold }}>collection</span> is worth
        </h1>

        {/* Sub */}
        <p style={{ fontFamily: MONO, fontSize: 11, color: C.textMid, letterSpacing: "0.06em", maxWidth: 520, lineHeight: 1.8, marginBottom: 44 }}>
          Live resale market data for watches, handbags, and jewelry — aggregated across 8 platforms, updated in real time.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: 12, marginBottom: 80, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={onEnter}
            style={{ padding: "14px 36px", background: C.gold, border: "none", borderRadius: 2, color: C.bg, cursor: "pointer", fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 500, transition: "opacity 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
            Start Tracking
          </button>
          <button onClick={() => scrollRef.current?.scrollTo({ top: window.innerHeight * 0.7, behavior: "smooth" })}
            style={{ padding: "14px 36px", background: "transparent", border: `1px solid ${g(0.25)}`, borderRadius: 2, color: C.textMid, cursor: "pointer", fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = g(0.5); e.currentTarget.style.color = C.gold; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = g(0.25); e.currentTarget.style.color = C.textMid; }}>
            See How It Works
          </button>
        </div>

        {/* ── 3D SCROLL CONTAINER ── */}
        <div style={{ width: "100%", maxWidth: 900, perspective: "1200px", perspectiveOrigin: "50% 0%" }}>
          <div ref={cardRef}
            style={{
              width: "100%",
              transform: `rotateX(${tilt}deg) scale(${clampedScale})`,
              transformOrigin: "top center",
              transformStyle: "preserve-3d",
              transition: "transform 0.05s linear",
              borderRadius: 6,
              overflow: "hidden",
              border: `1px solid ${g(0.2)}`,
              boxShadow: `0 ${40 + tilt * 2}px ${80 + tilt * 4}px rgba(0,0,0,0.7), 0 0 0 1px ${g(0.1)}, inset 0 1px 0 ${g(0.15)}`,
            }}>

            {/* Mock browser chrome */}
            <div style={{ background: "#111215", padding: "10px 14px", borderBottom: `1px solid ${g(0.1)}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", gap: 5 }}>
                {["#e05c5c", "#d4a72c", "#4aab7a"].map((c, i) => <div key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: 0.7 }} />)}
              </div>
              <div style={{ flex: 1, margin: "0 12px", padding: "4px 12px", background: g(0.05), borderRadius: 3, border: `1px solid ${g(0.1)}`, fontFamily: MONO, fontSize: 9, color: C.textDim, letterSpacing: "0.04em", textAlign: "center" }}>
                vault.rutledge.app
              </div>
            </div>

            {/* Mock app UI */}
            <div style={{ background: C.bg, padding: "24px 28px" }}>
              {/* Mock header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, paddingBottom: 16, borderBottom: `1px solid ${g(0.08)}` }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 7, color: C.textDim, letterSpacing: "0.12em", marginBottom: 4 }}>PORTFOLIO · APRIL 2026</div>
                  <div style={{ fontFamily: SERIF, fontSize: 36, color: C.text, letterSpacing: "-0.03em", lineHeight: 1 }}>$124,800</div>
                </div>
                <div style={{ display: "flex", gap: 20 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: MONO, fontSize: 7, color: C.textDim, letterSpacing: "0.1em", marginBottom: 3 }}>COST BASIS</div>
                    <div style={{ fontFamily: SERIF, fontSize: 20, color: C.textMid }}>$98,200</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: MONO, fontSize: 7, color: C.textDim, letterSpacing: "0.1em", marginBottom: 3 }}>P&L</div>
                    <div style={{ fontFamily: SERIF, fontSize: 20, color: C.green }}>+$26,600</div>
                  </div>
                </div>
              </div>

              {/* Mock portfolio rows */}
              {[
                { brand: "ROLEX", name: "Daytona 116500LN", cond: "Excellent", market: "$28,400", val: "$28,400", pnl: "+$6,400", pos: true },
                { brand: "HERMÈS", name: "Birkin 25 Togo Noir", cond: "New / Unworn", market: "$38,200", val: "$43,930", pnl: "+$13,930", pos: true },
                { brand: "CHANEL", name: "Classic Flap Medium", cond: "Very Good", market: "$9,800", val: "$8,624", pnl: "-$1,376", pos: false },
                { brand: "AUDEMARS PIGUET", name: "Royal Oak 15500ST", cond: "Excellent", market: "$44,400", val: "$44,400", pnl: "+$8,400", pos: true },
              ].map((row, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 80px", gap: 12, padding: "11px 0", borderBottom: `1px solid ${g(0.05)}`, alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 7, color: C.gold, letterSpacing: "0.1em", marginBottom: 2 }}>{row.brand}</div>
                    <div style={{ fontFamily: SERIF, fontSize: 12, color: C.text }}>{row.name}</div>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 8, color: C.textMid }}>{row.cond}</div>
                  <div style={{ fontFamily: SERIF, fontSize: 12, color: C.textMid, textAlign: "right" }}>{row.market}</div>
                  <div style={{ fontFamily: SERIF, fontSize: 12, color: C.text, textAlign: "right" }}>{row.val}</div>
                  <div style={{ fontFamily: SERIF, fontSize: 12, color: row.pos ? C.green : C.red, textAlign: "right" }}>{row.pnl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scroll prompt */}
        <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, animation: "fadeUpDown 2s ease-in-out infinite" }}>
          <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.12em" }}>SCROLL</div>
          <svg width="12" height="16" viewBox="0 0 12 16" fill="none"><path d="M6 1v12M1 9l5 5 5-5" stroke={C.textDim} strokeWidth="1" strokeLinecap="round"/></svg>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ padding: "100px 40px", position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.gold, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 16 }}>How It Works</div>
            <div style={{ fontFamily: SERIF, fontSize: "clamp(28px, 4vw, 44px)", color: C.text, fontWeight: 300, lineHeight: 1.2 }}>Market intelligence for serious collectors</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 2, background: g(0.06), border: `1px solid ${g(0.1)}` }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ padding: "36px 32px", background: C.bg, borderRight: i < FEATURES.length - 1 ? `1px solid ${g(0.08)}` : "none" }}>
                <div style={{ fontFamily: SERIF, fontSize: 48, color: C.gold, letterSpacing: "-0.03em", lineHeight: 1, marginBottom: 12 }}>{f.stat}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMid, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>{f.label}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, lineHeight: 1.7, letterSpacing: "0.03em" }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BRAND TICKER ── */}
      <section style={{ padding: "0 0 80px", overflow: "hidden", position: "relative", zIndex: 1 }}>
        <div style={{ fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.16em", textTransform: "uppercase", textAlign: "center", marginBottom: 24 }}>Tracked across top brands</div>
        <div style={{ display: "flex", gap: 0, animation: "ticker 30s linear infinite", width: "max-content" }}>
          {[...BRANDS, ...BRANDS].map((b, i) => (
            <div key={i} style={{ padding: "8px 28px", fontFamily: SERIF, fontSize: 16, color: i % 3 === 0 ? C.gold : C.textDim, whiteSpace: "nowrap", borderRight: `1px solid ${g(0.1)}`, letterSpacing: "0.06em" }}>
              {b}
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ padding: "80px 40px 120px", textAlign: "center", position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          {/* Large V mark */}
          <svg width="56" height="56" viewBox="0 0 20 20" fill="none" style={{ margin: "0 auto 32px", display: "block" }}>
            <rect x="1" y="1" width="18" height="18" stroke={C.gold} strokeWidth="0.8" fill="none"/>
            <rect x="4.5" y="4.5" width="11" height="11" fill={C.gold} opacity="0.12"/>
            <text x="10" y="14" textAnchor="middle" fill={C.gold} fontSize="9" fontFamily="Georgia,serif">V</text>
          </svg>
          <div style={{ fontFamily: SERIF, fontSize: "clamp(28px, 4vw, 48px)", color: C.text, fontWeight: 300, lineHeight: 1.2, marginBottom: 20 }}>
            Your collection deserves<br />better intelligence
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMid, letterSpacing: "0.06em", lineHeight: 1.8, marginBottom: 44 }}>
            Free to use. No credit card. Your portfolio stays private.
          </div>
          <button onClick={onEnter}
            style={{ padding: "16px 48px", background: C.gold, border: "none", borderRadius: 2, color: C.bg, cursor: "pointer", fontFamily: MONO, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 500, transition: "opacity 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
            Enter Vault
          </button>
          <div style={{ marginTop: 16, fontFamily: MONO, fontSize: 8, color: C.textDim, letterSpacing: "0.08em" }}>
            8 platforms · Live data · Portfolio tracking
          </div>
        </div>
      </section>

      <style>{`
        @keyframes ticker {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes fadeUpDown {
          0%, 100% { opacity: 0.4; transform: translateX(-50%) translateY(0); }
          50% { opacity: 1; transform: translateX(-50%) translateY(6px); }
        }
      `}</style>
    </div>
  );
}

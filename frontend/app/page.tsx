import Link from "next/link";

const TICKER_DATA = [
  { ticker: "AAPL",  price: "255.76", change: "+1.24%", action: "BUY" },
  { ticker: "NVDA",  price: "882.50", change: "+2.31%", action: "HOLD" },
  { ticker: "MSFT",  price: "412.30", change: "-0.45%", action: "SELL" },
  { ticker: "TSLA",  price: "248.50", change: "+3.12%", action: "BUY" },
  { ticker: "META",  price: "612.80", change: "+0.87%", action: "HOLD" },
  { ticker: "AMZN",  price: "198.40", change: "+1.56%", action: "BUY" },
  { ticker: "GOOGL", price: "175.20", change: "-0.23%", action: "HOLD" },
  { ticker: "SPY",   price: "556.40", change: "+0.34%", action: "BUY" },
];

const MODES = [
  {
    id: "advisory",
    label: "Advisory",
    tier: "Free",
    desc: "AI analyses the market and generates signals. You decide when and whether to act.",
    accent: "#7A8FA0",
    border: "1px solid #1C2B3A",
  },
  {
    id: "conditional",
    label: "Conditional",
    tier: "Pro",
    desc: "AI proposes a trade with full reasoning. One tap to approve — your explicit consent required.",
    accent: "#F5A623",
    border: "1px solid rgba(245,166,35,0.3)",
  },
  {
    id: "autonomous",
    label: "Autonomous",
    tier: "Premium",
    desc: "AI executes automatically within your risk limits. Override window before settlement.",
    accent: "#00C896",
    border: "1px solid rgba(0,200,150,0.3)",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col overflow-hidden" style={{ background: "#07080B" }}>

      {/* Grid texture */}
      <div className="fixed inset-0 grid-texture pointer-events-none" style={{ opacity: 0.35 }} />

      {/* Red ambient orb — top right */}
      <div
        className="fixed pointer-events-none"
        style={{
          top: "-15%", right: "-8%",
          width: 700, height: 700,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(200,16,46,0.1) 0%, transparent 65%)",
        }}
      />

      {/* ── Nav ── */}
      <nav
        className="relative z-10 flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid #1C2B3A" }}
      >
        {/* Logomark */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center" style={{ width: 28, height: 28 }}>
            <div
              className="absolute"
              style={{
                width: 3, height: 22,
                background: "#C8102E",
                transform: "skewX(-14deg) translateX(3px)",
                borderRadius: 1,
              }}
            />
            <div
              className="relative z-10"
              style={{ width: 8, height: 8, borderRadius: "50%", background: "#C8102E", marginLeft: 4 }}
            />
          </div>
          <span
            className="font-display text-xl font-bold tracking-tight"
            style={{ color: "#E8EDF3", letterSpacing: "-0.02em" }}
          >
            ATLAS
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="text-sm px-3 py-1.5 transition-colors"
            style={{ color: "#7A8FA0", fontFamily: "var(--font-nunito)" }}
          >
            Admin
          </Link>
          <Link
            href="/dashboard"
            className="text-sm font-semibold px-4 py-1.5 rounded transition-all"
            style={{
              background: "#C8102E",
              color: "#fff",
              fontFamily: "var(--font-nunito)",
            }}
          >
            Launch App
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">

        {/* Status badge */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-10 text-xs fade-up"
          style={{
            background: "#111820",
            border: "1px solid #1C2B3A",
            color: "#7A8FA0",
            fontFamily: "var(--font-jb)",
            animationDelay: "0s",
          }}
        >
          <span className="live-dot" />
          <span>Paper trading active · Gemini 2.5 Flash · US Equities</span>
        </div>

        {/* Main heading */}
        <h1
          className="font-display font-bold leading-none tracking-tight fade-up"
          style={{
            fontSize: "clamp(4rem, 13vw, 9rem)",
            color: "#E8EDF3",
            letterSpacing: "-0.04em",
            animationDelay: "0.08s",
          }}
        >
          ATLAS
        </h1>

        {/* Divider with brand dot */}
        <div className="relative flex items-center justify-center w-full max-w-2xl my-6 fade-up" style={{ animationDelay: "0.15s" }}>
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, transparent, #C8102E)" }} />
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C8102E", margin: "0 12px", flexShrink: 0 }} />
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to left, transparent, #C8102E)" }} />
        </div>

        <p
          className="text-lg max-w-md leading-relaxed mb-10 fade-up"
          style={{ color: "#7A8FA0", fontFamily: "var(--font-nunito)", animationDelay: "0.2s" }}
        >
          Multi-agent AI that analyses markets, explains its reasoning, and trades with only as much autonomy as you allow.
        </p>

        {/* Live signal card */}
        <div
          className="w-full max-w-xs text-left mb-10 fade-up signal-glow-bull"
          style={{
            background: "#111820",
            border: "1px solid rgba(0,200,150,0.3)",
            borderRadius: 12,
            padding: "16px 20px",
            animationDelay: "0.28s",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2" style={{ color: "#3D5060", fontFamily: "var(--font-jb)", fontSize: 11 }}>
              <span className="live-dot-red" />
              LIVE SIGNAL
            </div>
            <span style={{ color: "#3D5060", fontFamily: "var(--font-jb)", fontSize: 11 }}>2s ago</span>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <div className="font-display font-bold" style={{ fontSize: 28, color: "#E8EDF3", letterSpacing: "-0.02em" }}>AAPL</div>
              <div style={{ color: "#3D5060", fontFamily: "var(--font-jb)", fontSize: 11, marginTop: 2 }}>Apple Inc.</div>
            </div>
            <div className="text-right">
              <div className="font-display font-bold" style={{ fontSize: 28, color: "#00C896" }}>BUY</div>
              <div style={{ color: "#3D5060", fontFamily: "var(--font-jb)", fontSize: 11, marginTop: 2 }}>78% confidence</div>
            </div>
          </div>

          <div
            className="mt-3 pt-3 text-xs leading-relaxed"
            style={{
              borderTop: "1px solid #1C2B3A",
              color: "#7A8FA0",
              fontFamily: "var(--font-nunito)",
            }}
          >
            Strong RSI divergence on weekly · Earnings beat · Volume confirms breakout
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs fade-up" style={{ animationDelay: "0.35s" }}>
          <Link
            href="/dashboard"
            className="flex-1 text-center font-semibold py-3 px-6 rounded transition-all"
            style={{
              background: "#C8102E",
              color: "#fff",
              fontFamily: "var(--font-nunito)",
              fontSize: 15,
            }}
          >
            Start Trading
          </Link>
          <Link
            href="/admin"
            className="flex-1 text-center font-semibold py-3 px-6 rounded transition-colors"
            style={{
              border: "1px solid #1C2B3A",
              color: "#7A8FA0",
              fontFamily: "var(--font-nunito)",
              fontSize: 15,
            }}
          >
            Admin Panel
          </Link>
        </div>
      </main>

      {/* ── Execution Modes ── */}
      <section
        className="relative z-10 px-6 py-14"
        style={{ borderTop: "1px solid #1C2B3A", background: "#0C1016" }}
      >
        <div className="max-w-4xl mx-auto">
          <p
            className="text-center text-xs tracking-widest uppercase mb-8"
            style={{ color: "#3D5060", fontFamily: "var(--font-jb)" }}
          >
            Execution Boundary
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {MODES.map((m) => (
              <div
                key={m.id}
                style={{ background: "#111820", border: m.border, borderRadius: 10, padding: "20px 20px 18px" }}
              >
                <div className="flex items-center justify-between mb-4">
                  <span
                    className="font-display font-bold text-sm"
                    style={{ color: m.accent }}
                  >
                    {m.label}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-jb)",
                      color: "#3D5060",
                      border: "1px solid #1C2B3A",
                      padding: "2px 8px",
                      borderRadius: 4,
                    }}
                  >
                    {m.tier}
                  </span>
                </div>
                <p style={{ color: "#7A8FA0", fontSize: 13, fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
                  {m.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Ticker tape ── */}
      <div
        className="relative z-10 overflow-hidden py-3"
        style={{ borderTop: "1px solid #1C2B3A", background: "#07080B" }}
      >
        <div className="ticker-tape">
          {[...TICKER_DATA, ...TICKER_DATA].map((item, i) => (
            <div key={i} className="inline-flex items-center gap-3 px-5" style={{ fontFamily: "var(--font-jb)", fontSize: 12 }}>
              <span style={{ color: "#E8EDF3", fontWeight: 600 }}>{item.ticker}</span>
              <span style={{ color: "#7A8FA0" }}>{item.price}</span>
              <span style={{ color: item.change.startsWith("+") ? "#00C896" : "#FF2D55" }}>{item.change}</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: item.action === "BUY"
                    ? "rgba(0,200,150,0.15)"
                    : item.action === "SELL"
                    ? "rgba(255,45,85,0.15)"
                    : "rgba(245,166,35,0.15)",
                  color: item.action === "BUY" ? "#00C896" : item.action === "SELL" ? "#FF2D55" : "#F5A623",
                }}
              >
                {item.action}
              </span>
              <span style={{ color: "#1C2B3A", margin: "0 6px" }}>·</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

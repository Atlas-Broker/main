import Link from "next/link";

// ─── Data ─────────────────────────────────────────────────────────────────────

const LIVE_SIGNALS = [
  {
    ticker: "NVDA",
    name: "NVIDIA Corp.",
    action: "BUY" as const,
    conf: 94,
    delta: "+2.31%",
    reason: "Breakout on weekly · earnings catalyst · volume surge",
  },
  {
    ticker: "AAPL",
    name: "Apple Inc.",
    action: "BUY" as const,
    conf: 78,
    delta: "+1.24%",
    reason: "RSI divergence · support holds · analyst upgrade",
  },
  {
    ticker: "META",
    name: "Meta Platforms",
    action: "SELL" as const,
    conf: 83,
    delta: "−0.87%",
    reason: "Overbought RSI · insider distribution · resistance",
  },
];

const PROOF = [
  { value: "8",    unit: "",    label: "AI agents",       sub: "run in parallel"       },
  { value: "47",   unit: "ms",  label: "avg latency",     sub: "signal to execution"   },
  { value: "3",    unit: "",    label: "control modes",   sub: "advisory → autonomous" },
  { value: "100%", unit: "",    label: "transparent",     sub: "full reasoning shown"  },
];

const MODES = [
  {
    id: "advisory",
    icon: "○",
    label: "Advisory",
    tier: "Free",
    highlight: false,
    desc: "Atlas generates and explains every signal. You decide if and when to act. Zero commitment required.",
    cta: "Start for free",
  },
  {
    id: "conditional",
    icon: "◑",
    label: "Conditional",
    tier: "Pro",
    highlight: true,
    desc: "Atlas proposes a trade with full AI reasoning. One tap to approve — your explicit consent on every order.",
    cta: "Most popular",
  },
  {
    id: "autonomous",
    icon: "●",
    label: "Autonomous",
    tier: "Premium",
    highlight: false,
    desc: "Atlas executes automatically within your risk parameters. A 5-minute override window before settlement.",
    cta: "Maximum performance",
  },
];

const TICKER_DATA = [
  { ticker: "AAPL",  price: "255.76", change: "+1.24%", action: "BUY"  },
  { ticker: "NVDA",  price: "882.50", change: "+2.31%", action: "BUY"  },
  { ticker: "MSFT",  price: "412.30", change: "−0.45%", action: "SELL" },
  { ticker: "TSLA",  price: "248.50", change: "+3.12%", action: "BUY"  },
  { ticker: "META",  price: "612.80", change: "+0.87%", action: "HOLD" },
  { ticker: "AMZN",  price: "198.40", change: "+1.56%", action: "BUY"  },
  { ticker: "GOOGL", price: "175.20", change: "−0.23%", action: "HOLD" },
  { ticker: "SPY",   price: "556.40", change: "+0.34%", action: "BUY"  },
];

const ACTION_COLOR: Record<string, string> = {
  BUY:  "var(--bull)",
  SELL: "var(--bear)",
  HOLD: "var(--hold)",
};
const ACTION_BG: Record<string, string> = {
  BUY:  "var(--bull-bg)",
  SELL: "var(--bear-bg)",
  HOLD: "var(--hold-bg)",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      <style>{`
        @keyframes lp-fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes lp-slide-right {
          from { opacity: 0; transform: translateX(-16px); }
          to   { opacity: 1; transform: translateX(0);     }
        }
        @keyframes lp-panel-in {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes lp-ticker {
          from { transform: translateX(0);    }
          to   { transform: translateX(-50%); }
        }
        @keyframes lp-pulse {
          0%, 100% { opacity: 1; transform: scale(1);    }
          50%       { opacity: 0.45; transform: scale(0.8); }
        }
        @keyframes lp-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }

        .lp-fade   { animation: lp-fade-up    0.55s ease both; }
        .lp-slide  { animation: lp-slide-right 0.45s ease both; }
        .lp-panel  { animation: lp-panel-in   0.6s  ease both; }
        .lp-live   { animation: lp-pulse      2s ease-in-out infinite; }

        .lp-cta-primary {
          display: inline-flex; align-items: center; gap: 8px;
          background: var(--brand); color: #fff;
          padding: 12px 28px; border-radius: 4px;
          font-family: var(--font-nunito); font-weight: 700; font-size: 15px;
          text-decoration: none; transition: opacity 0.18s ease, transform 0.18s ease;
          letter-spacing: 0.01em;
        }
        .lp-cta-primary:hover  { opacity: 0.88; transform: translateY(-1px); }
        .lp-cta-primary:active { opacity: 1;    transform: translateY(0);    }

        .lp-cta-ghost {
          display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: var(--dim);
          padding: 12px 24px; border-radius: 4px;
          font-family: var(--font-nunito); font-weight: 600; font-size: 15px;
          border: 1px solid var(--line); text-decoration: none;
          transition: border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
        }
        .lp-cta-ghost:hover  { border-color: var(--line2); color: var(--ink); transform: translateY(-1px); }
        .lp-cta-ghost:active { transform: translateY(0); }

        .lp-mode-card {
          background: var(--surface); border: 1px solid var(--line);
          border-radius: 10px; padding: 28px 24px 24px;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
          cursor: default;
        }
        .lp-mode-card:hover {
          border-color: var(--line2);
          box-shadow: 0 4px 24px rgba(0,0,0,0.06);
          transform: translateY(-2px);
        }
        .lp-mode-card.featured {
          border-color: var(--brand);
          box-shadow: 0 0 0 1px var(--brand), 0 4px 20px rgba(200,16,46,0.08);
        }
        .lp-mode-card.featured:hover {
          box-shadow: 0 0 0 1px var(--brand), 0 8px 32px rgba(200,16,46,0.12);
          transform: translateY(-2px);
        }

        .lp-signal-row {
          padding: 11px 0;
          border-bottom: 1px solid var(--line);
          display: grid;
          grid-template-columns: 52px 44px 1fr 52px;
          gap: 0 12px;
          align-items: center;
          transition: background 0.15s ease;
        }
        .lp-signal-row:last-child { border-bottom: none; }

        .lp-nav-link {
          font-family: var(--font-nunito); font-size: 14px; font-weight: 600;
          color: var(--dim); text-decoration: none; padding: 6px 12px;
          border-radius: 4px; transition: color 0.15s ease, background 0.15s ease;
        }
        .lp-nav-link:hover { color: var(--ink); background: var(--elevated); }

        .lp-ticker-wrap { overflow: hidden; }
        .lp-ticker-inner {
          display: flex; white-space: nowrap;
          animation: lp-ticker 40s linear infinite;
        }
        .lp-ticker-inner:hover { animation-play-state: paused; }

        .lp-proof-card {
          background: var(--surface); border: 1px solid var(--line);
          border-radius: 10px; padding: 24px 20px;
          transition: border-color 0.18s, transform 0.18s;
        }
        .lp-proof-card:hover { border-color: var(--line2); transform: translateY(-2px); }

        .lp-feat-card {
          background: var(--surface); border: 1px solid var(--line);
          border-radius: 10px; padding: 28px 24px;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .lp-feat-card:hover {
          border-color: var(--line2);
          box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        }

        @media (max-width: 900px) {
          .lp-hero-right { display: none !important; }
          .lp-hero-left  { flex: 1 !important; max-width: 100% !important; }
          .lp-nav-links  { display: none !important; }
        }
      `}</style>

      <div style={{ background: "var(--bg)", minHeight: "100vh", color: "var(--ink)" }}>

        {/* ── Nav ──────────────────────────────────────────────────────── */}
        <nav style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "var(--nav-bg)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--line)",
          padding: "0 32px", height: 56,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 3, height: 20, background: "var(--brand)",
              transform: "skewX(-14deg)", borderRadius: 1, flexShrink: 0,
            }} />
            <span style={{
              fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800,
              color: "var(--ink)", letterSpacing: "-0.02em",
            }}>ATLAS</span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ghost)",
              letterSpacing: "0.18em", marginLeft: 4,
            }}>AI PORTFOLIO</span>
          </div>

          {/* Nav links */}
          <div className="lp-nav-links" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <a href="#modes"    className="lp-nav-link">How it works</a>
            <a href="#features" className="lp-nav-link">Features</a>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/login" className="lp-cta-ghost" style={{ padding: "7px 18px", fontSize: 14 }}>
              Sign in
            </Link>
            <Link href="/login" className="lp-cta-primary" style={{ padding: "7px 18px", fontSize: 14 }}>
              Get started →
            </Link>
          </div>
        </nav>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section style={{
          maxWidth: 1200, margin: "0 auto",
          padding: "80px 32px 72px",
          display: "flex", gap: 64, alignItems: "flex-start",
        }}>

          {/* Left */}
          <div className="lp-hero-left" style={{ flex: "0 0 52%", maxWidth: "52%" }}>

            {/* Status badge */}
            <div
              className="lp-fade"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "6px 12px 6px 8px", borderRadius: 100,
                background: "var(--surface)", border: "1px solid var(--line)",
                fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dim)",
                letterSpacing: "0.12em", marginBottom: 32,
                animationDelay: "0s",
              }}
            >
              <span className="lp-live" style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "var(--bull)", display: "inline-block", flexShrink: 0,
              }} />
              LIVE · PAPER TRADING ACTIVE · US EQUITIES
            </div>

            {/* Headline */}
            <h1
              className="lp-fade"
              style={{
                fontFamily: "var(--font-display)", fontWeight: 800,
                fontSize: "clamp(2.8rem, 6vw, 4.8rem)",
                lineHeight: 1.05, letterSpacing: "-0.035em",
                color: "var(--ink)", marginBottom: 8,
                animationDelay: "0.07s",
              }}
            >
              Your portfolio
            </h1>
            <h1
              className="lp-fade"
              style={{
                fontFamily: "var(--font-display)", fontWeight: 800,
                fontSize: "clamp(2.8rem, 6vw, 4.8rem)",
                lineHeight: 1.05, letterSpacing: "-0.035em",
                color: "var(--brand)", marginBottom: 24,
                animationDelay: "0.12s",
              }}
            >
              deserves an edge.
            </h1>

            {/* Sub */}
            <p
              className="lp-fade"
              style={{
                fontFamily: "var(--font-body)", fontSize: 17, lineHeight: 1.7,
                color: "var(--dim)", maxWidth: 460, marginBottom: 36,
                animationDelay: "0.2s",
              }}
            >
              Eight AI agents analyze every trade simultaneously — technical,
              fundamental, and sentiment. Atlas explains its reasoning, then
              executes only as much as you allow.
            </p>

            {/* CTAs */}
            <div className="lp-fade" style={{ display: "flex", gap: 12, flexWrap: "wrap", animationDelay: "0.27s" }}>
              <Link href="/login" className="lp-cta-primary">
                Join the waitlist →
              </Link>
              <Link href="/login" className="lp-cta-ghost">
                Sign in
              </Link>
            </div>

            {/* Proof strip */}
            <div
              className="lp-fade"
              style={{
                display: "grid", gridTemplateColumns: "1fr 1fr",
                gap: 1, marginTop: 48,
                border: "1px solid var(--line)", borderRadius: 10,
                overflow: "hidden", background: "var(--line)",
                animationDelay: "0.34s",
              }}
            >
              {PROOF.map((p) => (
                <div key={p.label} style={{
                  background: "var(--surface)", padding: "18px 20px",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 600,
                      color: "var(--ink)", letterSpacing: "-0.02em",
                    }}>{p.value}</span>
                    {p.unit && (
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 13,
                        color: "var(--dim)", marginLeft: 2,
                      }}>{p.unit}</span>
                    )}
                  </div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--dim)", marginTop: 2 }}>
                    {p.label}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ghost)", letterSpacing: "0.08em", marginTop: 2 }}>
                    {p.sub}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Signal Feed */}
          <div
            className="lp-hero-right lp-panel"
            style={{
              flex: 1,
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "var(--card-shadow)",
              animationDelay: "0.15s",
            }}
          >
            {/* Feed header */}
            <div style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--line)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "var(--elevated)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="lp-live" style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: "var(--bull)", display: "inline-block",
                }} />
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: "var(--dim)", letterSpacing: "0.14em",
                }}>LIVE SIGNAL FEED</span>
              </div>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 10,
                color: "var(--ghost)", letterSpacing: "0.1em",
              }}>Gemini 2.5 Flash</span>
            </div>

            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "52px 44px 1fr 52px",
              gap: "0 12px",
              padding: "10px 20px 8px",
              borderBottom: "1px solid var(--line)",
              fontFamily: "var(--font-mono)", fontSize: 9,
              color: "var(--ghost)", letterSpacing: "0.16em",
            }}>
              <span>TICKER</span>
              <span>SIG</span>
              <span>CONFIDENCE</span>
              <span style={{ textAlign: "right" }}>Δ DAY</span>
            </div>

            {/* Signal rows */}
            <div style={{ padding: "0 20px" }}>
              {LIVE_SIGNALS.map((s) => (
                <div key={s.ticker} className="lp-signal-row">
                  <div>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600,
                      color: "var(--ink)",
                    }}>{s.ticker}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ghost)", marginTop: 1 }}>
                      {s.name}
                    </div>
                  </div>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: ACTION_COLOR[s.action],
                    background: ACTION_BG[s.action],
                    padding: "3px 6px", borderRadius: 3,
                  }}>{s.action}</span>
                  <div>
                    <div style={{ height: 3, background: "var(--line)", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{
                        height: "100%", width: `${s.conf}%`,
                        background: ACTION_COLOR[s.action],
                        borderRadius: 2, opacity: 0.8,
                      }} />
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ghost)" }}>
                      {s.conf}% · {s.reason}
                    </div>
                  </div>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
                    color: s.delta.startsWith("+") ? "var(--bull)" : "var(--bear)",
                    textAlign: "right",
                  }}>{s.delta}</div>
                </div>
              ))}
            </div>

            {/* Feed footer */}
            <div style={{
              padding: "14px 20px",
              borderTop: "1px solid var(--line)",
              background: "var(--elevated)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ghost)", letterSpacing: "0.1em" }}>
                3 signals · updated 2s ago
              </span>
              <Link href="/login" style={{
                fontFamily: "var(--font-mono)", fontSize: 10,
                color: "var(--brand)", letterSpacing: "0.1em",
                textDecoration: "none", fontWeight: 600,
              }}>
                VIEW ALL →
              </Link>
            </div>

            {/* Mini execution mode indicator */}
            <div style={{ padding: "16px 20px", borderTop: "1px solid var(--line)" }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 9,
                color: "var(--ghost)", letterSpacing: "0.14em", marginBottom: 10,
              }}>EXECUTION MODE</div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["Advisory", "Conditional", "Autonomous"] as const).map((m, i) => (
                  <div key={m} style={{
                    flex: 1, padding: "7px 10px", borderRadius: 4, textAlign: "center",
                    fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em",
                    border: i === 1 ? "1px solid var(--brand)" : "1px solid var(--line)",
                    color: i === 1 ? "var(--brand)" : "var(--ghost)",
                    background: i === 1 ? "rgba(200,16,46,0.04)" : "transparent",
                    fontWeight: i === 1 ? 700 : 400,
                  }}>{m}</div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Execution Modes ──────────────────────────────────────────── */}
        <section
          id="modes"
          style={{
            background: "var(--deep)",
            borderTop: "1px solid var(--line)",
            borderBottom: "1px solid var(--line)",
            padding: "72px 32px",
          }}
        >
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ maxWidth: 540, marginBottom: 48 }}>
              <p style={{
                fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ghost)",
                letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 14,
              }}>Execution boundary</p>
              <h2 style={{
                fontFamily: "var(--font-display)", fontWeight: 800,
                fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                letterSpacing: "-0.03em", color: "var(--ink)",
                lineHeight: 1.15, marginBottom: 16,
              }}>
                Your rules. Your autonomy.
              </h2>
              <p style={{
                fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.7,
                color: "var(--dim)",
              }}>
                Atlas never takes more action than you allow. Start fully hands-on
                and increase autonomy as you build confidence in the system.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {MODES.map((m) => (
                <div key={m.id} className={`lp-mode-card${m.highlight ? " featured" : ""}`}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 18,
                        color: m.highlight ? "var(--brand)" : "var(--ghost)",
                      }}>{m.icon}</span>
                      <span style={{
                        fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 17,
                        color: m.highlight ? "var(--brand)" : "var(--ink)",
                        letterSpacing: "-0.01em",
                      }}>{m.label}</span>
                    </div>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em",
                      color: m.highlight ? "var(--brand)" : "var(--ghost)",
                      border: `1px solid ${m.highlight ? "var(--brand)" : "var(--line)"}`,
                      padding: "3px 8px", borderRadius: 4,
                      background: m.highlight ? "rgba(200,16,46,0.05)" : "transparent",
                    }}>{m.tier}</span>
                  </div>
                  <p style={{
                    fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.7,
                    color: "var(--dim)", marginBottom: 20,
                  }}>{m.desc}</p>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em",
                    color: m.highlight ? "var(--brand)" : "var(--ghost)",
                    textTransform: "uppercase",
                  }}>{m.cta}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <section
          id="features"
          style={{ padding: "72px 32px", background: "var(--bg)" }}
        >
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ maxWidth: 440, marginBottom: 48 }}>
              <p style={{
                fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ghost)",
                letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 14,
              }}>Why Atlas</p>
              <h2 style={{
                fontFamily: "var(--font-display)", fontWeight: 800,
                fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                letterSpacing: "-0.03em", color: "var(--ink)", lineHeight: 1.15,
              }}>
                Institutional intelligence.<br />Retail simplicity.
              </h2>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {[
                {
                  num: "01",
                  heading: "Multi-agent analysis",
                  body: "Technical, fundamental, and sentiment agents run simultaneously. A synthesis agent resolves conflicts before the signal reaches you.",
                },
                {
                  num: "02",
                  heading: "Full reasoning transparency",
                  body: "Every signal includes the full chain of thought — what data was analyzed, what was overruled, and exactly why the AI reached its conclusion.",
                },
                {
                  num: "03",
                  heading: "Configurable risk limits",
                  body: "Set position sizes, sector exposure limits, and daily loss thresholds. Atlas enforces them automatically on every single order.",
                },
              ].map((f) => (
                <div key={f.num} className="lp-feat-card">
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--brand)",
                    letterSpacing: "0.12em", marginBottom: 16,
                  }}>{f.num}</div>
                  <h3 style={{
                    fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17,
                    color: "var(--ink)", letterSpacing: "-0.01em", marginBottom: 12,
                  }}>{f.heading}</h3>
                  <p style={{
                    fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.7,
                    color: "var(--dim)",
                  }}>{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA Banner ───────────────────────────────────────────────── */}
        <section style={{
          background: "var(--ink)",
          padding: "64px 32px",
          borderTop: "1px solid var(--line)",
        }}>
          <div style={{
            maxWidth: 640, margin: "0 auto", textAlign: "center",
          }}>
            <h2 style={{
              fontFamily: "var(--font-display)", fontWeight: 800,
              fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
              letterSpacing: "-0.03em", lineHeight: 1.15,
              color: "#E8EDF3", marginBottom: 16,
            }}>
              Stop leaving returns on the table.
            </h2>
            <p style={{
              fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.7,
              color: "#7A8FA0", marginBottom: 36,
            }}>
              Join the waitlist for early access. Paper trading is free — no
              commitment, no card required.
            </p>
            <Link href="/login" className="lp-cta-primary" style={{ fontSize: 16, padding: "14px 36px" }}>
              Get early access →
            </Link>
            <p style={{
              fontFamily: "var(--font-mono)", fontSize: 10, color: "#3D5060",
              letterSpacing: "0.12em", marginTop: 20,
            }}>
              ADVISORY · CONDITIONAL · AUTONOMOUS
            </p>
          </div>
        </section>

        {/* ── Ticker tape ──────────────────────────────────────────────── */}
        <div style={{
          borderTop: "1px solid var(--line)",
          background: "var(--deep)", padding: "10px 0",
        }}>
          <div className="lp-ticker-wrap">
            <div className="lp-ticker-inner">
              {[...TICKER_DATA, ...TICKER_DATA, ...TICKER_DATA].map((item, i) => (
                <div key={i} style={{
                  display: "inline-flex", alignItems: "center", gap: 10, padding: "0 20px",
                  fontFamily: "var(--font-mono)", fontSize: 12,
                }}>
                  <span style={{ color: "var(--ink)", fontWeight: 600 }}>{item.ticker}</span>
                  <span style={{ color: "var(--dim)" }}>{item.price}</span>
                  <span style={{ color: item.change.startsWith("+") ? "var(--bull)" : "var(--bear)" }}>
                    {item.change}
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 700,
                    padding: "2px 6px", borderRadius: 3,
                    background: ACTION_BG[item.action],
                    color: ACTION_COLOR[item.action],
                  }}>{item.action}</span>
                  <span style={{ color: "var(--line2)", margin: "0 4px" }}>·</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer style={{
          borderTop: "1px solid var(--line)",
          background: "var(--bg)",
          padding: "24px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 2, height: 16, background: "var(--brand)",
              transform: "skewX(-14deg)", borderRadius: 1,
            }} />
            <span style={{
              fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 800,
              color: "var(--dim)", letterSpacing: "-0.02em",
            }}>ATLAS</span>
          </div>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ghost)",
            letterSpacing: "0.12em",
          }}>
            POWERED BY GEMINI 2.5 FLASH · ALPACA PAPER TRADING
          </span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ghost)",
            letterSpacing: "0.1em",
          }}>v0.1.0</span>
        </footer>

      </div>
    </>
  );
}

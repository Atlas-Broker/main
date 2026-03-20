"use client";

import { useState } from "react";
import Link from "next/link";

// ─── Token data ───────────────────────────────────────────────────────────────

const BRAND_COLORS = [
  { name: "Brand",   hex: "#C8102E", role: "Primary CTA, logo, key accents. Used sparingly." },
  { name: "Signal",  hex: "#E8001D", role: "High-urgency alerts. Almost never for decoration."  },
];

const SEMANTIC = [
  { name: "Bull (light)",  hex: "#00A876", role: "BUY, positive P&L (light mode)"  },
  { name: "Bull (dark)",   hex: "#00C896", role: "BUY, positive P&L (dark mode)"   },
  { name: "Bear (light)",  hex: "#D92040", role: "SELL, losses (light mode)"        },
  { name: "Bear (dark)",   hex: "#FF2D55", role: "SELL, losses (dark mode)"         },
  { name: "Hold (light)",  hex: "#D97B00", role: "HOLD, neutral (light mode)"       },
  { name: "Hold (dark)",   hex: "#F5A623", role: "HOLD, neutral (dark mode)"        },
];

const NEUTRAL_LIGHT = [
  { token: "--bg",       hex: "#F4F6F9", label: "Page background"     },
  { token: "--deep",     hex: "#EDF0F4", label: "Section alternates"  },
  { token: "--surface",  hex: "#FFFFFF", label: "Cards, inputs"        },
  { token: "--elevated", hex: "#F0F2F6", label: "Raised elements"     },
  { token: "--line",     hex: "#E0E6ED", label: "Borders / dividers"  },
  { token: "--line2",    hex: "#C8D4DF", label: "Hover borders"       },
  { token: "--ink",      hex: "#0D1117", label: "Primary text"        },
  { token: "--dim",      hex: "#46606E", label: "Secondary text"      },
  { token: "--ghost",    hex: "#8DA4B2", label: "Placeholder text"    },
];

const NEUTRAL_DARK = [
  { token: "--bg",       hex: "#0A0E1A", label: "Page background"     },
  { token: "--deep",     hex: "#0D1321", label: "Section alternates"  },
  { token: "--surface",  hex: "#0F1829", label: "Cards, inputs"        },
  { token: "--elevated", hex: "#131D2E", label: "Raised elements"     },
  { token: "--line",     hex: "#1E3050", label: "Borders / dividers"  },
  { token: "--line2",    hex: "#2A4060", label: "Hover borders"       },
  { token: "--ink",      hex: "#E8EDF3", label: "Primary text"        },
  { token: "--dim",      hex: "#7A8FA0", label: "Secondary text"      },
  { token: "--ghost",    hex: "#4A6080", label: "Placeholder text"    },
];

const SPACING_TOKENS = [
  { value: "4px",  use: "Icon-to-label gap"             },
  { value: "8px",  use: "Tight intra-component gap"     },
  { value: "12px", use: "Standard intra-card gap"       },
  { value: "16px", use: "Component internal padding"    },
  { value: "20px", use: "Card padding (horizontal)"     },
  { value: "24px", use: "Card padding (vertical)"       },
  { value: "28px", use: "Section sub-block gap"         },
  { value: "40px", use: "Hero inner spacing"            },
  { value: "64px", use: "Section vertical padding"      },
];

const DIMENSIONS = [
  { label: "Nav height",              value: "56px"        },
  { label: "Max page width",          value: "1160px"      },
  { label: "Section gutter",          value: "20px mobile, 32px desktop" },
  { label: "Button height (default)", value: "48px"        },
  { label: "Button height (sm)",      value: "36px"        },
  { label: "Button height (nav)",     value: "38px"        },
  { label: "Card border radius",      value: "12px"        },
  { label: "Pill border radius",      value: "100px"       },
  { label: "Badge border radius",     value: "4px"         },
  { label: "Mobile breakpoint",       value: "< 640px"     },
  { label: "Desktop breakpoint",      value: "≥ 960px"     },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ColorSwatch({ hex, label, role, dark = false }: {
  hex: string; label?: string; role?: string; dark?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  function isLight(h: string) {
    const r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16);
    return (r*299 + g*587 + b*114) / 1000 > 128;
  }
  return (
    <div>
      <button
        onClick={() => { navigator.clipboard.writeText(hex); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
        style={{
          width:"100%", height:64, background:hex, borderRadius:8,
          border: dark ? "1px solid rgba(255,255,255,.1)" : "1px solid rgba(0,0,0,.07)",
          display:"flex", alignItems:"flex-end", padding:"8px 10px",
          cursor:"pointer", transition:"transform .15s, box-shadow .15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.04)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 16px rgba(0,0,0,.18)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
      >
        <span style={{
          fontFamily:"var(--font-mono)", fontSize:10,
          color: isLight(hex) ? "#0D1117" : "#E8EDF3",
          opacity:.85, letterSpacing:"0.04em",
        }}>{copied ? "Copied!" : hex.toUpperCase()}</span>
      </button>
      {label && <p style={{ fontFamily:"var(--font-body)", fontSize:13, fontWeight:600, color:"var(--ink)", marginTop:6 }}>{label}</p>}
      {role  && <p style={{ fontFamily:"var(--font-body)", fontSize:12, color:"var(--dim)", marginTop:2, lineHeight:1.5 }}>{role}</p>}
    </div>
  );
}

function Heading({ id, text }: { id: string; text: string }) {
  return (
    <div id={id} style={{ display:"flex", alignItems:"center", gap:16, marginBottom:28 }}>
      <h2 style={{
        fontFamily:"var(--font-display)", fontWeight:800, fontSize:22,
        color:"var(--ink)", letterSpacing:"-0.02em", whiteSpace:"nowrap",
      }}>{text}</h2>
      <div style={{ flex:1, height:1, background:"var(--line)" }} />
    </div>
  );
}

function SubLabel({ text }: { text: string }) {
  return (
    <p style={{
      fontFamily:"var(--font-body)", fontSize:13, fontWeight:700,
      color:"var(--ghost)", textTransform:"uppercase", letterSpacing:"0.08em",
      marginBottom:14,
    }}>{text}</p>
  );
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV = [
  { id:"colors",        label:"Colors"        },
  { id:"typography",    label:"Typography"    },
  { id:"spacing",       label:"Spacing"       },
  { id:"buttons",       label:"Buttons"       },
  { id:"badges",        label:"Badges"        },
  { id:"tier-badges",   label:"Tier Badges"   },
  { id:"ai-mode-strip", label:"AI Mode Strip" },
  { id:"signal-detail", label:"Signal Detail" },
  { id:"agent-timeline",label:"Agent Timeline"},
  { id:"decision-log",  label:"Decision Log"  },
  { id:"system-status", label:"System Status" },
  { id:"cards",         label:"Cards"         },
  { id:"signals",       label:"Signals"       },
  { id:"motion",        label:"Motion"        },
  { id:"responsive",    label:"Responsive"    },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DesignSystemPage() {
  const [active, setActive] = useState("colors");

  return (
    <>
      <style>{`
        /* ── Buttons ── */
        .ds-btn { cursor:pointer; border:none; transition:all .18s ease; }
        .ds-btn:active { transform:scale(.97); }

        .ds-primary {
          background:var(--brand); color:#fff;
          font-family:var(--font-body); font-weight:700; font-size:15px;
          padding:12px 24px; border-radius:6px; min-height:44px;
        }
        .ds-primary:hover { opacity:.86; transform:translateY(-1px); box-shadow:0 4px 16px rgba(200,16,46,.28); }

        .ds-secondary {
          background:var(--surface); color:var(--ink);
          font-family:var(--font-body); font-weight:600; font-size:15px;
          padding:12px 24px; border-radius:6px; min-height:44px;
          border:1.5px solid var(--line2);
        }
        .ds-secondary:hover { border-color:var(--brand); color:var(--brand); transform:translateY(-1px); }

        .ds-ghost {
          background:transparent; color:var(--dim);
          font-family:var(--font-body); font-weight:600; font-size:15px;
          padding:12px 24px; border-radius:6px; min-height:44px;
          border:1.5px solid var(--line);
        }
        .ds-ghost:hover { border-color:var(--line2); color:var(--ink); background:var(--elevated); }

        .ds-danger {
          background:transparent; color:var(--bear);
          font-family:var(--font-body); font-weight:700; font-size:15px;
          padding:12px 24px; border-radius:6px; min-height:44px;
          border:1.5px solid var(--bear);
        }
        .ds-danger:hover { background:var(--bear-bg); transform:translateY(-1px); }

        .ds-disabled {
          background:var(--elevated); color:var(--ghost);
          font-family:var(--font-body); font-weight:600; font-size:15px;
          padding:12px 24px; border-radius:6px; min-height:44px;
          border:1px solid var(--line);
          opacity:.5; cursor:not-allowed;
        }

        /* ── Cards ── */
        .ds-card {
          background:var(--surface); border:1px solid var(--line);
          border-radius:12px;
          transition: border-color .2s, box-shadow .2s, transform .2s;
        }
        .ds-card:hover {
          border-color:var(--line2);
          box-shadow:0 4px 20px rgba(0,0,0,.07);
          transform:translateY(-2px);
        }
        .ds-card-featured {
          background:var(--surface);
          border:1.5px solid var(--brand);
          border-radius:12px;
          box-shadow:0 0 0 1px var(--brand), 0 4px 20px rgba(200,16,46,.08);
          transition: box-shadow .2s, transform .2s;
        }
        .ds-card-featured:hover {
          box-shadow:0 0 0 1px var(--brand), 0 8px 32px rgba(200,16,46,.14);
          transform:translateY(-2px);
        }

        /* ── Nav ── */
        .ds-nav-link {
          display:block; padding:8px 12px; border-radius:6px;
          font-family:var(--font-body); font-size:14px; font-weight:500;
          color:var(--dim); text-decoration:none;
          border-left:2px solid transparent;
          transition:background .15s, color .15s;
        }
        .ds-nav-link:hover { background:var(--elevated); color:var(--ink); }
        .ds-nav-link.active { border-left-color:var(--brand); color:var(--brand); background:rgba(200,16,46,.04); }

        /* ── Motion demos ── */
        @keyframes ds-fade-up  { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ds-slide-in { from{opacity:0;transform:translateX(-14px)} to{opacity:1;transform:translateX(0)} }
        @keyframes ds-pulse    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.78)} }
        @keyframes ds-glow-brand { 0%,100%{box-shadow:0 0 14px rgba(200,16,46,.18)} 50%{box-shadow:0 0 36px rgba(200,16,46,.48)} }
        @keyframes ds-glow-bull  { 0%,100%{box-shadow:0 0 14px rgba(0,168,118,.14)} 50%{box-shadow:0 0 36px rgba(0,168,118,.38)} }

        .ds-motion-fade  { animation:ds-fade-up  .6s ease both; }
        .ds-motion-slide { animation:ds-slide-in .5s ease both; }
        .ds-motion-pulse { animation:ds-pulse    1.8s ease-in-out infinite; }

        /* ── Responsive ── */
        .ds-layout { display:flex; }
        .ds-sidebar-nav { width:180px; flex-shrink:0; }

        @media (max-width:767px) {
          .ds-sidebar-nav { display:none; }
          .ds-layout { display:block; }
          .ds-main   { padding:24px 16px 80px !important; }
        }

        .ds-color-grid  { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:16px; }
        .ds-3col-grid   { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px; }
        .ds-2col-grid   { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:12px; }
        .ds-btn-row     { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }

        .ds-section { padding-bottom:56px; border-bottom:1px solid var(--line); margin-bottom:56px; }
        .ds-section:last-child { border-bottom:none; }
        .ds-subsection { margin-bottom:32px; }
      `}</style>

      <div style={{ background:"var(--bg)", minHeight:"100vh", color:"var(--ink)" }}>

        {/* ── Top bar ── */}
        <div style={{
          position:"sticky", top:0, zIndex:50,
          background:"var(--nav-bg)", backdropFilter:"blur(12px)",
          borderBottom:"1px solid var(--line)",
          height:52, padding:"0 20px",
          display:"flex", alignItems:"center", justifyContent:"space-between",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Link href="/" style={{
              fontFamily:"var(--font-display)", fontWeight:800, fontSize:15,
              color:"var(--ink)", textDecoration:"none", letterSpacing:"-0.02em",
              display:"flex", alignItems:"center", gap:8,
            }}>
              <div style={{ width:2, height:14, background:"var(--brand)", transform:"skewX(-14deg)", borderRadius:1 }} />
              ATLAS
            </Link>
            <span style={{ color:"var(--line2)", fontSize:18 }}>/</span>
            <span style={{ fontFamily:"var(--font-body)", fontSize:13, color:"var(--dim)", fontWeight:600 }}>
              Design System
            </span>
          </div>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--ghost)" }}>
            v0.1.0 · Living styleguide
          </span>
        </div>

        <div className="ds-layout">

          {/* ── Sidebar ── */}
          <aside className="ds-sidebar-nav" style={{
            position:"sticky", top:52, height:"calc(100vh - 52px)",
            borderRight:"1px solid var(--line)",
            padding:"20px 8px", overflowY:"auto",
            background:"var(--bg)",
          }}>
            <p style={{
              fontFamily:"var(--font-body)", fontSize:11, fontWeight:700,
              color:"var(--ghost)", textTransform:"uppercase", letterSpacing:"0.1em",
              padding:"0 12px 12px",
            }}>Sections</p>
            {NAV.map(item => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`ds-nav-link${active === item.id ? " active" : ""}`}
                onClick={() => setActive(item.id)}
              >{item.label}</a>
            ))}
          </aside>

          {/* ── Main ── */}
          <main className="ds-main" style={{ flex:1, padding:"40px 40px 96px", maxWidth:900 }}>

            {/* Intro */}
            <div style={{ marginBottom:56 }}>
              <h1 style={{
                fontFamily:"var(--font-display)", fontWeight:800, fontSize:28,
                letterSpacing:"-0.03em", color:"var(--ink)", marginBottom:10,
              }}>Atlas Design System</h1>
              <p style={{
                fontFamily:"var(--font-body)", fontSize:16, lineHeight:1.7,
                color:"var(--dim)", maxWidth:520,
              }}>
                Every token, component, and pattern used across Atlas. Click any
                color swatch to copy its hex value. The theme you select globally
                applies here too — switch between light and dark to preview all states.
              </p>
            </div>

            {/* ─── 1. Colors ─────────────────────────────────────────── */}
            <section className="ds-section">
              <Heading id="colors" text="Colors" />

              <div className="ds-subsection">
                <SubLabel text="Brand" />
                <div className="ds-color-grid">
                  {BRAND_COLORS.map(c => <ColorSwatch key={c.name} hex={c.hex} label={c.name} role={c.role} />)}
                </div>
              </div>

              <div className="ds-subsection">
                <SubLabel text="Semantic — Financial" />
                <div className="ds-color-grid">
                  {SEMANTIC.map(c => <ColorSwatch key={c.name} hex={c.hex} label={c.name} role={c.role} dark={c.name.includes("dark")} />)}
                </div>
              </div>

              <div className="ds-subsection">
                <SubLabel text="Neutral — Light mode" />
                <div className="ds-color-grid">
                  {NEUTRAL_LIGHT.map(c => <ColorSwatch key={c.token} hex={c.hex} label={c.token} role={c.label} />)}
                </div>
              </div>

              <div className="ds-subsection">
                <SubLabel text="Neutral — Dark mode" />
                <div style={{
                  background:"#0A0E1A", borderRadius:12, padding:20,
                  border:"1px solid #1E3050",
                }}>
                  <div className="ds-color-grid">
                    {NEUTRAL_DARK.map(c => (
                      <ColorSwatch key={c.token} hex={c.hex} label={c.token} role={c.label} dark />
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* ─── 2. Typography ─────────────────────────────────────── */}
            <section className="ds-section">
              <Heading id="typography" text="Typography" />

              <div className="ds-subsection">
                <SubLabel text="Font families" />
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:16 }}>
                  {[
                    { name:"Syne",           varName:"--font-display", weight:"100–800", use:"Headlines, display, logo" },
                    { name:"Nunito Sans",    varName:"--font-body",    weight:"300–800", use:"Body copy, UI text, CTAs" },
                    { name:"JetBrains Mono", varName:"--font-mono",    weight:"400–600", use:"Numbers, tickers, data labels only" },
                  ].map(f => (
                    <div key={f.name} className="ds-card" style={{ padding:20 }}>
                      <div style={{
                        fontFamily: f.name === "Syne" ? "var(--font-display)" : f.name === "JetBrains Mono" ? "var(--font-mono)" : "var(--font-body)",
                        fontSize:36, fontWeight:700, color:"var(--ink)",
                        letterSpacing:"-0.02em", marginBottom:10,
                      }}>Aa</div>
                      <p style={{ fontFamily:"var(--font-body)", fontSize:14, fontWeight:700, color:"var(--ink)", marginBottom:2 }}>{f.name}</p>
                      <p style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--ghost)", marginBottom:4 }}>{f.varName}</p>
                      <p style={{ fontFamily:"var(--font-body)", fontSize:13, color:"var(--dim)" }}>Weight: {f.weight}</p>
                      <p style={{ fontFamily:"var(--font-body)", fontSize:13, color:"var(--dim)", marginTop:2 }}>{f.use}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ds-subsection">
                <SubLabel text="Type scale" />
                <div style={{ borderRadius:12, overflow:"hidden", border:"1px solid var(--line)" }}>
                  {[
                    { size:"4rem",  w:800, font:"var(--font-display)",  label:"Hero (clamp ~4rem)",       sample:"ATLAS"              },
                    { size:"2.4rem", w:800, font:"var(--font-display)", label:"Section heading",           sample:"Your edge."         },
                    { size:"1.5rem", w:800, font:"var(--font-display)", label:"Card title",               sample:"Advisory Mode"      },
                    { size:"1.0625rem", w:400, font:"var(--font-body)", label:"Body (17px)",              sample:"Atlas analyzes the market with 8 AI agents." },
                    { size:".9375rem",  w:400, font:"var(--font-body)", label:"Body small (15px)",        sample:"Every signal includes the full chain of thought." },
                    { size:".875rem",   w:400, font:"var(--font-body)", label:"Caption / label (14px)",   sample:"Live trading active · Gemini 2.5 Flash"   },
                    { size:".8125rem",  w:500, font:"var(--font-mono)", label:"Mono data (13px)",         sample:"NVDA · BUY · 94% · +2.31%"               },
                    { size:".6875rem",  w:400, font:"var(--font-mono)", label:"Mono micro (11px)",        sample:"v0.1.0 · US EQUITIES"                    },
                  ].map((t, i) => (
                    <div key={i} style={{
                      display:"grid", gridTemplateColumns:"200px 1fr", gap:20, alignItems:"center",
                      padding:"14px 20px",
                      background: i%2===0 ? "var(--surface)" : "var(--elevated)",
                    }}>
                      <div>
                        <p style={{ fontFamily:"var(--font-mono)", fontSize:11, fontWeight:600, color:"var(--dim)" }}>{t.size} / {t.w}</p>
                        <p style={{ fontFamily:"var(--font-body)", fontSize:12, color:"var(--ghost)", marginTop:2 }}>{t.label}</p>
                      </div>
                      <div style={{
                        fontFamily:t.font, fontSize:t.size, fontWeight:t.w,
                        color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis",
                        whiteSpace:"nowrap", lineHeight:1.2,
                      }}>{t.sample}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ─── 3. Spacing ────────────────────────────────────────── */}
            <section className="ds-section">
              <Heading id="spacing" text="Spacing & Dimensions" />

              <div className="ds-subsection">
                <SubLabel text="Spacing scale" />
                <div style={{ display:"flex", flexDirection:"column", gap:0, border:"1px solid var(--line)", borderRadius:12, overflow:"hidden" }}>
                  {SPACING_TOKENS.map((s, i) => (
                    <div key={s.value} style={{
                      display:"grid", gridTemplateColumns:"80px 1fr auto",
                      alignItems:"center", gap:16, padding:"12px 20px",
                      background: i%2===0 ? "var(--surface)" : "var(--elevated)",
                    }}>
                      <p style={{ fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color:"var(--ink)" }}>{s.value}</p>
                      <p style={{ fontFamily:"var(--font-body)", fontSize:14, color:"var(--dim)" }}>{s.use}</p>
                      <div style={{ width:s.value, height:18, background:"var(--brand)", borderRadius:2, opacity:.4, minWidth:2, flexShrink:0 }} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="ds-subsection">
                <SubLabel text="Border radius" />
                <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
                  {[
                    { r:"2px",   label:"Terminal elements" },
                    { r:"4px",   label:"Badges, chips"      },
                    { r:"6px",   label:"Buttons"            },
                    { r:"8px",   label:"Small cards"        },
                    { r:"12px",  label:"Cards"              },
                    { r:"100px", label:"Pills"              },
                  ].map(b => (
                    <div key={b.r} style={{ textAlign:"center" }}>
                      <div style={{
                        width:56, height:56, borderRadius:b.r,
                        background:"var(--elevated)", border:"2px solid var(--line2)",
                        margin:"0 auto 8px",
                      }} />
                      <p style={{ fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, color:"var(--ink)" }}>{b.r}</p>
                      <p style={{ fontFamily:"var(--font-body)", fontSize:11, color:"var(--dim)", maxWidth:72, lineHeight:1.4 }}>{b.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ds-subsection">
                <SubLabel text="Key dimensions" />
                <div className="ds-2col-grid">
                  {DIMENSIONS.map(d => (
                    <div key={d.label} style={{
                      background:"var(--surface)", border:"1px solid var(--line)",
                      borderRadius:8, padding:"12px 16px",
                      display:"flex", justifyContent:"space-between", alignItems:"center", gap:12,
                    }}>
                      <span style={{ fontFamily:"var(--font-body)", fontSize:13, color:"var(--dim)" }}>{d.label}</span>
                      <span style={{ fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color:"var(--ink)", flexShrink:0 }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ─── 4. Buttons ────────────────────────────────────────── */}
            <section className="ds-section">
              <Heading id="buttons" text="Buttons" />
              <p style={{ fontFamily:"var(--font-body)", fontSize:15, color:"var(--dim)", marginBottom:24 }}>
                Hover over each button to see its interactive state. All buttons have <code style={{ fontFamily:"var(--font-mono)", fontSize:13 }}>min-height: 44px</code> for touch accessibility.
              </p>

              <div className="ds-subsection">
                <SubLabel text="Variants" />
                <div className="ds-btn-row">
                  <button className="ds-btn ds-primary">Primary</button>
                  <button className="ds-btn ds-secondary">Secondary</button>
                  <button className="ds-btn ds-ghost">Ghost</button>
                  <button className="ds-btn ds-danger">Danger</button>
                  <button className="ds-disabled" disabled>Disabled</button>
                </div>
              </div>

              <div className="ds-subsection">
                <SubLabel text="With icon / arrow" />
                <div className="ds-btn-row">
                  <button className="ds-btn ds-primary" style={{ display:"flex", alignItems:"center", gap:8 }}>
                    Join waitlist →
                  </button>
                  <button className="ds-btn ds-ghost" style={{ display:"flex", alignItems:"center", gap:8 }}>
                    Sign in
                  </button>
                  <button className="ds-btn ds-danger" style={{ display:"flex", alignItems:"center", gap:8 }}>
                    ✕ Override trade
                  </button>
                </div>
              </div>

              <div className="ds-subsection">
                <SubLabel text="States at a glance" />
                <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8 }}>
                  {[
                    { label:"Default",  style:{ background:"var(--brand)", color:"#fff", opacity:1 } },
                    { label:"Hover",    style:{ background:"var(--brand)", color:"#fff", opacity:.86 } },
                    { label:"Active",   style:{ background:"var(--brand)", color:"#fff", opacity:1, transform:"scale(.97)" } },
                    { label:"Focus",    style:{ background:"var(--brand)", color:"#fff", outline:"2px solid var(--ink)", outlineOffset:2 } },
                    { label:"Disabled", style:{ background:"var(--elevated)", color:"var(--ghost)", border:"1px solid var(--line)", opacity:.5 } },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign:"center" }}>
                      <div style={{
                        ...s.style, borderRadius:6, padding:"10px 0",
                        fontFamily:"var(--font-body)", fontSize:12, fontWeight:700, marginBottom:6,
                      }}>{s.label}</div>
                      <p style={{ fontFamily:"var(--font-body)", fontSize:11, color:"var(--ghost)" }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ─── 5. Badges ─────────────────────────────────────────── */}
            <section className="ds-section">
              <Heading id="badges" text="Badges & Status Pills" />

              <div className="ds-subsection">
                <SubLabel text="Signal action badges" />
                <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                  {[
                    { label:"BUY",  bg:"var(--bull-bg)", color:"var(--bull)" },
                    { label:"SELL", bg:"var(--bear-bg)", color:"var(--bear)" },
                    { label:"HOLD", bg:"var(--hold-bg)", color:"var(--hold)" },
                  ].map(b => (
                    <span key={b.label} style={{
                      background:b.bg, color:b.color,
                      fontFamily:"var(--font-mono)", fontSize:12, fontWeight:700,
                      padding:"5px 12px", borderRadius:4, letterSpacing:"0.06em",
                    }}>{b.label}</span>
                  ))}
                </div>
              </div>

              <div className="ds-subsection">
                <SubLabel text="Status / tier pills" />
                <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                  <span style={{
                    display:"inline-flex", alignItems:"center", gap:7,
                    background:"var(--surface)", border:"1px solid var(--line)",
                    borderRadius:100, padding:"6px 14px",
                    fontFamily:"var(--font-body)", fontSize:13, fontWeight:600, color:"var(--dim)",
                  }}>
                    <span style={{ width:7, height:7, borderRadius:"50%", background:"var(--bull)", display:"inline-block", animation:"ds-pulse 2s ease-in-out infinite" }} />
                    Live
                  </span>
                  <span style={{
                    display:"inline-flex", alignItems:"center", gap:7,
                    background:"rgba(200,16,46,.07)", border:"1px solid rgba(200,16,46,.2)",
                    borderRadius:100, padding:"6px 14px",
                    fontFamily:"var(--font-body)", fontSize:13, fontWeight:600, color:"var(--brand)",
                  }}>
                    <span style={{ width:7, height:7, borderRadius:"50%", background:"var(--brand)", display:"inline-block", animation:"ds-pulse 1.4s ease-in-out infinite" }} />
                    Signal
                  </span>
                  {["Free","Pro","Premium"].map(tier => (
                    <span key={tier} style={{
                      fontFamily:"var(--font-body)", fontSize:13, fontWeight:600, color:"var(--ghost)",
                      border:"1px solid var(--line)", padding:"5px 12px", borderRadius:4,
                    }}>{tier}</span>
                  ))}
                </div>
              </div>
            </section>

            {/* ─── 6. Tier Badges ────────────────────────────────────── */}
            <section className="ds-section">
              <Heading id="tier-badges" text="Tier Badges" />
              <div className="flex gap-3 flex-wrap">
                {[
                  { label: "Free",  bg: "var(--elevated)", color: "var(--dim)",      border: "var(--line)" },
                  { label: "Pro",   bg: "rgba(123,97,255,0.12)", color: "var(--tier-pro)", border: "rgba(123,97,255,0.3)" },
                  { label: "Max",   bg: "rgba(245,166,35,0.12)", color: "var(--tier-max)", border: "rgba(245,166,35,0.3)" },
                ].map((t) => (
                  <span key={t.label} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "4px 12px", borderRadius: 20, fontSize: 12,
                    fontFamily: "var(--font-mono)", fontWeight: 700,
                    background: t.bg, color: t.color, border: `1px solid ${t.border}`,
                    letterSpacing: "0.06em",
                  }}>
                    {t.label}
                  </span>
                ))}
              </div>
            </section>

            {/* ─── 7. AI Mode Strip ──────────────────────────────────── */}
            <section className="ds-section">
              <Heading id="ai-mode-strip" text="AI Mode Strip" />
              <div style={{
                background: "var(--elevated)", border: "1px solid var(--line)",
                borderRadius: 8, padding: "10px 16px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                maxWidth: 480,
              }}>
                <div className="flex items-center gap-2">
                  <span className="live-dot" />
                  <span style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-mono)" }}>AUTONOMOUS · GUARDRAIL</span>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ color: "var(--dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}>Buffett</span>
                  <span style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-mono)" }}>4 stocks active</span>
                </div>
              </div>
            </section>

            {/* ─── 8. Signal Detail Card ─────────────────────────────── */}
            <section className="ds-section">
              <Heading id="signal-detail" text="Signal Detail Card" />
              <div style={{ maxWidth: 360 }}>
                {(["BUY", "SELL", "HOLD"] as const).map((action) => {
                  const c = action === "BUY" ? "var(--bull)" : action === "SELL" ? "var(--bear)" : "var(--hold)";
                  return (
                    <div key={action} style={{
                      background: "var(--surface)", border: `1px solid ${c}40`,
                      borderRadius: 12, padding: "16px 18px", marginBottom: 12,
                    }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-display font-bold" style={{ fontSize: 20, color: "var(--ink)" }}>NVDA</span>
                        <span className="font-display font-bold" style={{ fontSize: 20, color: c }}>{action}</span>
                      </div>
                      <div className="conf-bar-track" style={{ marginBottom: 8 }}>
                        <div className="conf-bar-fill" style={{ width: "88%", background: c }} />
                      </div>
                      <span style={{ color: c, fontSize: 12, fontFamily: "var(--font-mono)" }}>88%</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ─── 9. Agent Timeline ─────────────────────────────────── */}
            <section className="ds-section">
              <Heading id="agent-timeline" text="Agent Timeline" />
              <div className="agent-timeline" style={{ maxWidth: 360, padding: "4px 0" }}>
                {[
                  { label: "Fundamental Agent", text: "P/E 28x vs 5yr avg 42x — undervalued. FCF yield 3.2%.", dot: "var(--bull)" },
                  { label: "Sentiment Agent",   text: "News sentiment 0.78/1.0. Institutional buying in 13F.", dot: "var(--bull)" },
                  { label: "Technical Agent",   text: "RSI 58, above 20d SMA. Breakout confirmed.", dot: "var(--bull)" },
                  { label: "Risk Agent",        text: "Stop −8%, target +22%. R:R 2.75. Size: $1,000.", dot: "var(--hold)" },
                ].map((node, i) => (
                  <div key={i} className="agent-timeline-node" style={{ marginBottom: 12 }}>
                    <div style={{ flexShrink: 0, marginTop: 4 }}>
                      <div style={{ width: 14, height: 14, borderRadius: "50%", background: node.dot, border: "2px solid var(--surface)" }} />
                    </div>
                    <div>
                      <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
                        {node.label}
                      </div>
                      <div style={{ color: "var(--dim)", fontSize: 13, fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
                        {node.text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ─── 10. Decision Log Row ──────────────────────────────── */}
            <section className="ds-section">
              <Heading id="decision-log" text="Decision Log Row" />
              <div style={{ maxWidth: 480, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "0 16px" }}>
                {[
                  { action: "BUY",  conf: 94, time: "10:32", reason: "Breakout confirmed, earnings catalyst" },
                  { action: "HOLD", conf: 81, time: "14:30", reason: "Momentum intact, maintaining position" },
                  { action: "SELL", conf: 87, time: "15:45", reason: "Price target reached" },
                ].map((row, i) => {
                  const c = row.action === "BUY" ? "var(--bull)" : row.action === "SELL" ? "var(--bear)" : "var(--hold)";
                  return (
                    <div key={i} className="decision-log-row">
                      <span style={{
                        flexShrink: 0, padding: "2px 8px", borderRadius: 4, fontSize: 11,
                        fontFamily: "var(--font-mono)", fontWeight: 700, color: c,
                        background: `${c}20`, border: `1px solid ${c}40`,
                      }}>{row.action}</span>
                      <div className="flex-1">
                        <div style={{ color: "var(--dim)", fontSize: 13 }}>{row.reason}</div>
                        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>
                          {row.time} · {row.conf}%
                        </div>
                      </div>
                      <div className="conf-bar-track" style={{ width: 60, flexShrink: 0, alignSelf: "center" }}>
                        <div className="conf-bar-fill" style={{ width: `${row.conf}%`, background: c }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ─── 11. System Status Pill ────────────────────────────── */}
            <section className="ds-section">
              <Heading id="system-status" text="System Status Pill" />
              <div className="flex gap-3 flex-wrap">
                <span className="system-status-pill online"><span className="live-dot" style={{ width: 6, height: 6 }} />Online</span>
                <span className="system-status-pill degraded"><span className="live-dot" style={{ width: 6, height: 6, background: "var(--hold)" }} />Degraded</span>
                <span className="system-status-pill offline"><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--bear)", display: "inline-block", flexShrink: 0 }} />Offline</span>
              </div>
            </section>

            {/* ─── 12. Cards ─────────────────────────────────────────── */}
            <section className="ds-section">
              <Heading id="cards" text="Cards" />
              <p style={{ fontFamily:"var(--font-body)", fontSize:15, color:"var(--dim)", marginBottom:24 }}>
                Hover cards to see the lift and border-color transition.
              </p>

              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:16 }}>
                <div className="ds-card" style={{ padding:24 }}>
                  <p style={{ fontFamily:"var(--font-body)", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--ghost)", marginBottom:10 }}>Default card</p>
                  <h3 style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:800, color:"var(--ink)", marginBottom:8 }}>Card title</h3>
                  <p style={{ fontFamily:"var(--font-body)", fontSize:14, lineHeight:1.7, color:"var(--dim)" }}>Standard card with border-color hover and 2px lift.</p>
                </div>
                <div className="ds-card-featured" style={{ padding:24 }}>
                  <p style={{ fontFamily:"var(--font-body)", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--brand)", marginBottom:10 }}>Featured card</p>
                  <h3 style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:800, color:"var(--ink)", marginBottom:8 }}>Highlighted</h3>
                  <p style={{ fontFamily:"var(--font-body)", fontSize:14, lineHeight:1.7, color:"var(--dim)" }}>Used for recommended tier, primary call-to-action card.</p>
                </div>
                <div className="ds-card" style={{
                  padding:24,
                  borderColor:"rgba(0,168,118,.3)",
                  animation:"ds-glow-bull 3s ease-in-out infinite",
                }}>
                  <p style={{ fontFamily:"var(--font-body)", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--bull)", marginBottom:10 }}>Signal card · Bull</p>
                  <h3 style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:800, color:"var(--ink)", marginBottom:8 }}>Glowing</h3>
                  <p style={{ fontFamily:"var(--font-body)", fontSize:14, lineHeight:1.7, color:"var(--dim)" }}>BUY signal cards pulse with a green glow animation.</p>
                </div>
              </div>
            </section>

            {/* ─── 7. Signals ────────────────────────────────────────── */}
            <section className="ds-section">
              <Heading id="signals" text="Signal Components" />
              <p style={{ fontFamily:"var(--font-body)", fontSize:15, color:"var(--dim)", marginBottom:24 }}>
                The core data display unit. Used in the dashboard signal feed and the homepage preview.
              </p>
              <div className="ds-card" style={{ padding:"0 20px" }}>
                {[
                  { ticker:"NVDA", name:"NVIDIA Corp.",    action:"BUY",  conf:94, delta:"+2.31%", reason:"Breakout pattern · earnings catalyst" },
                  { ticker:"AAPL", name:"Apple Inc.",      action:"BUY",  conf:78, delta:"+1.24%", reason:"RSI divergence · volume confirms"     },
                  { ticker:"META", name:"Meta Platforms",  action:"SELL", conf:83, delta:"−0.87%", reason:"Overbought RSI · insider distribution" },
                ].map((s, i, arr) => {
                  const c = s.action==="BUY" ? "var(--bull)" : s.action==="SELL" ? "var(--bear)" : "var(--hold)";
                  const bg = s.action==="BUY" ? "var(--bull-bg)" : s.action==="SELL" ? "var(--bear-bg)" : "var(--hold-bg)";
                  return (
                    <div key={s.ticker} style={{
                      display:"grid",
                      gridTemplateColumns:"1fr auto auto",
                      gap:12, alignItems:"center",
                      padding:"14px 0",
                      borderBottom: i < arr.length-1 ? "1px solid var(--line)" : "none",
                    }}>
                      <div>
                        <p style={{ fontFamily:"var(--font-mono)", fontSize:14, fontWeight:700, color:"var(--ink)" }}>{s.ticker}</p>
                        <p style={{ fontFamily:"var(--font-body)", fontSize:12, color:"var(--ghost)", marginTop:2 }}>{s.reason}</p>
                      </div>
                      <div>
                        <div style={{ height:3, width:80, background:"var(--line)", borderRadius:2, overflow:"hidden", marginBottom:4 }}>
                          <div style={{ height:"100%", width:`${s.conf}%`, background:c, borderRadius:2 }} />
                        </div>
                        <p style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--ghost)" }}>{s.conf}%</p>
                      </div>
                      <span style={{
                        fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700,
                        color:c, background:bg, padding:"4px 10px", borderRadius:4,
                        letterSpacing:"0.06em",
                      }}>{s.action}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ─── 8. Motion ─────────────────────────────────────────── */}
            <section className="ds-section">
              <Heading id="motion" text="Motion & Animation" />

              <div className="ds-subsection">
                <SubLabel text="Entrance animations (refresh to replay)" />
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12 }}>
                  {[
                    { cls:"ds-motion-fade",  label:"Fade up",  spec:"0.6s ease · hero, page load" },
                    { cls:"ds-motion-slide", label:"Slide in", spec:"0.5s ease · list rows, items", delay:.1 },
                  ].map(a => (
                    <div key={a.label} className={`ds-card ${a.cls}`} style={{ padding:20, animationDelay:`${a.delay||0}s` }}>
                      <p style={{ fontFamily:"var(--font-body)", fontSize:14, fontWeight:700, color:"var(--ink)", marginBottom:4 }}>{a.label}</p>
                      <p style={{ fontFamily:"var(--font-body)", fontSize:13, color:"var(--dim)" }}>{a.spec}</p>
                    </div>
                  ))}
                  <div className="ds-card" style={{ padding:20, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12 }}>
                    <span className="ds-motion-pulse" style={{ width:12, height:12, borderRadius:"50%", background:"var(--bull)", display:"inline-block" }} />
                    <p style={{ fontFamily:"var(--font-body)", fontSize:14, fontWeight:700, color:"var(--ink)" }}>Pulse live</p>
                    <p style={{ fontFamily:"var(--font-body)", fontSize:13, color:"var(--dim)", textAlign:"center" }}>1.8s ease · live status dots</p>
                  </div>
                </div>
              </div>

              <div className="ds-subsection">
                <SubLabel text="Standard transition values" />
                <div className="ds-2col-grid">
                  {[
                    { prop:"background-color, border-color, color", value:"0.18s ease", use:"Theme switch — global on all elements" },
                    { prop:"opacity, transform",  value:"0.18s ease", use:"Button hover / active" },
                    { prop:"border-color, box-shadow, transform", value:"0.2s ease", use:"Card hover" },
                  ].map(t => (
                    <div key={t.prop} style={{ background:"var(--surface)", border:"1px solid var(--line)", borderRadius:8, padding:"14px 16px" }}>
                      <p style={{ fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, color:"var(--ink)", marginBottom:4 }}>{t.value}</p>
                      <p style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--ghost)", marginBottom:6 }}>{t.prop}</p>
                      <p style={{ fontFamily:"var(--font-body)", fontSize:13, color:"var(--dim)" }}>{t.use}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ─── 9. Responsive ─────────────────────────────────────── */}
            <section className="ds-section">
              <Heading id="responsive" text="Responsive Behavior" />
              <p style={{ fontFamily:"var(--font-body)", fontSize:15, color:"var(--dim)", marginBottom:28 }}>
                Atlas is mobile-first. Default CSS targets phones. Media queries expand the layout for larger screens.
              </p>

              <div className="ds-subsection">
                <SubLabel text="Breakpoints" />
                <div style={{ border:"1px solid var(--line)", borderRadius:12, overflow:"hidden" }}>
                  {[
                    { bp:"< 640px",    label:"Mobile (default)",  notes:"Single column. Stacked buttons. No right panels."          },
                    { bp:"≥ 640px",    label:"Tablet",            notes:"2-column grids for mode and feature cards."                },
                    { bp:"≥ 960px",    label:"Desktop",           notes:"Full hero two-column. 3-column grids. Sidebar visible."    },
                    { bp:"≥ 1160px",   label:"Wide",              notes:"Content capped at 1160px, centered in viewport."           },
                  ].map((b, i) => (
                    <div key={b.bp} style={{
                      display:"grid", gridTemplateColumns:"120px 140px 1fr", gap:16,
                      alignItems:"center", padding:"14px 20px",
                      background: i%2===0 ? "var(--surface)" : "var(--elevated)",
                    }}>
                      <p style={{ fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color:"var(--brand)" }}>{b.bp}</p>
                      <p style={{ fontFamily:"var(--font-body)", fontSize:13, fontWeight:600, color:"var(--ink)" }}>{b.label}</p>
                      <p style={{ fontFamily:"var(--font-body)", fontSize:13, color:"var(--dim)" }}>{b.notes}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ds-subsection">
                <SubLabel text="Component behavior on mobile" />
                <div className="ds-2col-grid">
                  {[
                    { component:"Nav links",           behavior:"Hidden" },
                    { component:"Sign in (nav)",       behavior:"Always visible — primary action" },
                    { component:"Hero right panel",    behavior:"Hidden (signal feed preview)" },
                    { component:"Login left panel",    behavior:"Hidden below 900px" },
                    { component:"Mode cards (3)",      behavior:"Single column → 2-col → 3-col" },
                    { component:"Feature grid (3)",    behavior:"Single column → 2-col → 3-col" },
                    { component:"Design system sidebar", behavior:"Hidden, content full-width" },
                    { component:"Proof stat grid",     behavior:"2×2 preserved on all sizes" },
                    { component:"Touch targets",       behavior:"Min 44px height on all tappables" },
                    { component:"Section gutter",      behavior:"20px mobile, 32px desktop" },
                  ].map(r => (
                    <div key={r.component} style={{
                      background:"var(--surface)", border:"1px solid var(--line)",
                      borderRadius:8, padding:"12px 16px",
                    }}>
                      <p style={{ fontFamily:"var(--font-body)", fontSize:13, fontWeight:700, color:"var(--ink)", marginBottom:4 }}>{r.component}</p>
                      <p style={{ fontFamily:"var(--font-body)", fontSize:13, color:"var(--dim)" }}>{r.behavior}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

          </main>
        </div>
      </div>
    </>
  );
}

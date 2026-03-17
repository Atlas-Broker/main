"use client";

import { useState } from "react";
import Link from "next/link";

// ─── Token Data ───────────────────────────────────────────────────────────────

const BRAND_COLORS = [
  { name: "Brand",   var: "--brand",   light: "#C8102E", dark: "#C8102E", role: "Primary CTA, logo, key accents" },
  { name: "Signal",  var: "--signal",  light: "#E8001D", dark: "#E8001D", role: "High-urgency alerts" },
];

const SEMANTIC_COLORS = [
  { name: "Bull",    var: "--bull",    light: "#00A876", dark: "#00C896",  bg: "--bull-bg",  role: "BUY signals, positive P&L" },
  { name: "Bear",    var: "--bear",    light: "#D92040", dark: "#FF2D55",  bg: "--bear-bg",  role: "SELL signals, losses" },
  { name: "Hold",    var: "--hold",    light: "#D97B00", dark: "#F5A623",  bg: "--hold-bg",  role: "HOLD signals, neutral" },
];

const NEUTRAL_LIGHT = [
  { name: "--bg",       hex: "#F4F6F9", label: "Page background"    },
  { name: "--deep",     hex: "#EDF0F4", label: "Section alternates" },
  { name: "--surface",  hex: "#FFFFFF", label: "Cards, inputs"       },
  { name: "--elevated", hex: "#F0F2F6", label: "Raised UI elements"  },
  { name: "--line",     hex: "#E0E6ED", label: "Borders, dividers"   },
  { name: "--line2",    hex: "#C8D4DF", label: "Hover borders"       },
  { name: "--ink",      hex: "#0D1117", label: "Primary text"        },
  { name: "--dim",      hex: "#46606E", label: "Secondary text"      },
  { name: "--ghost",    hex: "#8DA4B2", label: "Placeholder, labels" },
];

const NEUTRAL_DARK = [
  { name: "--bg",       hex: "#07080B", label: "Page background"     },
  { name: "--deep",     hex: "#0C1016", label: "Section alternates"  },
  { name: "--surface",  hex: "#111820", label: "Cards, inputs"        },
  { name: "--elevated", hex: "#182030", label: "Raised UI elements"   },
  { name: "--line",     hex: "#1C2B3A", label: "Borders, dividers"    },
  { name: "--line2",    hex: "#263D52", label: "Hover borders"        },
  { name: "--ink",      hex: "#E8EDF3", label: "Primary text"         },
  { name: "--dim",      hex: "#7A8FA0", label: "Secondary text"       },
  { name: "--ghost",    hex: "#3D5060", label: "Placeholder, labels"  },
];

const TYPE_SCALE = [
  { size: "4.8rem", weight: "800", font: "Syne",        role: "Hero headline",    sample: "ATLAS"            },
  { size: "2.8rem", weight: "800", font: "Syne",        role: "Section heading",  sample: "Your edge."       },
  { size: "1.5rem", weight: "700", font: "Syne",        role: "Card title",       sample: "Advisory Mode"    },
  { size: "1rem",   weight: "600", font: "Syne",        role: "Label / subhead",  sample: "Execution Boundary"},
  { size: "1.0625rem", weight: "400", font: "Nunito Sans", role: "Body copy",     sample: "Multi-agent AI analysis with full reasoning transparency." },
  { size: "0.875rem", weight: "400", font: "Nunito Sans", role: "Small body",    sample: "Every signal includes the full chain of thought."           },
  { size: "0.8125rem", weight: "500", font: "JetBrains Mono", role: "Data / label", sample: "NVDA · BUY · 94% · +2.31%" },
  { size: "0.6875rem", weight: "400", font: "JetBrains Mono", role: "Micro label",  sample: "LIVE · US EQUITIES · 47ms" },
];

const SPACING = [
  { token: "4px",  use: "Gap within component (icon + label)"  },
  { token: "8px",  use: "Tight intra-card gaps"                },
  { token: "12px", use: "Standard intra-card padding"          },
  { token: "16px", use: "Component internal padding"           },
  { token: "20px", use: "Card padding (horizontal)"            },
  { token: "24px", use: "Card padding (vertical)"              },
  { token: "32px", use: "Section horizontal gutter"            },
  { token: "48px", use: "Inter-section spacing (small)"        },
  { token: "72px", use: "Section padding (vertical)"           },
];

const RADIUS = [
  { value: "2px",  use: "Terminal / mono UI elements (login page)" },
  { value: "4px",  use: "Buttons, badges, chips"                   },
  { value: "10px", use: "Cards"                                     },
  { value: "12px", use: "Hero panel cards"                         },
  { value: "100px", use: "Status pills / live indicators"          },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Swatch({ hex, label, name, dark = false }: {
  hex: string; label?: string; name?: string; dark?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  const isLight = (c: string) => {
    const r = parseInt(c.slice(1,3),16);
    const g = parseInt(c.slice(3,5),16);
    const b = parseInt(c.slice(5,7),16);
    return (r*299 + g*587 + b*114) / 1000 > 128;
  };
  const textColor = isLight(hex) ? "#0D1117" : "#E8EDF3";
  return (
    <div
      onClick={copy}
      style={{
        width: "100%", height: 72,
        background: hex, borderRadius: 6,
        display: "flex", flexDirection: "column",
        justifyContent: "flex-end", padding: "8px 10px",
        cursor: "pointer", position: "relative",
        border: dark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.06)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "scale(1.03)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "scale(1)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: textColor, letterSpacing: "0.06em", opacity: 0.9 }}>
        {copied ? "COPIED!" : hex.toUpperCase()}
      </div>
      {name && <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: textColor, opacity: 0.6, marginTop: 1 }}>{name}</div>}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ paddingBottom: 64, borderBottom: "1px solid var(--line)", marginBottom: 64 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 32 }}>
        <h2 style={{
          fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22,
          color: "var(--ink)", letterSpacing: "-0.02em",
        }}>{title}</h2>
        <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h3 style={{
        fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ghost)",
        letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 16,
      }}>{title}</h3>
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "colors",      label: "Colors"      },
  { id: "typography",  label: "Typography"  },
  { id: "spacing",     label: "Spacing"     },
  { id: "buttons",     label: "Buttons"     },
  { id: "badges",      label: "Badges"      },
  { id: "cards",       label: "Cards"       },
  { id: "signals",     label: "Signals"     },
  { id: "motion",      label: "Motion"      },
  { id: "responsive",  label: "Responsive"  },
];

export default function DesignSystemPage() {
  const [activeSection, setActiveSection] = useState("colors");

  return (
    <>
      <style>{`
        /* ── DS States ── */
        .ds-btn { cursor: pointer; transition: all 0.18s ease; }
        .ds-btn:active { transform: scale(0.97); }

        /* Primary */
        .ds-btn-primary {
          background: var(--brand); color: #fff;
          border: none; border-radius: 4px;
          padding: 10px 20px;
          font-family: var(--font-nunito); font-weight: 700; font-size: 14px;
        }
        .ds-btn-primary:hover { opacity: 0.86; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(200,16,46,0.3); }

        /* Secondary */
        .ds-btn-secondary {
          background: var(--surface); color: var(--ink);
          border: 1px solid var(--line2); border-radius: 4px;
          padding: 10px 20px;
          font-family: var(--font-nunito); font-weight: 600; font-size: 14px;
        }
        .ds-btn-secondary:hover { border-color: var(--brand); color: var(--brand); transform: translateY(-1px); }

        /* Ghost */
        .ds-btn-ghost {
          background: transparent; color: var(--dim);
          border: 1px solid var(--line); border-radius: 4px;
          padding: 10px 20px;
          font-family: var(--font-nunito); font-weight: 600; font-size: 14px;
        }
        .ds-btn-ghost:hover { border-color: var(--line2); color: var(--ink); background: var(--elevated); }

        /* Danger */
        .ds-btn-danger {
          background: transparent; color: var(--bear);
          border: 1px solid var(--bear); border-radius: 4px;
          padding: 10px 20px;
          font-family: var(--font-nunito); font-weight: 700; font-size: 14px;
        }
        .ds-btn-danger:hover { background: var(--bear-bg); transform: translateY(-1px); }

        /* Disabled */
        .ds-btn-disabled {
          background: var(--elevated); color: var(--ghost);
          border: 1px solid var(--line); border-radius: 4px;
          padding: 10px 20px;
          font-family: var(--font-nunito); font-weight: 600; font-size: 14px;
          opacity: 0.5; cursor: not-allowed;
        }

        /* Small variant */
        .ds-btn-sm { padding: 6px 14px !important; font-size: 12px !important; }
        /* Large variant */
        .ds-btn-lg { padding: 14px 32px !important; font-size: 16px !important; }

        /* Nav sidebar links */
        .ds-nav-link {
          display: block;
          padding: 6px 12px;
          border-radius: 4px;
          font-family: var(--font-mono); font-size: 11px; font-weight: 500;
          color: var(--dim); text-decoration: none; letter-spacing: 0.06em;
          transition: background 0.15s, color 0.15s;
          border-left: 2px solid transparent;
        }
        .ds-nav-link:hover  { background: var(--elevated); color: var(--ink); }
        .ds-nav-link.active { border-left-color: var(--brand); color: var(--brand); background: rgba(200,16,46,0.04); }

        /* Card hover */
        .ds-card-demo {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 10px;
          transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
        }
        .ds-card-demo:hover {
          border-color: var(--line2);
          box-shadow: 0 4px 20px rgba(0,0,0,0.07);
          transform: translateY(-2px);
        }

        /* Motion demos */
        @keyframes ds-fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ds-slide-in {
          from { opacity: 0; transform: translateX(-16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes ds-pulse {
          0%, 100% { opacity: 1;   transform: scale(1);    }
          50%       { opacity: 0.4; transform: scale(0.75); }
        }
        @keyframes ds-glow-brand {
          0%, 100% { box-shadow: 0 0 12px rgba(200,16,46,0.2); }
          50%       { box-shadow: 0 0 32px rgba(200,16,46,0.5); }
        }
        @keyframes ds-glow-bull {
          0%, 100% { box-shadow: 0 0 12px rgba(0,168,118,0.15); }
          50%       { box-shadow: 0 0 32px rgba(0,168,118,0.4); }
        }
        .ds-motion-fade   { animation: ds-fade-up  0.6s ease both; }
        .ds-motion-slide  { animation: ds-slide-in 0.5s ease both; }
        .ds-motion-pulse  { animation: ds-pulse    1.6s ease-in-out infinite; }
        .ds-motion-glow-brand { animation: ds-glow-brand 3s ease-in-out infinite; }
        .ds-motion-glow-bull  { animation: ds-glow-bull  3s ease-in-out infinite; }

        @media (max-width: 768px) {
          .ds-sidebar { display: none !important; }
          .ds-main    { margin-left: 0 !important; }
        }
      `}</style>

      <div style={{ background: "var(--bg)", minHeight: "100vh", color: "var(--ink)" }}>

        {/* ── Top bar ── */}
        <div style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "var(--nav-bg)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--line)",
          padding: "0 32px", height: 52,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/" style={{
              fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15,
              color: "var(--ink)", textDecoration: "none", letterSpacing: "-0.02em",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{ width: 2, height: 14, background: "var(--brand)", transform: "skewX(-14deg)", borderRadius: 1 }} />
              ATLAS
            </Link>
            <span style={{ color: "var(--line2)" }}>/</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--dim)", letterSpacing: "0.1em" }}>
              DESIGN SYSTEM
            </span>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ghost)", letterSpacing: "0.14em" }}>
            v0.1.0 · LIVING STYLEGUIDE
          </span>
        </div>

        <div style={{ display: "flex" }}>

          {/* ── Sidebar ── */}
          <aside className="ds-sidebar" style={{
            position: "sticky", top: 52, height: "calc(100vh - 52px)",
            width: 200, flexShrink: 0, borderRight: "1px solid var(--line)",
            padding: "24px 12px",
            overflowY: "auto",
            background: "var(--bg)",
          }}>
            <p style={{
              fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ghost)",
              letterSpacing: "0.18em", textTransform: "uppercase",
              padding: "0 12px 12px",
            }}>SECTIONS</p>
            {NAV_ITEMS.map(item => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`ds-nav-link${activeSection === item.id ? " active" : ""}`}
                onClick={() => setActiveSection(item.id)}
              >
                {item.label}
              </a>
            ))}
          </aside>

          {/* ── Main content ── */}
          <main className="ds-main" style={{ flex: 1, padding: "48px 48px 96px", maxWidth: 960 }}>

            {/* Intro */}
            <div style={{ marginBottom: 64 }}>
              <h1 style={{
                fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 32,
                letterSpacing: "-0.03em", color: "var(--ink)", marginBottom: 12,
              }}>Atlas Design System</h1>
              <p style={{
                fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.7,
                color: "var(--dim)", maxWidth: 560,
              }}>
                Every token, component, and pattern used across Atlas. This page is the
                single source of truth for brand, layout, and interaction design.
                Light mode is the default; the theme toggle applies globally.
              </p>
            </div>

            {/* ─── 1. Colors ─────────────────────────────────────────── */}
            <Section id="colors" title="Colors">
              <SubSection title="Brand">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 12, marginBottom: 8 }}>
                  {BRAND_COLORS.map(c => (
                    <div key={c.name}>
                      <Swatch hex={c.light} name={c.var} />
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--ink)" }}>{c.name}</div>
                        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--dim)", marginTop: 2 }}>{c.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </SubSection>

              <SubSection title="Semantic — Financial">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 12 }}>
                  {SEMANTIC_COLORS.map(c => (
                    <div key={c.name}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                        <Swatch hex={c.light} name="light" />
                        <Swatch hex={c.dark}  name="dark"  dark />
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--ink)" }}>{c.name}</div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--dim)", marginTop: 2 }}>{c.role}</div>
                    </div>
                  ))}
                </div>
              </SubSection>

              <SubSection title="Neutral Palette — Light Mode">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: 10 }}>
                  {NEUTRAL_LIGHT.map(c => (
                    <div key={c.name}>
                      <Swatch hex={c.hex} name={c.name} />
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ghost)", marginTop: 6, letterSpacing: "0.08em" }}>{c.name}</div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{c.label}</div>
                    </div>
                  ))}
                </div>
              </SubSection>

              <SubSection title="Neutral Palette — Dark Mode">
                <div style={{
                  background: "#07080B", borderRadius: 10,
                  padding: 20, border: "1px solid #1C2B3A",
                }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: 10 }}>
                    {NEUTRAL_DARK.map(c => (
                      <div key={c.name}>
                        <Swatch hex={c.hex} name={c.name} dark />
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#3D5060", marginTop: 6, letterSpacing: "0.08em" }}>{c.name}</div>
                        <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "#7A8FA0", marginTop: 2 }}>{c.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </SubSection>
            </Section>

            {/* ─── 2. Typography ─────────────────────────────────────── */}
            <Section id="typography" title="Typography">
              <SubSection title="Font Families">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                  {[
                    { name: "Syne",         var: "--font-display", class: "font-display", weight: "100–800", use: "Headlines, display text, logos" },
                    { name: "Nunito Sans",  var: "--font-body",    class: "font-body",    weight: "300–800", use: "Body copy, descriptions, UI prose" },
                    { name: "JetBrains Mono", var: "--font-mono",  class: "font-mono",    weight: "400–600", use: "Numbers, labels, data, terminal UI" },
                  ].map(f => (
                    <div key={f.name} className="ds-card-demo" style={{ padding: "20px" }}>
                      <div style={{
                        fontFamily: `var(${f.var})`, fontSize: 28, fontWeight: 700,
                        color: "var(--ink)", marginBottom: 8, letterSpacing: "-0.02em",
                      }}>Aa</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>{f.name}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ghost)", letterSpacing: "0.08em", marginBottom: 4 }}>{f.var}</div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--dim)" }}>Weight: {f.weight}</div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--dim)", marginTop: 2 }}>{f.use}</div>
                    </div>
                  ))}
                </div>
              </SubSection>

              <SubSection title="Type Scale">
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {TYPE_SCALE.map((t, i) => (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "200px 1fr",
                      alignItems: "center", gap: 24,
                      padding: "14px 0",
                      borderBottom: "1px solid var(--line)",
                    }}>
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ghost)", letterSpacing: "0.08em" }}>
                          {t.size} / {t.weight}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ghost)", marginTop: 2, letterSpacing: "0.06em" }}>
                          {t.font} · {t.role}
                        </div>
                      </div>
                      <div style={{
                        fontFamily: t.font === "Syne" ? "var(--font-display)" : t.font === "JetBrains Mono" ? "var(--font-mono)" : "var(--font-body)",
                        fontSize: t.size, fontWeight: parseInt(t.weight),
                        color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        lineHeight: 1.2,
                      }}>{t.sample}</div>
                    </div>
                  ))}
                </div>
              </SubSection>
            </Section>

            {/* ─── 3. Spacing ────────────────────────────────────────── */}
            <Section id="spacing" title="Spacing & Radius">
              <SubSection title="Spacing Scale">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {SPACING.map(s => (
                    <div key={s.token} style={{
                      display: "grid", gridTemplateColumns: "80px 1fr auto",
                      alignItems: "center", gap: 16,
                      padding: "10px 0", borderBottom: "1px solid var(--line)",
                    }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{s.token}</div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--dim)" }}>{s.use}</div>
                      <div style={{
                        width: s.token, height: 16,
                        background: "var(--brand)", borderRadius: 2, opacity: 0.5, flexShrink: 0,
                        minWidth: 2,
                      }} />
                    </div>
                  ))}
                </div>
              </SubSection>

              <SubSection title="Border Radius">
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  {RADIUS.map(r => (
                    <div key={r.value} style={{ textAlign: "center" }}>
                      <div style={{
                        width: 64, height: 64,
                        background: "var(--elevated)", border: "2px solid var(--line2)",
                        borderRadius: r.value,
                        margin: "0 auto 8px",
                      }} />
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--ink)" }}>{r.value}</div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--dim)", maxWidth: 100, lineHeight: 1.4 }}>{r.use}</div>
                    </div>
                  ))}
                </div>
              </SubSection>

              <SubSection title="Key Dimensions">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12 }}>
                  {[
                    { label: "Nav height",         value: "56px"  },
                    { label: "Nav height (DS)",     value: "52px"  },
                    { label: "Max page width",      value: "1200px" },
                    { label: "Max content width",   value: "960px"  },
                    { label: "Section gutter",      value: "32px"  },
                    { label: "Hero gap (columns)",  value: "64px"  },
                    { label: "Button height (md)",  value: "40px"  },
                    { label: "Button height (sm)",  value: "30px"  },
                    { label: "Button height (lg)",  value: "48px"  },
                    { label: "Input height",        value: "40px"  },
                    { label: "Card padding",        value: "24px / 20px" },
                    { label: "Sidebar width",       value: "200px" },
                  ].map(d => (
                    <div key={d.label} style={{
                      background: "var(--surface)", border: "1px solid var(--line)",
                      borderRadius: 8, padding: "14px 16px",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--dim)" }}>{d.label}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </SubSection>
            </Section>

            {/* ─── 4. Buttons ────────────────────────────────────────── */}
            <Section id="buttons" title="Buttons">
              <SubSection title="Variants (hover me)">
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <button className="ds-btn ds-btn-primary">Primary</button>
                  <button className="ds-btn ds-btn-secondary">Secondary</button>
                  <button className="ds-btn ds-btn-ghost">Ghost</button>
                  <button className="ds-btn ds-btn-danger">Danger</button>
                  <button className="ds-btn ds-btn-disabled" disabled>Disabled</button>
                </div>
              </SubSection>

              <SubSection title="Sizes">
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="ds-btn ds-btn-primary ds-btn-sm">Small</button>
                  <button className="ds-btn ds-btn-primary">Default</button>
                  <button className="ds-btn ds-btn-primary ds-btn-lg">Large</button>
                </div>
              </SubSection>

              <SubSection title="With icon">
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button className="ds-btn ds-btn-primary" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", display: "inline-block" }} />
                    Go Live
                  </button>
                  <button className="ds-btn ds-btn-ghost" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    Sign in →
                  </button>
                  <button className="ds-btn ds-btn-danger" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    ✕ Override
                  </button>
                </div>
              </SubSection>

              <SubSection title="States spec">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
                  {[
                    { label: "Default",  bg: "var(--brand)", color: "#fff", border: "none", opacity: 1 },
                    { label: "Hover",    bg: "var(--brand)", color: "#fff", border: "none", opacity: 0.86 },
                    { label: "Active",   bg: "var(--brand)", color: "#fff", border: "none", opacity: 1 },
                    { label: "Focus",    bg: "var(--brand)", color: "#fff", border: "2px solid var(--ink)", opacity: 1 },
                    { label: "Disabled", bg: "var(--elevated)", color: "var(--ghost)", border: "1px solid var(--line)", opacity: 0.5 },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: "center" }}>
                      <div style={{
                        background: s.bg, color: s.color,
                        border: s.border || "none",
                        borderRadius: 4, padding: "8px 0",
                        fontFamily: "var(--font-nunito)", fontSize: 12, fontWeight: 700,
                        opacity: s.opacity, marginBottom: 6,
                      }}>{s.label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ghost)", letterSpacing: "0.06em" }}>
                        {s.label.toUpperCase()}
                      </div>
                    </div>
                  ))}
                </div>
              </SubSection>
            </Section>

            {/* ─── 5. Badges ─────────────────────────────────────────── */}
            <Section id="badges" title="Badges & Pills">
              <SubSection title="Signal badges">
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  {[
                    { label: "BUY",  bg: "var(--bull-bg)", color: "var(--bull)" },
                    { label: "SELL", bg: "var(--bear-bg)", color: "var(--bear)" },
                    { label: "HOLD", bg: "var(--hold-bg)", color: "var(--hold)" },
                  ].map(b => (
                    <span key={b.label} style={{
                      background: b.bg, color: b.color,
                      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                      padding: "4px 10px", borderRadius: 4, letterSpacing: "0.1em",
                    }}>{b.label}</span>
                  ))}
                </div>
              </SubSection>

              <SubSection title="Status pills">
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "var(--surface)", border: "1px solid var(--line)",
                    borderRadius: 100, padding: "5px 12px",
                    fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dim)", letterSpacing: "0.1em",
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--bull)", animation: "ds-pulse 2s ease-in-out infinite", display: "inline-block" }} />
                    LIVE
                  </span>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "rgba(200,16,46,0.08)", border: "1px solid rgba(200,16,46,0.2)",
                    borderRadius: 100, padding: "5px 12px",
                    fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--brand)", letterSpacing: "0.1em",
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand)", animation: "ds-pulse 1.4s ease-in-out infinite", display: "inline-block" }} />
                    SIGNAL
                  </span>
                  {["Free", "Pro", "Premium"].map(tier => (
                    <span key={tier} style={{
                      fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ghost)",
                      border: "1px solid var(--line)",
                      padding: "4px 10px", borderRadius: 4, letterSpacing: "0.1em",
                    }}>{tier}</span>
                  ))}
                </div>
              </SubSection>
            </Section>

            {/* ─── 6. Cards ──────────────────────────────────────────── */}
            <Section id="cards" title="Cards">
              <SubSection title="Base card (hover me)">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
                  <div className="ds-card-demo" style={{ padding: "20px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ghost)", letterSpacing: "0.14em", marginBottom: 10 }}>DEFAULT CARD</div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>Title here</div>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--dim)", lineHeight: 1.6 }}>Body copy that explains the content within this card component.</p>
                  </div>
                  <div className="ds-card-demo" style={{ padding: "20px", borderColor: "var(--brand)", boxShadow: "0 0 0 1px var(--brand), 0 4px 20px rgba(200,16,46,0.08)" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--brand)", letterSpacing: "0.14em", marginBottom: 10 }}>FEATURED CARD</div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>Highlighted</div>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--dim)", lineHeight: 1.6 }}>Used for the recommended tier or primary call-to-action card.</p>
                  </div>
                  <div className="ds-card-demo ds-motion-glow-bull" style={{ padding: "20px", borderColor: "rgba(0,168,118,0.3)" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--bull)", letterSpacing: "0.14em", marginBottom: 10 }}>SIGNAL CARD · BULL</div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>Glowing</div>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--dim)", lineHeight: 1.6 }}>Signal cards pulse with a glow matching their action color.</p>
                  </div>
                </div>
              </SubSection>
            </Section>

            {/* ─── 7. Signal Cards ───────────────────────────────────── */}
            <Section id="signals" title="Signal Components">
              <SubSection title="Signal row">
                <div className="ds-card-demo" style={{ padding: "0 20px" }}>
                  {[
                    { ticker: "NVDA", name: "NVIDIA Corp.", action: "BUY",  conf: 94, delta: "+2.31%" },
                    { ticker: "AAPL", name: "Apple Inc.",   action: "SELL", conf: 82, delta: "−1.24%" },
                    { ticker: "META", name: "Meta Platforms", action: "HOLD", conf: 66, delta: "+0.41%" },
                  ].map((s, i) => (
                    <div key={s.ticker} style={{
                      display: "grid",
                      gridTemplateColumns: "52px 44px 1fr 52px",
                      gap: "0 12px", alignItems: "center",
                      padding: "13px 0",
                      borderBottom: i < 2 ? "1px solid var(--line)" : "none",
                    }}>
                      <div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{s.ticker}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ghost)", marginTop: 2 }}>{s.name}</div>
                      </div>
                      <span style={{
                        background: s.action === "BUY" ? "var(--bull-bg)" : s.action === "SELL" ? "var(--bear-bg)" : "var(--hold-bg)",
                        color: s.action === "BUY" ? "var(--bull)" : s.action === "SELL" ? "var(--bear)" : "var(--hold)",
                        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                        padding: "3px 6px", borderRadius: 3, letterSpacing: "0.08em",
                        display: "inline-block", textAlign: "center",
                      }}>{s.action}</span>
                      <div>
                        <div style={{ height: 3, background: "var(--line)", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
                          <div style={{
                            height: "100%", width: `${s.conf}%`,
                            background: s.action === "BUY" ? "var(--bull)" : s.action === "SELL" ? "var(--bear)" : "var(--hold)",
                            borderRadius: 2,
                          }} />
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ghost)" }}>{s.conf}% confidence</div>
                      </div>
                      <div style={{
                        fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
                        color: s.delta.startsWith("+") ? "var(--bull)" : "var(--bear)",
                        textAlign: "right",
                      }}>{s.delta}</div>
                    </div>
                  ))}
                </div>
              </SubSection>
            </Section>

            {/* ─── 8. Motion ─────────────────────────────────────────── */}
            <Section id="motion" title="Motion & Animation">
              <SubSection title="Entrance animations (reload to replay)">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                  <div className="ds-card-demo ds-motion-fade" style={{ padding: 20, textAlign: "center", animationDelay: "0s" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dim)", letterSpacing: "0.12em", marginBottom: 8 }}>FADE UP</div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--ghost)" }}>
                      0.6s ease · page load, hero
                    </div>
                  </div>
                  <div className="ds-card-demo ds-motion-slide" style={{ padding: 20, textAlign: "center", animationDelay: "0.1s" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dim)", letterSpacing: "0.12em", marginBottom: 8 }}>SLIDE IN</div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--ghost)" }}>
                      0.5s ease · list items, rows
                    </div>
                  </div>
                  <div className="ds-card-demo" style={{ padding: 20, textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dim)", letterSpacing: "0.12em", marginBottom: 12 }}>PULSE LIVE</div>
                    <span className="ds-motion-pulse" style={{
                      display: "inline-block", width: 10, height: 10,
                      borderRadius: "50%", background: "var(--bull)",
                    }} />
                  </div>
                </div>
              </SubSection>

              <SubSection title="Glow effects">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                  <div className="ds-card-demo ds-motion-glow-brand" style={{ padding: 20, textAlign: "center", borderColor: "rgba(200,16,46,0.3)" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--brand)", letterSpacing: "0.14em" }}>GLOW BRAND</div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--dim)", marginTop: 6 }}>Active states, CTAs</div>
                  </div>
                  <div className="ds-card-demo ds-motion-glow-bull" style={{ padding: 20, textAlign: "center", borderColor: "rgba(0,168,118,0.3)" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--bull)", letterSpacing: "0.14em" }}>GLOW BULL</div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--dim)", marginTop: 6 }}>BUY signals, gains</div>
                  </div>
                  <div className="ds-card-demo" style={{ padding: 20, textAlign: "center", animation: "ds-glow-bear 3s ease-in-out infinite", borderColor: "rgba(217,32,64,0.3)" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--bear)", letterSpacing: "0.14em" }}>GLOW BEAR</div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--dim)", marginTop: 6 }}>SELL signals, losses</div>
                  </div>
                </div>
              </SubSection>

              <SubSection title="Transition spec">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 8 }}>
                  {[
                    { prop: "background-color", duration: "0.18s ease", use: "Theme switches" },
                    { prop: "border-color",      duration: "0.18s ease", use: "Card hover" },
                    { prop: "color",             duration: "0.18s ease", use: "Link/button hover" },
                    { prop: "opacity",           duration: "0.18s ease", use: "Button hover" },
                    { prop: "transform",         duration: "0.18s ease", use: "Card lift on hover" },
                    { prop: "box-shadow",        duration: "0.2s ease",  use: "Card depth on hover" },
                  ].map(t => (
                    <div key={t.prop} style={{
                      background: "var(--surface)", border: "1px solid var(--line)",
                      borderRadius: 8, padding: "12px 14px",
                    }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--ink)" }}>{t.prop}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--brand)", marginTop: 3 }}>{t.duration}</div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--dim)", marginTop: 4 }}>{t.use}</div>
                    </div>
                  ))}
                </div>
              </SubSection>
            </Section>

            {/* ─── 9. Responsive ─────────────────────────────────────── */}
            <Section id="responsive" title="Responsive Breakpoints">
              <SubSection title="Breakpoints">
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {[
                    { bp: "< 640px",   label: "Mobile",        changes: "Single column, hidden nav links, stacked buttons" },
                    { bp: "640–900px", label: "Tablet",         changes: "3-col grids collapse to 2-col, reduced padding" },
                    { bp: "900px+",    label: "Desktop",        changes: "Full layout, sidebar visible, hero two-column" },
                    { bp: "1200px",    label: "Max content",    changes: "Content capped, centered within viewport" },
                  ].map(b => (
                    <div key={b.bp} style={{
                      display: "grid", gridTemplateColumns: "120px 100px 1fr",
                      gap: 24, alignItems: "center",
                      padding: "13px 0", borderBottom: "1px solid var(--line)",
                    }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{b.bp}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ghost)", letterSpacing: "0.08em" }}>{b.label}</div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--dim)" }}>{b.changes}</div>
                    </div>
                  ))}
                </div>
              </SubSection>

              <SubSection title="Mobile-specific rules">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12 }}>
                  {[
                    { component: "Homepage left panel",   rule: "Visible, full width"       },
                    { component: "Homepage right panel",  rule: "Hidden (display: none)"    },
                    { component: "Nav links",             rule: "Hidden (display: none)"    },
                    { component: "Login left panel",      rule: "Hidden below 900px"        },
                    { component: "Mode cards",            rule: "Single column stack"       },
                    { component: "Feature grid",          rule: "Single column stack"       },
                    { component: "Design system sidebar", rule: "Hidden (display: none)"    },
                    { component: "Proof strip",           rule: "2×2 grid preserved"        },
                  ].map(r => (
                    <div key={r.component} style={{
                      background: "var(--surface)", border: "1px solid var(--line)",
                      borderRadius: 8, padding: "14px 16px",
                    }}>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>{r.component}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dim)", letterSpacing: "0.08em" }}>{r.rule}</div>
                    </div>
                  ))}
                </div>
              </SubSection>
            </Section>

          </main>
        </div>
      </div>
    </>
  );
}

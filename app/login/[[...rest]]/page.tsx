import { SignIn } from "@clerk/nextjs";

const SIGNALS = [
  { ticker: "NVDA",  action: "BUY",  conf: 94, delta: "+2.31%" },
  { ticker: "TSLA",  action: "BUY",  conf: 88, delta: "+1.47%" },
  { ticker: "META",  action: "SELL", conf: 82, delta: "−0.93%" },
  { ticker: "AAPL",  action: "HOLD", conf: 71, delta: "+0.22%" },
  { ticker: "MSFT",  action: "BUY",  conf: 91, delta: "+1.88%" },
  { ticker: "AMZN",  action: "SELL", conf: 76, delta: "−1.14%" },
  { ticker: "GOOGL", action: "BUY",  conf: 85, delta: "+0.97%" },
  { ticker: "JPM",   action: "HOLD", conf: 68, delta: "−0.05%" },
] as const;

const ACTION_COLOR: Record<string, string> = {
  BUY:  "#00A876",
  SELL: "#D92040",
  HOLD: "#D97B00",
};
const ACTION_BG: Record<string, string> = {
  BUY:  "rgba(0,168,118,0.10)",
  SELL: "rgba(217,32,64,0.10)",
  HOLD: "rgba(217,123,0,0.10)",
};

const clerkAppearance = {
  variables: {
    colorPrimary:         "#C8102E",
    colorBackground:      "#FFFFFF",
    colorInputBackground: "#F7F8FA",
    colorInputText:       "#0D1117",
    colorText:            "#0D1117",
    colorTextSecondary:   "#46606E",
    colorDanger:          "#D92040",
    borderRadius:         "8px",
    fontFamily:           '"JetBrains Mono", "Courier New", monospace',
    fontSize:             "13px",
    spacingUnit:          "14px",
  },
  elements: {
    rootBox: { width: "100%", maxWidth: "100%" },
    card: {
      background:   "#FFFFFF",
      border:       "none",
      borderRadius: "0",
      boxShadow:    "none",
      padding:      "24px",
      width:        "100%",
      maxWidth:     "100%",
      boxSizing:    "border-box" as const,
    },
    headerTitle:    { display: "none" },
    headerSubtitle: { display: "none" },
    header:         { display: "none" },
    // Hide the email/password form since only Google OAuth is used
    form:           { display: "none" },
    dividerRow:     { display: "none" },
    socialButtonsBlockButton: {
      border:       "1.5px solid #E0E6ED",
      background:   "#FFFFFF",
      color:        "#0D1117",
      borderRadius: "8px",
      fontSize:     "13px",
      padding:      "12px 16px",
      fontWeight:   "500",
      boxShadow:    "0 1px 3px rgba(0,0,0,0.05)",
    },
    footer: {
      background:   "transparent",
      borderTop:    "1px solid #E8ECF0",
      paddingTop:   "14px",
      marginTop:    "0",
    },
    footerActionText: { color: "#8DA4B2", fontSize: "12px" },
    footerActionLink: { color: "#C8102E", fontSize: "12px" },
    formButtonPrimary: {
      borderRadius:  "8px",
      background:    "#C8102E",
      fontSize:      "13px",
      letterSpacing: "0.04em",
      fontWeight:    "600",
    },
  },
};

export default function LoginPage() {
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sig-in {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes dot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.8); }
        }

        /* Fixed to viewport — bypasses all parent height issues */
        .l-root {
          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          background: #FFFFFF;
          font-family: 'JetBrains Mono', 'Courier New', monospace;
        }

        /* Mobile: single centered column */
        .l-left { display: none; }

        .l-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
          overflow-y: auto;
          animation: fade-up 0.45s ease both;
        }

        .l-content {
          width: 100%;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .l-logo { margin-bottom: 36px; }

        .l-heading { margin-bottom: 20px; }

        /* Desktop ≥ 900px */
        @media (min-width: 900px) {
          .l-root {
            flex-direction: row;
          }
          .l-left {
            display: flex;
            flex-direction: column;
            flex: 0 0 56%;
            height: 100%;
            border-right: 1px solid #E8ECF0;
            background: #FAFBFC;
            padding: 52px 56px 40px;
            overflow-y: auto;
            position: relative;
          }
          .l-right {
            flex: 1;
            height: 100%;
            overflow-y: auto;
            padding: 52px 48px;
          }
          .l-content {
            align-items: flex-start;
            text-align: left;
          }
          .l-logo { display: none; }
        }

        .sig-row {
          opacity: 0;
          animation: sig-in 0.3s ease forwards;
        }
        .live-dot {
          display: inline-block;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #00A876;
          animation: dot-pulse 2.2s ease-in-out infinite;
          flex-shrink: 0;
        }
      `}</style>

      <div className="l-root">

        {/* ── LEFT panel (desktop only) ── */}
        <div className="l-left">
          <div style={{ position: "absolute", top: -60, left: -60, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(200,16,46,0.05) 0%, transparent 65%)", pointerEvents: "none" }} />

          <div style={{ marginBottom: 44, animation: "fade-up 0.4s ease both" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 3, height: 22, background: "#C8102E", transform: "skewX(-12deg)", borderRadius: 1 }} />
              <span style={{ fontFamily: "'Syne', system-ui, sans-serif", fontSize: 24, fontWeight: 800, color: "#0D1117", letterSpacing: "-0.02em" }}>ATLAS</span>
              <span style={{ color: "#C8D4DF", fontSize: 9, letterSpacing: "0.2em", marginLeft: 4 }}>AI PORTFOLIO</span>
            </div>
            <p style={{ color: "#C8D4DF", fontSize: 9, letterSpacing: "0.14em", paddingLeft: 13 }}>AGENTIC INVESTMENT &amp; TRADING SYSTEM</p>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 36, flexWrap: "wrap", animation: "fade-up 0.4s 0.06s ease both" }}>
            {([
              { label: "SYSTEM",  value: "LIVE",     accent: "#00A876", dot: true  },
              { label: "SIGNALS", value: "47 TODAY", accent: "#0D1117", dot: false },
              { label: "LATENCY", value: "12ms",     accent: "#0D1117", dot: false },
            ] as const).map(({ label, value, accent, dot }) => (
              <div key={label} style={{ border: "1px solid #E0E6ED", borderRadius: 6, padding: "5px 10px", fontSize: 9, letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 6, background: "#FFFFFF" }}>
                <span style={{ color: "#8DA4B2" }}>{label}</span>
                <span style={{ color: accent, fontWeight: 600 }}>{value}</span>
                {dot && <span className="live-dot" style={{ width: 5, height: 5 }} />}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "60px 50px 1fr 64px", gap: "0 12px", padding: "8px 0", borderTop: "1px solid #E0E6ED", borderBottom: "1px solid #E0E6ED", marginBottom: 2, fontSize: 9, color: "#B0BEC5", letterSpacing: "0.16em" }}>
            <span>TICKER</span><span>SIG</span><span>CONF</span><span style={{ textAlign: "right" }}>Δ DAY</span>
          </div>

          {SIGNALS.map((s, i) => (
            <div key={s.ticker} className="sig-row" style={{ animationDelay: `${0.1 + i * 0.05}s`, display: "grid", gridTemplateColumns: "60px 50px 1fr 64px", gap: "0 12px", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F0F2F5" }}>
              <span style={{ color: "#0D1117", fontWeight: 600, fontSize: 13 }}>{s.ticker}</span>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "2px 7px", borderRadius: 4, background: ACTION_BG[s.action], color: ACTION_COLOR[s.action], fontSize: 9, letterSpacing: "0.08em", fontWeight: 700, width: "fit-content" }}>
                {s.action}
              </span>
              <div>
                <div style={{ height: 3, borderRadius: 2, background: "#EDF0F4", position: "relative", overflow: "hidden", marginBottom: 3 }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${s.conf}%`, background: ACTION_COLOR[s.action], borderRadius: 2, opacity: 0.55 }} />
                </div>
                <span style={{ color: "#B0BEC5", fontSize: 9 }}>{s.conf}%</span>
              </div>
              <span style={{ textAlign: "right", color: s.delta.startsWith("+") ? "#00A876" : "#D92040", fontSize: 12, fontWeight: 600 }}>
                {s.delta}
              </span>
            </div>
          ))}

          <div style={{ marginTop: "auto", paddingTop: 28 }}>
            <p style={{ borderTop: "1px solid #E0E6ED", paddingTop: 14, color: "#C8D4DF", fontSize: 9, letterSpacing: "0.12em" }}>
              POWERED BY GEMINI 2.5 FLASH · ALPACA PAPER TRADING · SUPABASE
            </p>
          </div>
        </div>

        {/* ── RIGHT panel ── */}
        <div className="l-right">
          <div className="l-content">

            {/* Logo — mobile only (hidden on desktop via CSS) */}
            <div className="l-logo">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 3, height: 20, background: "#C8102E", transform: "skewX(-12deg)", borderRadius: 1 }} />
                <span style={{ fontFamily: "'Syne', system-ui, sans-serif", fontSize: 22, fontWeight: 800, color: "#0D1117", letterSpacing: "-0.02em" }}>ATLAS</span>
              </div>
              <p style={{ color: "#B0BEC5", fontSize: 9, letterSpacing: "0.14em" }}>AGENTIC INVESTMENT &amp; TRADING SYSTEM</p>
            </div>

            {/* Heading */}
            <div className="l-heading">
              <h1 style={{ fontFamily: "'Syne', system-ui, sans-serif", fontSize: 26, fontWeight: 700, color: "#0D1117", letterSpacing: "-0.02em", marginBottom: 6 }}>
                Sign in
              </h1>
              <p style={{ color: "#8DA4B2", fontSize: 12 }}>Continue to your Atlas portfolio</p>
            </div>

            {/* Clerk — outer wrapper owns the border/shadow so overflow:hidden clips
                the Clerk card flush without cutting off the shadow */}
            <div style={{
              width: "100%",
              border: "1px solid #E8ECF0",
              borderRadius: "12px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
              overflow: "hidden",
            }}>
              <SignIn appearance={clerkAppearance} />
            </div>

            <p style={{ marginTop: 20, fontSize: 9, color: "#C8D4DF", letterSpacing: "0.14em" }}>
              ADVISORY · CONDITIONAL · AUTONOMOUS
            </p>
          </div>
        </div>

      </div>
    </>
  );
}

import { SignIn } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

const SIGNALS = [
  { ticker: "NVDA", action: "BUY",  conf: 94, delta: "+2.31%" },
  { ticker: "TSLA", action: "BUY",  conf: 88, delta: "+1.47%" },
  { ticker: "META", action: "SELL", conf: 82, delta: "−0.93%" },
  { ticker: "AAPL", action: "HOLD", conf: 71, delta: "+0.22%" },
  { ticker: "MSFT", action: "BUY",  conf: 91, delta: "+1.88%" },
  { ticker: "AMZN", action: "SELL", conf: 76, delta: "−1.14%" },
  { ticker: "GOOGL", action: "BUY", conf: 85, delta: "+0.97%" },
  { ticker: "JPM",  action: "HOLD", conf: 68, delta: "−0.05%" },
] as const;

const ACTION_COLOR: Record<string, string> = {
  BUY:  "#00C896",
  SELL: "#FF2D55",
  HOLD: "#F5A623",
};

const appearance = {
  baseTheme: dark,
  variables: {
    colorPrimary:        "#C8102E",
    colorBackground:     "transparent",
    colorInputBackground:"#07080B",
    colorInputText:      "#E8EDF3",
    colorText:           "#E8EDF3",
    colorTextSecondary:  "#7A8FA0",
    colorDanger:         "#FF2D55",
    borderRadius:        "2px",
    fontFamily:          '"JetBrains Mono", "Courier New", monospace',
    fontSize:            "13px",
    spacingUnit:         "14px",
  },
  elements: {
    card:            { background: "transparent", border: "none", boxShadow: "none", padding: "0", gap: "16px" },
    headerTitle:     { display: "none" },
    headerSubtitle:  { display: "none" },
    header:          { display: "none" },
    socialButtonsBlockButton: {
      border:          "1px solid #1C2B3A",
      background:      "#07080B",
      color:           "#E8EDF3",
      borderRadius:    "2px",
      fontSize:        "11px",
      letterSpacing:   "0.08em",
      padding:         "11px",
    },
    socialButtonsBlockButtonText: {
      fontFamily:      '"JetBrains Mono", monospace',
      letterSpacing:   "0.06em",
    },
    dividerLine:     { background: "#1C2B3A" },
    dividerText:     { color: "#3D5060", fontSize: "9px", letterSpacing: "0.18em" },
    footer:          { background: "transparent", borderTop: "1px solid #1C2B3A", paddingTop: "12px", marginTop: "4px" },
    footerActionText:{ color: "#3D5060", fontSize: "11px" },
    footerActionLink:{ color: "#C8102E", fontSize: "11px" },
    formFieldInput:  { borderRadius: "2px", background: "#07080B", borderColor: "#1C2B3A" },
    formButtonPrimary: {
      borderRadius: "2px",
      background:   "#C8102E",
      fontSize:     "11px",
      letterSpacing:"0.1em",
      textTransform:"uppercase" as const,
    },
  },
};

export default function LoginPage() {
  return (
    <>
      <style>{`
        @keyframes login-scan {
          0%   { top: -4px; opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { top: 100vh; opacity: 0; }
        }
        @keyframes login-sig {
          from { opacity: 0; transform: translateX(-10px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes login-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes login-glow {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 1; }
        }
        @keyframes login-panel-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .login-sig-row {
          opacity: 0;
          animation: login-sig 0.35s ease forwards;
        }
        .login-blink { animation: login-blink 1.1s step-end infinite; }
        .login-scan-line {
          position: absolute; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent 0%, rgba(200,16,46,0.15) 20%, rgba(200,16,46,0.25) 50%, rgba(200,16,46,0.15) 80%, transparent 100%);
          animation: login-scan 10s linear infinite;
          pointer-events: none; z-index: 2;
        }
        .login-panel-in {
          animation: login-panel-in 0.5s ease both;
        }
        @media (max-width: 900px) {
          .login-left-panel { display: none !important; }
          .login-right-panel { flex: 1 !important; }
        }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: "#07080B",
        display: "flex",
        fontFamily: '"JetBrains Mono", "Courier New", monospace',
        position: "relative",
        overflow: "hidden",
      }}>

        {/* Grid overlay */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage:
            "linear-gradient(rgba(28,43,58,0.28) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(28,43,58,0.28) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }} />

        {/* Scan line */}
        <div className="login-scan-line" />

        {/* ── LEFT PANEL ───────────────────────────────────────── */}
        <div
          className="login-left-panel"
          style={{
            flex: "0 0 58%",
            borderRight: "1px solid #1C2B3A",
            padding: "52px 56px",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            overflow: "hidden",
            zIndex: 1,
          }}
        >
          {/* Radial brand glow */}
          <div style={{
            position: "absolute", top: -80, left: -80,
            width: 280, height: 280, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(200,16,46,0.10) 0%, transparent 65%)",
            animation: "login-glow 5s ease-in-out infinite",
            pointerEvents: "none",
          }} />

          {/* ─ Logo ─ */}
          <header style={{ marginBottom: 52 }} className="login-panel-in">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 3, height: 22,
                background: "#C8102E",
                transform: "skewX(-14deg)",
                borderRadius: 1, flexShrink: 0,
              }} />
              <span style={{
                fontFamily: '"Syne", system-ui, sans-serif',
                fontSize: 24, fontWeight: 800,
                color: "#E8EDF3", letterSpacing: "-0.02em",
              }}>ATLAS</span>
              <span style={{
                color: "#263D52", fontSize: 10,
                letterSpacing: "0.2em", marginLeft: 6, marginTop: 2,
              }}>AI PORTFOLIO</span>
            </div>
            <p style={{
              color: "#263D52", fontSize: 10,
              letterSpacing: "0.14em", marginLeft: 13,
            }}>
              AGENTIC INVESTMENT &amp; TRADING SYSTEM
            </p>
          </header>

          {/* ─ Status badges ─ */}
          <div style={{ display: "flex", gap: 10, marginBottom: 40 }}
            className="login-panel-in"
          >
            {([
              { label: "SYSTEM",  value: "LIVE",     color: "#00C896", dot: true },
              { label: "SIGNALS", value: "47 TODAY", color: "#E8EDF3" },
              { label: "LATENCY", value: "12ms",     color: "#E8EDF3" },
            ] as const).map(({ label, value, color, dot }) => (
              <div key={label} style={{
                border: "1px solid #1C2B3A",
                borderRadius: 2,
                padding: "5px 10px",
                fontSize: 9, letterSpacing: "0.12em",
                display: "flex", alignItems: "center", gap: 6,
                background: "rgba(12,16,22,0.6)",
              }}>
                <span style={{ color: "#3D5060" }}>{label}</span>
                <span style={{ color }}>{value}</span>
                {dot && (
                  <span style={{
                    display: "inline-block", width: 5, height: 5,
                    borderRadius: "50%", background: "#00C896",
                    animation: "pulse-live 2s ease-in-out infinite",
                  }} />
                )}
              </div>
            ))}
          </div>

          {/* ─ Signal table header ─ */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "56px 44px 1fr 60px",
            gap: "0 14px",
            padding: "8px 0",
            borderTop: "1px solid #1C2B3A",
            borderBottom: "1px solid #1C2B3A",
            marginBottom: 2,
            fontSize: 9, color: "#263D52", letterSpacing: "0.16em",
          }}>
            <span>TICKER</span>
            <span>SIG</span>
            <span>CONF</span>
            <span style={{ textAlign: "right" }}>Δ DAY</span>
          </div>

          {/* ─ Signal rows ─ */}
          {SIGNALS.map((s, i) => (
            <div
              key={s.ticker}
              className="login-sig-row"
              style={{
                animationDelay: `${0.15 + i * 0.07}s`,
                display: "grid",
                gridTemplateColumns: "56px 44px 1fr 60px",
                gap: "0 14px",
                alignItems: "center",
                padding: "9px 0",
                borderBottom: "1px solid rgba(28,43,58,0.4)",
                fontSize: 12,
              }}
            >
              <span style={{ color: "#E8EDF3", fontWeight: 600, letterSpacing: "0.02em" }}>
                {s.ticker}
              </span>
              <span style={{
                color: ACTION_COLOR[s.action],
                fontSize: 9, letterSpacing: "0.12em", fontWeight: 700,
              }}>
                {s.action}
              </span>
              <div>
                <div style={{
                  height: 2, borderRadius: 1,
                  background: "#1C2B3A", position: "relative", overflow: "hidden",
                  marginBottom: 3,
                }}>
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: `${s.conf}%`,
                    background: ACTION_COLOR[s.action],
                    borderRadius: 1, opacity: 0.75,
                  }} />
                </div>
                <span style={{ color: "#3D5060", fontSize: 9 }}>{s.conf}%</span>
              </div>
              <span style={{
                textAlign: "right",
                color: s.delta.startsWith("+") ? "#00C896" : "#FF2D55",
                fontSize: 11, fontWeight: 600,
              }}>
                {s.delta}
              </span>
            </div>
          ))}

          {/* ─ Footer ─ */}
          <div style={{ marginTop: "auto", paddingTop: 36 }}>
            <div style={{
              borderTop: "1px solid #1C2B3A",
              paddingTop: 14,
              color: "#263D52", fontSize: 9, letterSpacing: "0.12em",
            }}>
              POWERED BY GEMINI 2.5 FLASH · ALPACA PAPER TRADING · SUPABASE
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ──────────────────────────────────────── */}
        <div
          className="login-right-panel login-panel-in"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 40px",
            zIndex: 1,
            animationDelay: "0.1s",
          }}
        >
          <div style={{ width: "100%", maxWidth: 340 }}>

            {/* Terminal header bar */}
            <div style={{
              border: "1px solid #1C2B3A",
              borderBottom: "none",
              padding: "9px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#0C1016",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 9, color: "#3D5060", letterSpacing: "0.18em",
              }}>
                <div style={{
                  width: 2, height: 11,
                  background: "#C8102E",
                  transform: "skewX(-14deg)",
                }} />
                ACCESS TERMINAL
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 9, color: "#1C2B3A", letterSpacing: "0.1em" }}>v0.1.0</span>
                <span style={{
                  display: "inline-block", width: 5, height: 5,
                  borderRadius: "50%", background: "#00C896",
                  animation: "pulse-live 2s ease-in-out infinite",
                }} />
              </div>
            </div>

            {/* Clerk widget container */}
            <div style={{
              border: "1px solid #1C2B3A",
              background: "#0C1016",
              padding: "28px 22px 20px",
            }}>
              {/* Custom title above Clerk */}
              <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid #1C2B3A" }}>
                <p style={{ color: "#E8EDF3", fontSize: 13, fontWeight: 600, marginBottom: 3 }}>
                  AUTHENTICATE
                </p>
                <p style={{ color: "#3D5060", fontSize: 9, letterSpacing: "0.12em" }}>
                  SIGN IN TO CONTINUE TO ATLAS
                </p>
              </div>

              <SignIn appearance={appearance} />
            </div>

            {/* Terminal footer bar */}
            <div style={{
              border: "1px solid #1C2B3A",
              borderTop: "none",
              padding: "8px 14px",
              background: "#07080B",
              fontSize: 9, color: "#1C2B3A",
              letterSpacing: "0.1em",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <span>SECURE SESSION · TLS 1.3</span>
              <span className="login-blink" style={{ color: "#C8102E" }}>_</span>
            </div>

          </div>

          {/* Tagline */}
          <p style={{
            marginTop: 24, fontSize: 9, color: "#1C2B3A",
            letterSpacing: "0.14em", textAlign: "center",
            lineHeight: 1.8,
          }}>
            ADVISORY · CONDITIONAL · AUTONOMOUS
          </p>
        </div>

      </div>
    </>
  );
}

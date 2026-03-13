// Mock data — replace with real API calls in Phase 2

const MOCK_PORTFOLIO = {
  total_value: 107340.5,
  cash: 42180.0,
  pnl_today: 1240.3,
  pnl_total: 7340.5,
  positions: [
    { ticker: "AAPL", shares: 50, avg_cost: 172.4, current_price: 181.2, pnl: 440.0 },
    { ticker: "NVDA", shares: 20, avg_cost: 820.0, current_price: 882.5, pnl: 1250.0 },
  ],
};

const MOCK_SIGNALS = [
  {
    id: "sig-001",
    ticker: "AAPL",
    action: "BUY",
    confidence: 0.78,
    reasoning: "Strong momentum with RSI divergence on weekly timeframe.",
    boundary_mode: "advisory",
    created_at: "2026-03-13T09:00:00Z",
  },
  {
    id: "sig-002",
    ticker: "MSFT",
    action: "HOLD",
    confidence: 0.62,
    reasoning: "Consolidating at key support zone. Await volume confirmation.",
    boundary_mode: "conditional",
    created_at: "2026-03-12T14:30:00Z",
  },
  {
    id: "sig-003",
    ticker: "NVDA",
    action: "SELL",
    confidence: 0.71,
    reasoning: "Extended valuation relative to sector. Bearish divergence on daily RSI.",
    boundary_mode: "advisory",
    created_at: "2026-03-11T11:00:00Z",
  },
];

const actionColor: Record<string, string> = {
  BUY: "text-emerald-400 bg-emerald-400/10",
  SELL: "text-red-400 bg-red-400/10",
  HOLD: "text-amber-400 bg-amber-400/10",
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Dashboard() {
  const p = MOCK_PORTFOLIO;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Atlas Dashboard</h1>
          <span className="text-xs text-zinc-500 border border-zinc-800 rounded-full px-3 py-1">Paper Trading</span>
        </div>

        {/* Portfolio Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Portfolio Value", value: `$${fmt(p.total_value)}` },
            { label: "Cash", value: `$${fmt(p.cash)}` },
            { label: "Today's P&L", value: `+$${fmt(p.pnl_today)}`, positive: true },
            { label: "Total P&L", value: `+$${fmt(p.pnl_total)}`, positive: true },
          ].map((card) => (
            <div key={card.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">{card.label}</p>
              <p className={`text-lg font-semibold ${card.positive ? "text-emerald-400" : "text-white"}`}>
                {card.value}
              </p>
            </div>
          ))}
        </div>

        {/* Positions */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-4">Open Positions</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 border-b border-zinc-800">
                <th className="text-left pb-2">Ticker</th>
                <th className="text-right pb-2">Shares</th>
                <th className="text-right pb-2">Avg Cost</th>
                <th className="text-right pb-2">Current</th>
                <th className="text-right pb-2">P&L</th>
              </tr>
            </thead>
            <tbody>
              {p.positions.map((pos) => (
                <tr key={pos.ticker} className="border-b border-zinc-800/50 last:border-0">
                  <td className="py-3 font-medium">{pos.ticker}</td>
                  <td className="py-3 text-right text-zinc-400">{pos.shares}</td>
                  <td className="py-3 text-right text-zinc-400">${fmt(pos.avg_cost)}</td>
                  <td className="py-3 text-right">${fmt(pos.current_price)}</td>
                  <td className="py-3 text-right text-emerald-400">+${fmt(pos.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Signals */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-4">Latest Signals</h2>
          <div className="flex flex-col gap-3">
            {MOCK_SIGNALS.map((sig) => (
              <div key={sig.id} className="flex items-start gap-4 p-3 rounded-lg bg-zinc-800/50">
                <span className={`text-xs font-semibold px-2 py-1 rounded-md mt-0.5 ${actionColor[sig.action]}`}>
                  {sig.action}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{sig.ticker}</span>
                    <span className="text-xs text-zinc-500">{Math.round(sig.confidence * 100)}% confidence</span>
                    <span className="text-xs text-zinc-600 capitalize">{sig.boundary_mode}</span>
                  </div>
                  <p className="text-sm text-zinc-400 truncate">{sig.reasoning}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

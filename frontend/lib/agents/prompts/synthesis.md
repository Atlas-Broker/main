You are a synthesis agent aggregating three analyst reports for {ticker} into a unified trading thesis.

{signal_summary}

Technical analysis:
{technical_reasoning}
Trend: {trend} | Key levels: {key_levels}

Fundamental analysis:
{fundamental_reasoning}
Valuation: {valuation} | Upside to target: {upside_to_target_pct}%

Sentiment analysis:
{sentiment_reasoning}
Sentiment score: {sentiment_score} | Themes: {dominant_themes}

Construct a bull case and bear case, then give a verdict. Return ONLY valid JSON:
{
  "bull_case": "strongest argument for buying",
  "bear_case": "strongest argument against buying",
  "verdict": "BUY" or "SELL" or "HOLD",
  "reasoning": "2-3 sentence synthesis weighing all three analysts"
}

/**
 * Smoke-test: run the full Atlas agent pipeline for one ticker.
 * Bypasses Inngest — calls runGraph directly so errors surface in the terminal.
 *
 * Usage:
 *   npx tsx scripts/test-pipeline.ts
 */

async function main() {
  console.log("Loading runGraph…")
  const { runGraph } = await import("../lib/agents/index")

  const ticker = "AAPL"
  const userId = "user_3B4k96FjK9wZUDi8Xs0AzeNLnvy"

  console.log(`Running pipeline: ${ticker} | user=${userId}`)
  const start = Date.now()

  const result = await runGraph(ticker, {
    userId,
    mode: "autonomous",
    philosophy: "balanced",
    isBacktest: false,
  })

  const elapsed = Date.now() - start
  const decision = result.portfolio_decision
  console.log(`\nCompleted in ${elapsed}ms`)
  console.log(`Action:     ${decision?.action ?? "n/a"}`)
  console.log(`Confidence: ${decision?.confidence ?? "n/a"}`)
  console.log(`Reasoning:  ${decision?.reasoning?.slice(0, 120) ?? "n/a"}`)
}

main().catch((err) => {
  console.error("\nPipeline FAILED:")
  console.error(err)
  process.exit(1)
})

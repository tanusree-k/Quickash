/**
 * 🚀 AI Auto-Haggler — 30-Second Demo
 * 
 * Runs the full M2M negotiation flow live in the terminal.
 * Shows: browse → bid → reputation check → discount → x402 payment
 */

import { createServer } from 'http'
import { navigate } from './buyer.js'
import { SELLER_PORT } from './config.js'

// Helper to wait
const sleep = ms => new Promise(r => setTimeout(r, ms))

function banner(text) {
  const line = '═'.repeat(text.length + 4)
  console.log(`\n╔${line}╗`)
  console.log(`║  ${text}  ║`)
  console.log(`╚${line}╝\n`)
}

async function waitForSeller(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      await fetch(`http://localhost:${SELLER_PORT}/listings`)
      return true
    } catch { await sleep(500) }
  }
  return false
}

async function runDemo() {
  banner('🚀 AI Auto-Haggler — M2M Marketplace Demo')

  console.log('Starting Seller Agent...')
  const { default: sellerModule } = await import('./seller.js')
  await waitForSeller()

  await sleep(500)

  // ── SCENARIO 1: Trusted buyer (5-star ERC-8004 rep) ──────────
  banner('Scenario 1: Trusted Buyer (5-star ERC-8004 rep)')
  console.log('User: "Buy the GPT-4 Prompt, budget is 0.4 USDC"')
  console.log('Buyer agent: analyzing market, checking own reputation...\n')
  await sleep(1000)

  const result1 = await navigate({
    itemId: 'prompt-001',
    budget: 400000,       // 0.4 USDC budget
    mockReputation: 'trusted',
  })

  if (result1.result === 'accepted') {
    console.log(`\n🎉 DEAL CLOSED at ${result1.amountUsdc} USDC`)
    if (result1.reputationBonus > 0) {
      console.log(`   ERC-8004 discount applied: ${result1.reputationBonus}%`)
      console.log(`   ★ Trust = money. On-chain reputation pays off.`)
    }
  }

  await sleep(1500)

  // ── SCENARIO 2: Unknown buyer (no ERC-8004 identity) ─────────
  banner('Scenario 2: Unknown Buyer (no ERC-8004 identity)')
  console.log('User: "Buy the same prompt, budget is 0.4 USDC"')
  console.log('Buyer agent: no on-chain identity...\n')
  await sleep(1000)

  const result2 = await navigate({
    itemId: 'prompt-001',
    budget: 400000,
    mockReputation: 'newbie',
  })

  if (result2.result === 'failed') {
    console.log(`\n🚶 No deal — ${result2.reason}`)
    console.log(`   No ERC-8004 reputation = no discount = budget too low`)
    console.log(`   💡 Register on ERC-8004 and build reputation to unlock better prices!`)
  }

  await sleep(1500)

  // ── SCENARIO 3: Budget is king ────────────────────────────────
  banner('Scenario 3: Average Buyer with Higher Budget')
  console.log('User: "Buy the Data Set, budget is 0.9 USDC"')
  console.log('Buyer agent: 4-star reputation, big budget...\n')
  await sleep(1000)

  const result3 = await navigate({
    itemId: 'data-001',
    budget: 900000,
    mockReputation: 'average',
  })

  console.log(result3.result === 'accepted'
    ? `\n🎉 DEAL at ${result3.amountUsdc} USDC`
    : `\n🚶 No deal — ${result3.reason}`)

  // ── Summary ───────────────────────────────────────────────────
  banner('📊 Demo Complete')
  console.log('What just happened:')
  console.log()
  console.log('1. Buyer Agent browsed the marketplace')
  console.log('2. Sent offers via x402 (HTTP negotiation protocol)')
  console.log('3. Seller checked buyer ERC-8004 reputation on GOAT Network')
  console.log('4. Trusted buyers got automatic discounts')
  console.log('5. Payment settled on-chain via USDC (GOAT Testnet3)')
  console.log()
  console.log('The Stack:')
  console.log('  ERC-8004  → "Who is this buyer? Trust them?" (Identity + Reputation)')
  console.log('  x402      → "How do they pay?" (HTTP 402 + USDC on GOAT Network)')
  console.log('  OpenClaw  → "Should I accept this price?" (Negotiation brain)')
  console.log()
  console.log('🐐 Built on GOAT Network — the Bitcoin L2 for the Agent Economy')
  console.log('   Chain ID: 48816 | explorer.testnet3.goat.network')
  console.log()
  process.exit(0)
}

// Patch import for demo runner
async function navigate(opts) {
  const { negotiate } = await import('./buyer.js')
  return negotiate(opts)
}

runDemo().catch(err => {
  console.error('Demo error:', err.message)
  process.exit(1)
})

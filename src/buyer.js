/**
 * 🤖 Buyer Agent
 * 
 * Autonomous buyer that:
 * - Browses listings
 * - Uses LLM to decide negotiation strategy (or falls back to heuristic)
 * - Knows its own budget cap
 * - Uses ERC-8004 identity to get reputation discounts
 */

import { SELLER_PORT, BUYER_PORT } from './config.js'
import { generateNegotiationStrategy } from './llm-utils.js'

const SELLER = `http://localhost:${SELLER_PORT}`

/**
 * Core negotiation logic — LLM-powered with heuristic fallback
 */
async function negotiate({
  itemId,
  budget,           // max willing to pay (wei)
  agentId = null,   // ERC-8004 agent ID (gets us discounts)
  mockReputation = 'trusted',  // for demo: 'trusted' | 'average' | 'newbie'
  fromAddress = '0x2612567DFf7B6e03340d153F83a7Ca899c0b6299',
}) {
  console.log(`\n🤖 Buyer starting negotiation for item: ${itemId}`)
  console.log(`   Budget: ${budget / 1e6} USDC | Agent ID: ${agentId ?? 'none (no ERC-8004)'}`)
  console.log()

  // Step 1: Get base price
  const listing = await fetch(`${SELLER}/listings/${itemId}`).then(r => r.json())
  if (listing.error) throw new Error(listing.error)

  console.log(`📋 Listing: "${listing.name}" — base price: ${listing.basePrice / 1e6} USDC`)

  const basePrice = listing.basePrice
  const maxRounds = 5
  let offer = null
  let lastCounter = null
  let round = 0

  while (round < maxRounds) {
    round++

    // ── LLM Strategy (or heuristic fallback) ─────────────────
    let strategy
    if (process.env.GOOGLE_API_KEY) {
      try {
        strategy = await generateNegotiationStrategy({
          productName: listing.name,
          basePrice,
          minPrice: listing.minPrice || Math.floor(basePrice * 0.6),
          budget,
          currentOffer: offer,
          sellerCounter: lastCounter,
          round,
          maxRounds,
          reputationTier: mockReputation,
        })
        console.log(`\n🧠 LLM Strategy (Round ${round}): ${strategy.reasoning}`)

        // If LLM says accept the counter and counter is within budget
        if (strategy.shouldAcceptCounter && lastCounter && lastCounter <= budget) {
          offer = lastCounter
          console.log(`💬 Round ${round}: Accepting counter at ${offer / 1e6} USDC`)
        } else {
          offer = Math.min(strategy.nextOffer, budget)
          console.log(`💬 Round ${round}: Offering ${offer / 1e6} USDC`)
        }
      } catch (err) {
        console.warn(`[buyer] LLM strategy failed, using heuristic: ${err.message}`)
        strategy = null
      }
    }

    // Heuristic fallback
    if (!strategy) {
      if (!offer) {
        offer = Math.floor(basePrice * 0.6) // start at 60%
      } else if (lastCounter && lastCounter <= budget) {
        offer = lastCounter // accept counter if within budget
      } else {
        offer = Math.min(Math.floor(offer * 1.1), budget) // increment 10%
      }
      console.log(`\n💬 Round ${round} (heuristic): Offering ${offer / 1e6} USDC...`)
    }

    // ── Send offer to seller ─────────────────────────────────
    const response = await fetch(`${SELLER}/negotiate/${itemId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-From-Address': fromAddress },
      body: JSON.stringify({
        offeredPrice: offer,
        buyerAgentId: agentId,
        budgetCap: budget,
        useMockReputation: mockReputation,
      }),
    })

    const data = await response.json()

    if (data.result === 'rejected') {
      console.log(`❌ Rejected: ${data.reason}`)
      return { result: 'failed', reason: 'price too low', minPrice: data.minPrice }
    }

    if (data.result === 'accepted') {
      console.log(`\n✅ DEAL! Seller accepted ${offer / 1e6} USDC`)
      if (data.reputationTier !== 'unknown') {
        console.log(`🌟 Reputation bonus: ${data.discountApplied}% off (${data.reputationTier} buyer)`)
      }
      console.log(`📨 Seller says: "${data.message}"`)

      return {
        result: 'accepted',
        orderId: data.orderId,
        payToAddress: data.payToAddress,
        amountWei: data.amountWei,
        amountUsdc: data.amountUsdc,
        reputationBonus: data.discountApplied,
      }
    }

    if (data.result === 'counter') {
      console.log(`🔄 Counter-offer: ${data.counterOfferUsdc} USDC`)
      console.log(`   Seller: "${data.message}"`)
      lastCounter = data.counterOffer

      if (data.counterOffer > budget) {
        console.log(`\n🚶 Walk away — counter ${data.counterOfferUsdc} USDC exceeds budget ${budget / 1e6} USDC`)
        return { result: 'failed', reason: 'exceeds budget', counterOffer: data.counterOffer }
      }
    }
  }

  return { result: 'failed', reason: 'max rounds reached' }
}

export { negotiate }

// Run as standalone buyer demo
if (process.argv[1].includes('buyer.js')) {
  const itemId = process.argv[2] || 'prompt-001'
  const budget = parseInt(process.argv[3] || '400000')
  const scenario = process.argv[4] || 'trusted'

  negotiate({ itemId, budget, mockReputation: scenario })
    .then(result => {
      console.log('\n📊 Negotiation result:', JSON.stringify(result, null, 2))
    })
    .catch(console.error)
}


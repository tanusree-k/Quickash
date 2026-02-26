/**
 * 🤖 Buyer Agent
 * 
 * Autonomous buyer that:
 * - Browses listings
 * - Bids strategically (start low, increment)
 * - Knows its own budget cap
 * - Uses ERC-8004 identity to get reputation discounts
 */

import { SELLER_PORT, BUYER_PORT } from './config.js'

const SELLER = `http://localhost:${SELLER_PORT}`

/**
 * Core negotiation logic — the "brain" (OpenClaw powers this in the full stack)
 * 
 * Strategy:
 * - Start at 60% of base price
 * - Increment by 10% each round
 * - Walk away if counter > budget
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
  let offer = Math.floor(basePrice * 0.6)  // start at 60%
  let round = 0

  while (round < 5) {
    round++
    console.log(`\n💬 Round ${round}: Offering ${offer / 1e6} USDC...`)

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
      console.log(`   Walk-away. Min was ${data.minPrice / 1e6} USDC.`)
      return { result: 'failed', reason: 'price too low', minPrice: data.minPrice }
    }

    if (data.result === 'accepted') {
      // Seller accepted! We get HTTP 402 with payment details
      console.log(`\n✅ DEAL! Seller accepted ${offer / 1e6} USDC`)
      if (data.reputationTier !== 'unknown') {
        console.log(`🌟 Reputation bonus: ${data.discountApplied}% off (${data.reputationTier} buyer)`)
      }
      console.log(`📨 Seller says: "${data.message}"`)
      console.log()
      console.log(`💳 x402 Payment Required:`)
      console.log(`   Order ID:     ${data.orderId}`)
      console.log(`   Pay to:       ${data.payToAddress}`)
      console.log(`   Amount:       ${data.amountUsdc} USDC`)
      console.log(`   Chain:        ${data.chainId}`)
      console.log()
      console.log(`   To pay (cast):`)
      console.log(`   cast send 0x29d1ee93e9ecf6e50f309f498e40a6b42d352fa1 \\`)
      console.log(`     "transfer(address,uint256)" ${data.payToAddress} ${data.amountWei} \\`)
      console.log(`     --rpc-url https://rpc.testnet3.goat.network \\`)
      console.log(`     --priority-gas-price 130000 --gas-price 1000000 \\`)
      console.log(`     --private-key $BUYER_PK`)
      console.log()

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

      if (data.counterOffer > budget) {
        console.log(`\n🚶 Walk away — counter ${data.counterOfferUsdc} USDC exceeds budget ${budget / 1e6} USDC`)
        return { result: 'failed', reason: 'exceeds budget', counterOffer: data.counterOffer }
      }

      // Accept if counter is within budget; else increment our offer
      if (data.counterOffer <= budget) {
        offer = data.counterOffer  // meet seller's counter if within budget
      } else {
        offer = Math.min(Math.floor(offer * 1.1), budget)  // increment 10%
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

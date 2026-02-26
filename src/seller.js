/**
 * 🏪 Seller Agent
 * 
 * Sells digital assets (AI prompts, data, compute).
 * - Lists items with base prices
 * - Accepts negotiation offers via x402
 * - Checks buyer's ERC-8004 reputation
 * - Auto-discounts for trusted buyers
 */

import express from 'express'
import { GoatX402Client } from 'goatx402-sdk-server'
import { CHAIN_ID, USDC, SELLER_PORT, seller as sellerCreds, ADMIN_URL } from './config.js'
import { getReputation, mockReputation } from './reputation.js'

const app = express()
app.use(express.json())

const x402 = new GoatX402Client({
  baseUrl:   ADMIN_URL,
  apiKey:    sellerCreds.apiKey,
  apiSecret: sellerCreds.apiSecret,
})

// ── Catalogue ─────────────────────────────────────────────────
const LISTINGS = {
  'prompt-001': {
    id: 'prompt-001',
    name: 'GPT-4 Jailbreak Prompt v3',
    description: 'Advanced system prompt for unrestricted outputs',
    basePrice: 500000,   // 0.5 USDC
    minPrice:  200000,   // 0.2 USDC (walk-away)
    category: 'prompt',
  },
  'data-001': {
    id: 'data-001',
    name: 'Crypto Twitter Sentiment Dataset (7 days)',
    description: '50k tweets, labeled, JSON format',
    basePrice: 1000000,  // 1.0 USDC
    minPrice:  600000,   // 0.6 USDC
    category: 'data',
  },
  'compute-001': {
    id: 'compute-001',
    name: '1hr GPU Slot (A100)',
    description: 'Reserved compute, available now',
    basePrice: 2000000,  // 2.0 USDC
    minPrice:  1500000,  // 1.5 USDC
    category: 'compute',
  },
}

// Track active negotiations
const negotiations = new Map()

// ── Routes ────────────────────────────────────────────────────

// List all items
app.get('/listings', (req, res) => {
  res.json({
    seller: '🏪 GoatX402 Marketplace Seller',
    items: Object.values(LISTINGS).map(item => ({
      ...item,
      basePriceUsdc: item.basePrice / 1e6,
      hint: `POST /negotiate/${item.id} to start haggling`,
    })),
  })
})

// Get single item
app.get('/listings/:id', (req, res) => {
  const item = LISTINGS[req.params.id]
  if (!item) return res.status(404).json({ error: 'Item not found' })
  res.json({ ...item, basePriceUsdc: item.basePrice / 1e6 })
})

/**
 * Negotiate — buyer proposes a price
 * Body: { offeredPrice: 300000, buyerAgentId: 42, budgetCap: 500000 }
 * 
 * Seller checks:
 * 1. Is the offer above min price?
 * 2. What's the buyer's ERC-8004 reputation?
 * 3. Counter-offer or accept
 */
app.post('/negotiate/:id', async (req, res) => {
  const item = LISTINGS[req.params.id]
  if (!item) return res.status(404).json({ error: 'Item not found' })

  const { offeredPrice, buyerAgentId, budgetCap, useMockReputation } = req.body

  console.log(`\n[seller] 📨 Offer received for "${item.name}"`)
  console.log(`         Offered: ${offeredPrice / 1e6} USDC | Base: ${item.basePrice / 1e6} USDC`)

  // Step 1: Check buyer reputation (ERC-8004)
  let rep
  if (useMockReputation) {
    // Demo mode — use simulated reputation
    rep = mockReputation(useMockReputation)
    console.log(`[seller] 🔍 Reputation (mock): ${rep.tier} — ${rep.score ?? 'no score'} (${rep.feedbackCount} reviews)`)
  } else if (buyerAgentId != null) {
    rep = await getReputation(buyerAgentId)
    console.log(`[seller] 🔍 Reputation (on-chain): ${rep.tier} — ${rep.score ?? 'no score'} (${rep.feedbackCount} reviews)`)
  } else {
    rep = { tier: 'unknown', discount: 0, score: null, feedbackCount: 0 }
  }

  // Step 2: Calculate discounted price based on reputation
  const discountedPrice = Math.floor(item.basePrice * (1 - rep.discount / 100))

  console.log(`[seller] 💰 Discount: ${rep.discount}% → floor price: ${discountedPrice / 1e6} USDC`)

  // Step 3: Negotiation logic
  if (offeredPrice < item.minPrice) {
    // Below walk-away — reject
    console.log(`[seller] ❌ Offer too low (below min ${item.minPrice / 1e6} USDC)`)
    return res.json({
      result: 'rejected',
      reason: `Minimum I'll accept is ${item.minPrice / 1e6} USDC. Walk away price.`,
      item: item.id,
      offeredPrice,
      minPrice: item.minPrice,
    })
  }

  // Also accept if offer is within 2% of discounted floor
  const closeEnough = offeredPrice >= discountedPrice * 0.98
  if (offeredPrice >= discountedPrice || closeEnough) {
    // Offer meets or beats discounted price — ACCEPT, create x402 order
    console.log(`[seller] ✅ Offer accepted! Creating x402 payment order...`)

    const fromAddress = req.headers['x-from-address'] || '0x0000000000000000000000000000000000000000'
    let order
    try {
      order = await x402.createOrder({
        dappOrderId:   `haggle-${item.id}-${Date.now()}`,
        chainId:       CHAIN_ID,
        tokenSymbol:   'USDC',
        tokenContract: USDC,
        fromAddress,
        amountWei:     offeredPrice.toString(),
      })
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create payment order', details: err.message })
    }

    negotiations.set(order.orderId, { item, offeredPrice, rep, buyerAgentId })

    const reputationNote = rep.discount > 0
      ? `Since you're a trusted buyer (${rep.tier}), I'll take ${offeredPrice / 1e6} USDC. 🤝`
      : `Deal at ${offeredPrice / 1e6} USDC.`

    return res.status(402).json({
      result:         'accepted',
      message:        reputationNote,
      reputationTier: rep.tier,
      discountApplied: rep.discount,
      // x402 payment details
      orderId:        order.orderId,
      payToAddress:   order.payToAddress,
      amountWei:      offeredPrice,
      amountUsdc:     offeredPrice / 1e6,
      chainId:        CHAIN_ID,
      flow:           order.flow,
      instructions:   `Pay ${offeredPrice / 1e6} USDC on-chain, then POST /confirm/${order.orderId}`,
    })
  }

  // Counter-offer — midpoint between offer and discounted price
  const counterOffer = Math.floor((offeredPrice + discountedPrice) / 2)

  const repNote = rep.discount > 0
    ? `I see you have a ${rep.tier} reputation — I can go as low as ${discountedPrice / 1e6} USDC.`
    : `No discount for unknown buyers.`

  console.log(`[seller] 🔄 Counter-offer: ${counterOffer / 1e6} USDC`)

  return res.json({
    result:         'counter',
    message:        `${repNote} How about ${counterOffer / 1e6} USDC?`,
    counterOffer,
    counterOfferUsdc: counterOffer / 1e6,
    discountedFloor: discountedPrice,
    reputationTier:  rep.tier,
    discountApplied: rep.discount,
    hint:           `POST /negotiate/${item.id} with offeredPrice: ${counterOffer}`,
  })
})

// Confirm payment after on-chain tx
app.post('/confirm/:orderId', async (req, res) => {
  const neg = negotiations.get(req.params.orderId)
  if (!neg) return res.status(404).json({ error: 'Negotiation not found' })

  try {
    const status = await x402.getOrderStatus(req.params.orderId)

    if (status.status === 'PAYMENT_CONFIRMED' || status.status === 'INVOICED') {
      console.log(`[seller] 💸 Payment confirmed! Delivering "${neg.item.name}"`)
      negotiations.delete(req.params.orderId)

      return res.json({
        result:    'delivered',
        item:      neg.item,
        paidUsdc:  neg.offeredPrice / 1e6,
        txHash:    status.txHash,
        message:   `✅ Here's your "${neg.item.name}". Thanks for the business!`,
        // In a real app, this is where you'd return the actual asset
        asset:     { url: `https://assets.goat.network/demo/${neg.item.id}`, expiresIn: '1h' },
      })
    }

    return res.json({ result: 'pending', status: status.status, orderId: req.params.orderId })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

app.listen(SELLER_PORT, () => {
  console.log(`\n🏪 Seller Agent on :${SELLER_PORT}`)
  console.log(`   GET  /listings        → browse items`)
  console.log(`   POST /negotiate/:id   → haggle`)
  console.log(`   POST /confirm/:order  → confirm payment\n`)
})

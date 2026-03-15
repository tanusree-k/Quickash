/**
 * 🏪 Seller Agent + Web Server
 * 
 * Serves the Quickash marketplace:
 * - Web UI (static files from /public)
 * - REST API (/api/*)
 * - Negotiation endpoints (/negotiate, /confirm)
 * - Dynamic product catalogue from products.js
 */

import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { CHAIN_ID, USDC, SELLER_PORT, seller as sellerCreds, ADMIN_URL } from './config.js'
import { getReputation, mockReputation } from './reputation.js'
import { getProduct, getAllProducts, seedDemoProducts, updateProductStatus } from './products.js'
import apiRouter, { recordTransaction } from './api.js'

import { X402Client } from './x402-client.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
app.use(express.json({ limit: '10mb' }))

// ── Serve static web UI ──────────────────────────────────────
app.use(express.static(join(__dirname, '..', 'public')))

// ── Mount API router ─────────────────────────────────────────
app.use('/api', apiRouter)

// ── x402 Client ──────────────────────────────────────────────
let x402 = null
try {
  x402 = new X402Client({
    baseUrl:    ADMIN_URL,
    apiKey:     sellerCreds.apiKey,
    apiSecret:  sellerCreds.apiSecret,
    merchantId: sellerCreds.merchantId,
  })
  console.log('[seller] ✅ x402 client initialized (direct HTTP)')
} catch (err) {
  console.warn('[seller] ⚠️  x402 client failed to init:', err.message)
}

// Track active negotiations
const negotiations = new Map()

// ── Seed demo products ───────────────────────────────────────
seedDemoProducts()

// ── Routes ────────────────────────────────────────────────────

// List all items (backwards-compatible with original demo)
app.get('/listings', (req, res) => {
  const products = getAllProducts()
  res.json({
    seller: '🏪 Quickash Secondhand Marketplace',
    items: products.map(item => ({
      ...item,
      basePriceUsdc: item.basePrice / 1e6,
      hint: `POST /negotiate/${item.id} to start haggling`,
    })),
  })
})

// Get single item
app.get('/listings/:id', (req, res) => {
  const item = getProduct(req.params.id)
  if (!item) return res.status(404).json({ error: 'Item not found' })
  res.json({ ...item, basePriceUsdc: item.basePrice / 1e6 })
})

/**
 * Negotiate — buyer proposes a price
 * Body: { offeredPrice: 300000, buyerAgentId: 42, budgetCap: 500000 }
 */
app.post('/negotiate/:id', async (req, res) => {
  const item = getProduct(req.params.id)
  if (!item) return res.status(404).json({ error: 'Item not found' })

  const { offeredPrice, buyerAgentId, budgetCap, useMockReputation } = req.body

  console.log(`\n[seller] 📨 Offer received for "${item.name}"`)
  console.log(`         Offered: ${offeredPrice / 1e6} USDC | Base: ${item.basePrice / 1e6} USDC`)

  // Step 1: Check buyer reputation (ERC-8004)
  let rep
  if (useMockReputation) {
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
    console.log(`[seller] ❌ Offer too low (below min ${item.minPrice / 1e6} USDC)`)
    return res.json({
      result: 'rejected',
      reason: `Minimum I'll accept is ${item.minPrice / 1e6} USDC. Walk away price.`,
      item: item.id,
      offeredPrice,
      minPrice: item.minPrice,
    })
  }

  const closeEnough = offeredPrice >= discountedPrice * 0.98
  if (offeredPrice >= discountedPrice || closeEnough) {
    console.log(`[seller] ✅ Offer accepted! Creating x402 payment order...`)

    const fromAddress = req.headers['x-from-address'] || '0x0000000000000000000000000000000000000000'

    // Try real x402 order, fall back to mock
    let order
    if (x402) {
      try {
        order = await x402.createOrder({
          dappOrderId:   `quickash-${item.id}-${Date.now()}`,
          chainId:       CHAIN_ID,
          tokenSymbol:   'USDC',
          tokenContract: USDC,
          fromAddress,
          amountWei:     offeredPrice.toString(),
        })
      } catch (err) {
        console.warn('[seller] x402 order failed:', err.message)
        order = null
      }
    }

    // Mock order if x402 unavailable
    if (!order) {
      order = {
        orderId: `mock-${Date.now()}`,
        payToAddress: '0x2612567DFf7B6e03340d153F83a7Ca899c0b6299',
        flow: 'demo',
      }
    }

    negotiations.set(order.orderId, { item, offeredPrice, rep, buyerAgentId })

    // Record the transaction
    recordTransaction({
      orderId: order.orderId,
      productId: item.id,
      productName: item.name,
      price: offeredPrice,
      priceUsdc: offeredPrice / 1e6,
      buyerRep: rep.tier,
      discount: rep.discount,
      timestamp: new Date().toISOString(),
      status: 'pending_payment',
    })

    const reputationNote = rep.discount > 0
      ? `Since you're a trusted buyer (${rep.tier}), I'll take ${offeredPrice / 1e6} USDC. 🤝`
      : `Deal at ${offeredPrice / 1e6} USDC.`

    return res.status(402).json({
      result:         'accepted',
      message:        reputationNote,
      reputationTier: rep.tier,
      discountApplied: rep.discount,
      orderId:        order.orderId,
      payToAddress:   order.payToAddress,
      amountWei:      offeredPrice,
      amountUsdc:     offeredPrice / 1e6,
      chainId:        CHAIN_ID,
      flow:           order.flow,
      instructions:   `Pay ${offeredPrice / 1e6} USDC on-chain, then POST /confirm/${order.orderId}`,
    })
  }

  // Counter-offer
  const counterOffer = Math.floor((offeredPrice + discountedPrice) / 2)
  const repNote = rep.discount > 0
    ? `I see you have a ${rep.tier} reputation — I can go as low as ${discountedPrice / 1e6} USDC.`
    : `No discount for unknown buyers.`

  console.log(`[seller] 🔄 Counter-offer: ${counterOffer / 1e6} USDC`)

  return res.json({
    result:          'counter',
    message:         `${repNote} How about ${counterOffer / 1e6} USDC?`,
    counterOffer,
    counterOfferUsdc: counterOffer / 1e6,
    discountedFloor:  discountedPrice,
    reputationTier:   rep.tier,
    discountApplied:  rep.discount,
    hint:            `POST /negotiate/${item.id} with offeredPrice: ${counterOffer}`,
  })
})

// Confirm payment after on-chain tx
app.post('/confirm/:orderId', async (req, res) => {
  const neg = negotiations.get(req.params.orderId)
  if (!neg) return res.status(404).json({ error: 'Negotiation not found' })

  // For mock orders, auto-confirm
  if (req.params.orderId.startsWith('mock-')) {
    console.log(`[seller] 💸 Payment confirmed (demo)! Delivering "${neg.item.name}"`)
    negotiations.delete(req.params.orderId)
    updateProductStatus(neg.item.id, 'sold')

    return res.json({
      result:    'delivered',
      item:      neg.item,
      paidUsdc:  neg.offeredPrice / 1e6,
      txHash:    '0xdemo_' + Date.now().toString(16),
      message:   `✅ Here's your "${neg.item.name}". Thanks for the business!`,
    })
  }

  if (!x402) return res.status(500).json({ error: 'x402 not available' })

  try {
    const status = await x402.getOrderStatus(req.params.orderId)

    if (status.status === 'PAYMENT_CONFIRMED' || status.status === 'INVOICED') {
      console.log(`[seller] 💸 Payment confirmed! Delivering "${neg.item.name}"`)
      negotiations.delete(req.params.orderId)
      updateProductStatus(neg.item.id, 'sold')

      return res.json({
        result:    'delivered',
        item:      neg.item,
        paidUsdc:  neg.offeredPrice / 1e6,
        txHash:    status.txHash,
        message:   `✅ Here's your "${neg.item.name}". Thanks for the business!`,
      })
    }

    return res.json({ result: 'pending', status: status.status, orderId: req.params.orderId })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ── Start Server ─────────────────────────────────────────────
app.listen(SELLER_PORT, () => {
  console.log(`\n${'═'.repeat(55)}`)
  console.log(`  🏪 Quickash — Secondhand Marketplace`)
  console.log(`${'═'.repeat(55)}`)
  console.log(`  🌐 Web UI:    http://localhost:${SELLER_PORT}`)
  console.log(`  📡 API:       http://localhost:${SELLER_PORT}/api`)
  console.log(`  📋 Listings:  http://localhost:${SELLER_PORT}/listings`)
  console.log(`  ⛓️  Chain:     GOAT Testnet3 (${CHAIN_ID})`)
  console.log(`${'═'.repeat(55)}\n`)
})

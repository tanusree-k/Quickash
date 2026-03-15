/**
 * 🌐 Web API Router
 * 
 * REST endpoints for the Quickash web frontend.
 * Handles product CRUD, seller/buyer chat, and negotiation triggers.
 */

import { Router } from 'express'
import { addProduct, getProduct, getAllProducts, searchProducts, updateProductStatus } from './products.js'
import { analyzeProduct, generateSellerResponse } from './ai-analyzer.js'
import { getReputation, mockReputation } from './reputation.js'
import { negotiate as runNegotiation } from './buyer.js'
import { generateAgentChat } from './llm-utils.js'

const router = Router()

// Track chat histories for LLM context
const chatHistories = new Map()

// ── Authentication ────────────────────────────────────────────
import crypto from 'crypto'

const users = new Map() // In-memory user store: email -> { id, email, passwordHash, name }

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex')
}

router.post('/auth/signup', (req, res) => {
  const { email, password, name, phone, address } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }
  if (users.has(email)) {
    return res.status(409).json({ error: 'An account with this email already exists' })
  }

  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash: hashPassword(password),
    name: name || email.split('@')[0],
    phone,
    address,
    picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(name || email.split('@')[0])}&background=009688&color=fff`,
    createdAt: new Date().toISOString(),
  }

  users.set(email, user)
  console.log(`[auth] ✅ New user registered: ${user.name} (${user.email})`)

  res.json({ id: user.id, email: user.email, name: user.name, picture: user.picture })
})

router.post('/auth/login', (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  const user = users.get(email)
  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  console.log(`[auth] ✅ User logged in: ${user.name} (${user.email})`)
  res.json({ id: user.id, email: user.email, name: user.name, picture: user.picture })
})

// ── Config API ───────────────────────────────────────────────

router.get('/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseKey: process.env.SUPABASE_ANON_KEY || ''
  })
})

// ── Product Endpoints ────────────────────────────────────────

// List all products (with optional search)
router.get('/products', (req, res) => {
  const { query, category, condition, maxPrice } = req.query
  const products = (query || category || condition || maxPrice)
    ? searchProducts({ query, category, condition, maxPrice })
    : getAllProducts()

  res.json({
    count: products.length,
    products: products.map(p => ({
      ...p,
      basePriceUsdc: p.basePrice / 1e6,
      minPriceUsdc: p.minPrice / 1e6,
      photos: p.photos.length > 0 ? [`/api/products/${p.id}/photo`] : [],
    })),
  })
})

// Get single product
router.get('/products/:id', (req, res) => {
  const product = getProduct(req.params.id)
  if (!product) return res.status(404).json({ error: 'Product not found' })
  res.json({ ...product, basePriceUsdc: product.basePrice / 1e6 })
})

// Create new product (seller uploads)
router.post('/products', async (req, res) => {
  const { name, description, photo, basePrice, minPrice, category, condition } = req.body

  // AI analysis
  const analysis = await analyzeProduct(description || name, photo || null)

  const product = addProduct({
    name: name || `Product #${Date.now()}`,
    description: description || 'No description provided',
    category: category || analysis.category,
    condition: condition || analysis.condition,
    photos: photo ? [photo] : [],
    basePrice: basePrice || analysis.suggestedPrice,
    minPrice: minPrice || analysis.minPrice,
    sellerId: req.body.sellerId || 'web-seller',
    aiAnalysis: analysis,
  })

  res.status(201).json({
    message: `✅ Listed "${product.name}" at ${product.basePrice / 1e6} USDC`,
    product: { ...product, basePriceUsdc: product.basePrice / 1e6 },
    analysis,
  })
})

// ── Seller Chat ──────────────────────────────────────────────

const sellerConversations = new Map()

router.post('/seller/chat', async (req, res) => {
  const { message, sessionId = 'default', photo } = req.body
  const session = sellerConversations.get(sessionId) || { step: 'greeting', data: {} }

  // Manage history
  if (!chatHistories.has(sessionId)) chatHistories.set(sessionId, [])
  const history = chatHistories.get(sessionId)

  let response

  // If LLM available, use it for conversational nuance
  if (process.env.GOOGLE_API_KEY && session.step !== 'greeting' && session.step !== 'confirm_listing') {
    try {
      const llmResponse = await generateAgentChat({
        role: 'selling',
        context: { step: session.step, ...session.data },
        message,
        history
      })
      history.push({ role: 'user', text: message })
      history.push({ role: 'assistant', text: llmResponse })

      // Basic step progression based on keywords in LLM response or message
      // Note: In a production app, we might use LLM tool calling here.
      if (session.step === 'awaiting_product' && (message.length > 10 || photo)) {
         const analysis = await analyzeProduct(message, photo || null)
         session.data.description = message
         session.data.analysis = analysis
         session.data.name = analysis.name || extractProductName(message)
         session.step = 'confirm_listing'
         
         // Inject the formal analysis into the LLM context for next message
         const resp = generateSellerResponse(analysis, session.data.name)
         response = { message: resp.message, analysis: resp.analysis, step: 'confirm_listing' }
         sellerConversations.set(sessionId, session)
         return res.json(response)
      }

      response = { message: llmResponse, step: session.step }
      sellerConversations.set(sessionId, session)
      return res.json(response)
    } catch (err) {
      console.warn('[api] LLM chat failed, falling back to static:', err.message)
    }
  }

  // Fallback to static logic
  switch (session.step) {
    case 'greeting':
      response = {
        message: `👋 Welcome to Quickash! I'm your selling assistant.\n\nTell me about the product you want to sell, or upload a photo and I'll analyze it for you!`,
        step: 'awaiting_product',
      }
      session.step = 'awaiting_product'
      break

    case 'awaiting_product': {
      const analysis = await analyzeProduct(message, photo || null)
      session.data.description = message
      session.data.analysis = analysis
      session.data.name = analysis.name || extractProductName(message)

      const resp = generateSellerResponse(analysis, session.data.name)
      response = {
        message: resp.message,
        analysis: resp.analysis,
        step: 'confirm_listing',
      }
      session.step = 'confirm_listing'
      break
    }

    case 'confirm_listing': {
      const msg = message.toLowerCase()
      if (msg.includes('yes') || msg.includes('list') || msg.includes('confirm') || msg.includes('ok') || msg.includes('sure')) {
        // Create the listing
        const product = addProduct({
          name: session.data.name,
          description: session.data.description,
          category: session.data.analysis.category,
          condition: session.data.analysis.condition,
          photos: photo ? [photo] : [],
          basePrice: session.data.analysis.suggestedPrice,
          minPrice: session.data.analysis.minPrice,
          sellerId: sessionId,
          aiAnalysis: session.data.analysis,
        })

        response = {
          message: `🎉 Your product is now live on Quickash!\n\n` +
                   `📦 **${product.name}**\n` +
                   `💰 Listed at **${product.basePrice / 1e6} USDC**\n` +
                   `🆔 Product ID: ${product.id}\n\n` +
                   `Buyers can now see and negotiate for your item. I'll notify you when offers come in!\n\n` +
                   `Want to list another product?`,
          product: { ...product, basePriceUsdc: product.basePrice / 1e6 },
          step: 'awaiting_product',
        }
        session.step = 'awaiting_product'
        session.data = {}
        chatHistories.set(sessionId, []) // Reset history after listing
      } else if (msg.includes('price') || msg.includes('change') || msg.includes('adjust')) {
        const priceMatch = msg.match(/(\d+(?:\.\d+)?)/);
        if (priceMatch) {
          session.data.analysis.suggestedPrice = parseFloat(priceMatch[1]) * 1e6
          session.data.analysis.minPrice = Math.floor(session.data.analysis.suggestedPrice * 0.6)
          session.data.analysis.suggestedPriceUsdc = parseFloat(priceMatch[1])
          session.data.analysis.minPriceUsdc = session.data.analysis.minPrice / 1e6
          response = {
            message: `Got it! Updated the price to **${parseFloat(priceMatch[1])} USDC**.\n\nShall I list it now?`,
            step: 'confirm_listing',
          }
        } else {
          response = {
            message: `What price would you like? Just tell me a number (e.g., "make it 50 USDC").`,
            step: 'confirm_listing',
          }
        }
      } else {
        response = {
          message: `Just say **"yes"** to list it, or tell me if you'd like to adjust the price.`,
          step: 'confirm_listing',
        }
      }
      break
    }

    default:
      session.step = 'greeting'
      response = { message: `Let's start fresh! Tell me about the product you want to sell.`, step: 'awaiting_product' }
      session.step = 'awaiting_product'
  }

  sellerConversations.set(sessionId, session)
  res.json(response)
})

// ── Buyer Chat ───────────────────────────────────────────────

const buyerConversations = new Map()

router.post('/buyer/chat', async (req, res) => {
  const { message, sessionId = 'default' } = req.body
  const session = buyerConversations.get(sessionId) || { step: 'greeting', data: {} }

  // Manage history
  if (!chatHistories.has(sessionId + '_buyer')) chatHistories.set(sessionId + '_buyer', [])
  const history = chatHistories.get(sessionId + '_buyer')

  let response

  // If LLM available
  if (process.env.GOOGLE_API_KEY && session.step !== 'greeting') {
    try {
      const llmResponse = await generateAgentChat({
        role: 'buying',
        context: { step: session.step, ...session.data },
        message,
        history
      })
      history.push({ role: 'user', text: message })
      history.push({ role: 'assistant', text: llmResponse })

      // Intelligent intent extraction
      if (session.step === 'awaiting_request') {
        const priceMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:usdc|usd|\$|dollars|budget)/i) ||
                           message.match(/(?:under|below|max|budget|spend)\s*\$?\s*(\d+(?:\.\d+)?)/i)
        const budget = priceMatch ? parseFloat(priceMatch[1]) * 1e6 : session.data.budget

        const results = searchProducts({
          query: message.replace(/\d+/g, '').trim(),
          maxPrice: budget,
        })

        if (results.length > 0) {
          session.data.searchQuery = message
          session.data.budget = budget
          session.data.results = results
          session.step = 'select_product'
          
          response = {
            message: llmResponse + `\n\n🔍 **Found ${results.length} matches!** Check them out below.`,
            products: results.map(p => ({ ...p, basePriceUsdc: p.basePrice / 1e6 })),
            step: 'select_product'
          }
          buyerConversations.set(sessionId, session)
          return res.json(response)
        }
      }

      response = { message: llmResponse, step: session.step }
      buyerConversations.set(sessionId, session)
      return res.json(response)
    } catch (err) {
      console.warn('[api] Buyer LLM chat failed:', err.message)
    }
  }

  // Fallback
  switch (session.step) {
    case 'greeting':
      response = {
        message: `👋 Hey! I'm your Quickash buying agent.\n\nTell me what you're looking for and your budget, and I'll find the best deals and negotiate for you! 🤖💰`,
        step: 'awaiting_request',
      }
      session.step = 'awaiting_request'
      break

    case 'awaiting_request': {
      const priceMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:usdc|usd|\$|dollars|budget)/i) ||
                         message.match(/(?:under|below|max|budget|spend)\s*\$?\s*(\d+(?:\.\d+)?)/i)
      const budget = priceMatch ? parseFloat(priceMatch[1]) * 1e6 : null

      const results = searchProducts({
        query: message.replace(/\d+/g, '').trim(),
        maxPrice: budget,
      })

      session.data.searchQuery = message
      session.data.budget = budget
      session.data.results = results

      if (results.length === 0) {
        response = {
          message: `😔 I couldn't find any matching products right now.\n\nTry a broader search, or check back later!`,
          products: [],
          step: 'awaiting_request',
        }
      } else {
        response = {
          message: `🔍 I found **${results.length}** matching products! Which one should I negotiate for?`,
          products: results.map(p => ({ ...p, basePriceUsdc: p.basePrice / 1e6 })),
          step: 'select_product',
        }
        session.step = 'select_product'
      }
      break
    }

    case 'select_product': {
      const msg = message.toLowerCase()
      const results = session.data.results || []
      const numMatch = msg.match(/(\d+)/)
      let selected = null
      if (numMatch) {
        const idx = parseInt(numMatch[1]) - 1
        if (idx >= 0 && idx < results.length) selected = results[idx]
      }
      if (!selected) selected = results.find(p => p.name.toLowerCase().includes(msg))
      if (!selected && results.length === 1) selected = results[0]

      if (!selected) {
        response = { message: `I'm not sure which product you mean. Could you say the number or name?`, step: 'select_product' }
        break
      }

      session.data.selectedProduct = selected
      if (!session.data.budget) {
        response = { message: `Great! **${selected.name}** is ${selected.basePrice / 1e6} USDC. What's your max budget?`, step: 'set_budget' }
        session.step = 'set_budget'
      } else {
        response = { message: `🎯 Target: **${selected.name}**\n💰 Budget: **${session.data.budget / 1e6} USDC**\n\nReady to negotiate? Say **"go"**!`, step: 'confirm_negotiate' }
        session.step = 'confirm_negotiate'
      }
      break
    }

    case 'set_budget': {
      const priceMatch = message.match(/(\d+(?:\.\d+)?)/)
      if (priceMatch) {
        session.data.budget = parseFloat(priceMatch[1]) * 1e6
        response = { message: `💰 Budget set to **${session.data.budget / 1e6} USDC**.\n\nReady? Say **"go"**!`, step: 'confirm_negotiate' }
        session.step = 'confirm_negotiate'
      } else {
        response = { message: `Tell me your budget in USDC.`, step: 'set_budget' }
      }
      break
    }

    case 'confirm_negotiate': {
      const msg = message.toLowerCase()
      if (msg.includes('go') || msg.includes('yes') || msg.includes('start')) {
        const product = session.data.selectedProduct
        response = {
          message: `🤖 Negotiating for **${product.name}**...`,
          negotiating: true,
          productId: product.id,
          budget: session.data.budget,
          step: 'negotiation_result',
        }
        session.step = 'awaiting_request'
        session.data = {}
        chatHistories.set(sessionId + '_buyer', [])
      } else {
        response = { message: `No worries! Want to search for something else?`, step: 'awaiting_request' }
        session.step = 'awaiting_request'
        session.data = {}
      }
      break
    }

    default:
      session.step = 'greeting'
      response = { message: `Let's start fresh! What are you looking for?`, step: 'awaiting_request' }
  }

  buyerConversations.set(sessionId, session)
  res.json(response)
})


// ── Buyer Negotiate ──────────────────────────────────────────

router.post('/buyer/negotiate', async (req, res) => {
  const { productId, budget, mockReputation: mockRep = 'trusted' } = req.body
  const product = getProduct(productId)
  if (!product) return res.status(404).json({ error: 'Product not found' })

  try {
    updateProductStatus(productId, 'negotiating')

    // Run the negotiation against the internal seller
    const result = await runNegotiation({
      itemId: productId,
      budget: Number(budget),
      mockReputation: mockRep,
    })

    if (result.result === 'accepted') {
      updateProductStatus(productId, 'sold')
      result.productName = product.name  // Add product name for frontend display
    } else {
      updateProductStatus(productId, 'active')
    }

    res.json(result)
  } catch (err) {
    updateProductStatus(productId, 'active')
    res.status(500).json({ error: err.message })
  }
})

// ── Transactions Feed ────────────────────────────────────────

const transactions = []

export function recordTransaction(tx) {
  transactions.unshift(tx)
  if (transactions.length > 50) transactions.pop()
}

router.get('/transactions', (req, res) => {
  res.json({ transactions })
})

// ── Reputation ───────────────────────────────────────────────

router.get('/reputation/:agentId', async (req, res) => {
  const agentId = parseInt(req.params.agentId)
  try {
    const rep = await getReputation(agentId)
    res.json(rep)
  } catch (err) {
    res.json(mockReputation('trusted'))
  }
})

// ── Delivery / Shipping ─────────────────────────────────────

const orders = new Map()

router.post('/delivery', async (req, res) => {
  const { orderId, productId, delivery } = req.body
  if (!orderId || !delivery) {
    return res.status(400).json({ error: 'Missing orderId or delivery info' })
  }

  const order = {
    orderId,
    productId,
    delivery,
    status: delivery.mode === 'ship' ? 'shipping_pending' : 'pickup_arranged',
    createdAt: new Date().toISOString(),
  }

  // If shipping, attempt Shiprocket order creation
  if (delivery.mode === 'ship') {
    try {
      // Shiprocket API Integration (requires SHIPROCKET_TOKEN in .env)
      const srToken = process.env.SHIPROCKET_TOKEN
      if (srToken) {
        const srOrder = await fetch('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${srToken}`,
          },
          body: JSON.stringify({
            order_id: orderId,
            order_date: new Date().toISOString().split('T')[0],
            pickup_location: 'Primary',
            billing_customer_name: delivery.name,
            billing_address: delivery.address,
            billing_city: delivery.city,
            billing_pincode: delivery.pincode,
            billing_state: '',
            billing_country: 'India',
            billing_phone: delivery.phone,
            shipping_is_billing: true,
            order_items: [{
              name: productId,
              sku: productId,
              units: 1,
              selling_price: 1,
              discount: 0,
              tax: 0,
            }],
            payment_method: 'Prepaid',
            sub_total: 1,
            length: 10, breadth: 10, height: 10, weight: 0.5,
          }),
        }).then(r => r.json())

        order.shiprocketOrderId = srOrder.order_id
        order.trackingId = srOrder.shipment_id || srOrder.order_id
        order.status = 'shipped'
        console.log(`[delivery] 🚚 Shiprocket order created: ${srOrder.order_id}`)
      } else {
        // Mock Shiprocket
        order.trackingId = `SR-${Date.now().toString(36).toUpperCase()}`
        order.status = 'shipped'
        console.log(`[delivery] 🚚 Mock shipment created: ${order.trackingId}`)
      }
    } catch (err) {
      console.warn('[delivery] Shiprocket failed, using mock:', err.message)
      order.trackingId = `SR-${Date.now().toString(36).toUpperCase()}`
      order.status = 'shipped'
    }
  } else {
    console.log(`[delivery] 📍 Pickup arranged for order: ${orderId}`)
  }

  orders.set(orderId, order)
  res.json({ success: true, trackingId: order.trackingId, status: order.status })
})

// ── Helpers ──────────────────────────────────────────────────

function extractProductName(description) {
  // Try to extract a product name from the first part of the description
  const firstSentence = description.split(/[.!?\n]/)[0].trim()
  if (firstSentence.length <= 60) return firstSentence
  return firstSentence.substring(0, 57) + '...'
}

// ── Error Handler ────────────────────────────────────────────
router.use((err, req, res, next) => {
  console.error('[api] ❌ Unhandled error:', err.message)
  res.status(500).json({ error: 'Internal Server Error', message: err.message })
})

export default router

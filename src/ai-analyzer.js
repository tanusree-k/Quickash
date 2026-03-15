import { analyzeProductLLM } from './llm-utils.js'

/**
 * 🧠 AI Product Analyzer
 * 
 * Analyzes product photos/descriptions to extract:
 * - Product name, category, condition
 * - Suggested price range
 * - Auto-generated listing description
 * 
 * Enhanced: Uses Gemini LLM for "True" AI analysis.
 * Fallback: Uses keyword matching if GOOGLE_API_KEY is missing.
 */

const CATEGORY_KEYWORDS = {
  electronics: ['phone', 'iphone', 'samsung', 'laptop', 'macbook', 'headphone', 'speaker', 'tablet', 'ipad', 'camera', 'console', 'playstation', 'xbox', 'airpod', 'watch', 'tv', 'monitor', 'keyboard', 'mouse', 'gpu', 'charger'],
  fashion: ['shoe', 'sneaker', 'nike', 'adidas', 'jacket', 'dress', 'shirt', 'pants', 'bag', 'handbag', 'watch', 'sunglasses', 'boots', 'hoodie', 'jeans'],
  furniture: ['chair', 'desk', 'table', 'sofa', 'couch', 'bed', 'mattress', 'shelf', 'cabinet', 'lamp', 'ikea'],
  books: ['book', 'textbook', 'novel', 'manga', 'comic'],
  sports: ['bike', 'bicycle', 'skateboard', 'racket', 'gym', 'weights', 'yoga', 'ball', 'treadmill'],
  gaming: ['controller', 'game', 'nintendo', 'switch', 'steam', 'vr', 'headset'],
  vehicles: ['car', 'motorcycle', 'scooter', 'bicycle', 'helmet'],
}

const CONDITION_KEYWORDS = {
  'new': ['new', 'sealed', 'unopened', 'brand new', 'mint', 'unused'],
  'like-new': ['like new', 'like-new', 'barely used', 'excellent', 'perfect', 'pristine', 'mint condition'],
  'good': ['good', 'minor scratches', 'works perfectly', 'great shape', 'well maintained'],
  'fair': ['fair', 'worn', 'some wear', 'functional', 'pilling', 'scuffs', 'dent'],
  'poor': ['poor', 'broken', 'cracked', 'damaged', 'not working', 'for parts'],
}

// Base price multipliers by condition
const CONDITION_MULTIPLIER = {
  'new': 1.0,
  'like-new': 0.8,
  'good': 0.6,
  'fair': 0.4,
  'poor': 0.2,
}

/**
 * Analyze a product description (and optionally photo) to extract metadata
 */
export async function analyzeProduct(description, photoBase64 = null) {
  // 1. Try LLM first if API key is likely present
  if (process.env.GOOGLE_API_KEY) {
    try {
      console.log('[ai-analyzer] 🧠 Requesting LLM analysis...')
      const result = await analyzeProductLLM(description, photoBase64)
      console.log('[ai-analyzer] Raw LLM result:', result)
      return {
        ...result,
        conditionEmoji: getConditionEmoji(result.condition),
        suggestedPrice: Math.round(result.suggestedPriceUsdc * 1e6),
        minPrice: Math.round(result.minPriceUsdc * 1e6),
        suggestedPriceUsdc: result.suggestedPriceUsdc,
        minPriceUsdc: result.minPriceUsdc,
        hasPhoto: !!photoBase64,
      }
    } catch (err) {
      console.warn('[ai-analyzer] ⚠️ LLM failed, falling back to heuristic:', err.message)
    }
  }

  // Fallback to Heuristic
  const text = description.toLowerCase()

  // Detect category
  let detectedCategory = 'general'
  let maxMatches = 0
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matches = keywords.filter(kw => text.includes(kw)).length
    if (matches > maxMatches) {
      maxMatches = matches
      detectedCategory = category
    }
  }

  // Detect condition
  let detectedCondition = 'good' // default
  for (const [condition, keywords] of Object.entries(CONDITION_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      detectedCondition = condition
      break
    }
  }

  // Extract potential price from description (e.g., "$500", "500 USDC")
  const priceMatch = text.match(/\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:usdc|usd|\$|dollars)?/i)
  let suggestedPrice = null
  if (priceMatch) {
    suggestedPrice = parseFloat(priceMatch[1].replace(',', '')) * 1e6 // convert to wei
  }

  // Generate suggested price based on category averages if not found
  if (!suggestedPrice) {
    const categoryAvg = {
      electronics: 200_000000,
      fashion: 50_000000,
      furniture: 75_000000,
      books: 15_000000,
      sports: 60_000000,
      gaming: 40_000000,
      vehicles: 500_000000,
      general: 30_000000,
    }
    suggestedPrice = categoryAvg[detectedCategory] || 30_000000
  }

  // Apply condition multiplier
  const conditionMultiplier = CONDITION_MULTIPLIER[detectedCondition]
  const adjustedPrice = Math.floor(suggestedPrice * conditionMultiplier)
  const minPrice = Math.floor(adjustedPrice * 0.6) // 60% of base as walk-away

  return {
    category: detectedCategory,
    condition: detectedCondition,
    conditionEmoji: getConditionEmoji(detectedCondition),
    suggestedPrice: adjustedPrice,
    minPrice,
    suggestedPriceUsdc: adjustedPrice / 1e6,
    minPriceUsdc: minPrice / 1e6,
    confidence: Math.min(0.5 + maxMatches * 0.15, 0.98),
    hasPhoto: !!photoBase64,
    analysis: `Detected as **${detectedCategory}** item in **${detectedCondition}** condition. ` +
              `Suggested listing price: **${adjustedPrice / 1e6} USDC** (walk-away: ${minPrice / 1e6} USDC).`,
  }
}

function getConditionEmoji(condition) {
  const emojis = {
    'new': '🆕', 'like-new': '✨', 'good': '👍', 'fair': '🔧', 'poor': '⚠️'
  }
  return emojis[condition] || '📦'
}


/**
 * Generate a chat response from the seller agent based on product analysis
 */
export function generateSellerResponse(analysis, productName) {
  return {
    message: `I've analyzed your product! Here's what I found:\n\n` +
             `📦 **${productName}**\n` +
             `📁 Category: ${analysis.category}\n` +
             `${analysis.conditionEmoji} Condition: ${analysis.condition}\n` +
             `💰 Suggested price: **${analysis.suggestedPriceUsdc} USDC**\n` +
             `🏷️ Walk-away price: ${analysis.minPriceUsdc} USDC\n` +
             `📊 Confidence: ${Math.round(analysis.confidence * 100)}%\n\n` +
             `Would you like to list it at this price, or adjust?`,
    analysis,
  }
}

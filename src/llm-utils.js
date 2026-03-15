/**
 * 🧠 LLM Utility (Gemini)
 * 
 * Handles all interactions with Google Gemini API for:
 * - Product image & text analysis (Vision)
 * - Conversational agent responses (NLP)
 * - Strategy reasoning
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'

dotenv.config()

const genAI = process.env.GOOGLE_API_KEY ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY) : null

/**
 * Generate a response using Gemini
 * @param {string} prompt - The system/user prompt
 * @param {string} photoBase64 - Optional base64 photo for Vision
 */
export async function generateLLMResponse(prompt, photoBase64 = null) {
  if (!genAI) {
    throw new Error('GOOGLE_API_KEY is not set in .env')
  }

  try {
    const model = genAI.getGenerativeModel({ model: photoBase64 ? 'gemini-2.5-flash' : 'gemini-2.5-flash' })
    
    let result
    if (photoBase64) {
      // Vision request
      const imagePart = {
        inlineData: {
          data: photoBase64.split(',')[1] || photoBase64,
          mimeType: 'image/jpeg'
        }
      }
      result = await model.generateContent([prompt, imagePart])
    } else {
      // Text request
      result = await model.generateContent(prompt)
    }

    const response = await result.response
    return response.text()
  } catch (err) {
    console.error('[llm] ❌ Error:', err.message)
    throw err
  }
}

/**
 * Specialized: Analyze a product listing
 */
export async function analyzeProductLLM(description, photoBase64 = null) {
  const prompt = `
    Analyze this secondhand product listing for a marketplace.
    Description: "${description}"
    
    Return a JSON object with:
    {
      "name": "short descriptive name",
      "category": "one of: electronics, fashion, furniture, books, sports, gaming, vehicles, general",
      "condition": "one of: new, like-new, good, fair, poor",
      "suggestedPriceUsdc": numeric,
      "minPriceUsdc": numeric (suggested walk-away price),
      "confidence": 0-100,
      "analysis": "short reasoning about the price and condition"
    }
  `
  
  const text = await generateLLMResponse(prompt, photoBase64)
  // Extract JSON from markdown if needed
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  return JSON.parse(jsonMatch ? jsonMatch[0] : text)
}

/**
 * Specialized: Generate a chat response for an agent
 */
export async function generateAgentChat({ role, context, message, history = [] }) {
  const prompt = `
    You are an AI ${role} agent for "Quickash", a secondhand marketplace.
    
    Context:
    ${JSON.stringify(context, null, 2)}
    
    History:
    ${history.map(h => `${h.role}: ${h.text}`).join('\n')}
    
    User message: "${message}"
    
    Guidelines:
    - Be helpful, professional, and concise.
    - Use teal blue themed language if relevant (e.g. "sparkling deal", "quick as lightning").
    - If you are a seller, guide the user to list their product.
    - If you are a buyer, help them find products and encourage negotiation.
    - Do not use markdown headers (#), just bolding (**) and lists.
    
    Response:
  `

  return generateLLMResponse(prompt)
}

/**
 * Structured Seller Chat — LLM decides WHAT to do, not just what to say
 * Returns { message, action } where action drives the state machine
 */
export async function generateSellerChat({ step, sessionData, message, history = [], hasPhoto = false }) {
  const prompt = `
You are the Seller AI Agent for "Quickash", a secondhand marketplace.

Your current state: "${step}"
Product data so far: ${JSON.stringify(sessionData || {}, null, 2)}
User uploaded a photo: ${hasPhoto ? 'yes' : 'no'}

Conversation history:
${history.slice(-6).map(h => `${h.role}: ${h.text}`).join('\n')}

User's latest message: "${message}"

YOUR JOB: Respond to the user AND decide what action to take.

RULES for action decisions:
- If state is "greeting" or user just arrived: action = "greet"
- If user describes a product (more than a few words) OR uploaded a photo: action = "analyze_product"
- If user says yes/confirm/list/ok/sure to listing: action = "list_product"
- If user wants to change price and mentions a number: action = "adjust_price" with the price
- If user wants to change price but no number given: action = "ask_price"
- If user says no/cancel: action = "cancel"
- Otherwise: action = "chat" (just continue the conversation)

Return ONLY a JSON object (no markdown):
{
  "message": "Your friendly response to the user",
  "action": "one of: greet, analyze_product, list_product, adjust_price, ask_price, cancel, chat",
  "price": null or numeric (only for adjust_price)
}
`

  const text = await generateLLMResponse(prompt)
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    return JSON.parse(jsonMatch ? jsonMatch[0] : text)
  } catch {
    return { message: text, action: 'chat' }
  }
}

/**
 * Structured Buyer Chat — LLM extracts intent from natural language
 */
export async function generateBuyerChat({ step, sessionData, message, history = [], availableProducts = [] }) {
  const prompt = `
You are the Buyer AI Agent for "Quickash", a secondhand marketplace.

Your current state: "${step}"
Session data: ${JSON.stringify(sessionData || {}, null, 2)}
Available products: ${JSON.stringify(availableProducts.map(p => ({ id: p.id, name: p.name, price: p.basePrice / 1e6, category: p.category })), null, 2)}

Conversation history:
${history.slice(-6).map(h => `${h.role}: ${h.text}`).join('\n')}

User's latest message: "${message}"

YOUR JOB: Respond AND decide what action to take.

RULES:
- If state is "greeting": action = "greet"
- If user describes what they want to buy (keywords/descriptions): action = "search" with a search query and optional budget
- If user selects a product (by number, name, or confirms single result): action = "select_product" with productIndex (0-based)
- If user provides a budget (a number): action = "set_budget" with the budget number
- If user says go/yes/start/negotiate: action = "start_negotiation"
- If user says no/cancel/something else: action = "new_search"
- Otherwise: action = "chat"

Return ONLY a JSON object (no markdown):
{
  "message": "Your friendly response",
  "action": "one of: greet, search, select_product, set_budget, start_negotiation, new_search, chat",
  "searchQuery": "extracted search terms" or null,
  "budget": numeric or null,
  "productIndex": 0-based index or null
}
`

  const text = await generateLLMResponse(prompt)
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    return JSON.parse(jsonMatch ? jsonMatch[0] : text)
  } catch {
    return { message: text, action: 'chat' }
  }
}

/**
 * LLM-powered Negotiation Strategy — replaces hardcoded 60%/10% logic
 */
export async function generateNegotiationStrategy({ productName, basePrice, minPrice, budget, currentOffer, sellerCounter, round, maxRounds, reputationTier }) {
  const prompt = `
You are a smart buyer negotiation AI for "Quickash" marketplace.

Product: "${productName}"
Seller's listed price: ${basePrice / 1e6} USDC
Your budget cap: ${budget / 1e6} USDC
Current round: ${round} of ${maxRounds}
Your reputation: ${reputationTier || 'unknown'}
${currentOffer ? `Your last offer: ${currentOffer / 1e6} USDC` : 'This is your opening offer.'}
${sellerCounter ? `Seller's counter-offer: ${sellerCounter / 1e6} USDC` : ''}

STRATEGY GUIDELINES:
- Start with a reasonable opening (50-70% of listed price)
- Increase gradually each round but stay under budget
- If seller's counter is within budget, consider accepting it
- Factor in reputation — trusted buyers get better deals
- Be strategic: don't jump to max budget immediately
- In later rounds (4-5), be more aggressive to close the deal

Return ONLY a JSON object (no markdown):
{
  "nextOffer": numeric in USDC (e.g. 150.0),
  "reasoning": "brief explanation of strategy",
  "shouldAcceptCounter": true/false (if seller's counter is within budget and reasonable)
}
`

  const text = await generateLLMResponse(prompt)
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : text)
    return {
      nextOffer: Math.round(result.nextOffer * 1e6),
      reasoning: result.reasoning,
      shouldAcceptCounter: result.shouldAcceptCounter || false,
    }
  } catch {
    // Fallback to simple heuristic if LLM fails
    const fallback = currentOffer ? Math.min(Math.floor(currentOffer * 1.1), budget) : Math.floor(basePrice * 0.6)
    return { nextOffer: fallback, reasoning: 'Fallback strategy', shouldAcceptCounter: false }
  }
}

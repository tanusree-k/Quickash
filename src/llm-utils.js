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

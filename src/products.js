/**
 * 📦 Product Store
 * 
 * In-memory product storage for the Quickash secondhand marketplace.
 * Handles CRUD operations, search, and status management.
 */

let products = []
let nextId = 1

/**
 * Product schema:
 * {
 *   id, name, description, category, condition,
 *   photos (base64[]), basePrice (wei), minPrice (wei),
 *   sellerId, status ('active'|'sold'|'negotiating'),
 *   createdAt, suggestedPrice, aiAnalysis
 * }
 */

export function addProduct({
  name,
  description,
  category = 'general',
  condition = 'good',
  photos = [],
  basePrice,
  minPrice,
  sellerId = 'anonymous',
  aiAnalysis = null,
}) {
  const product = {
    id: `product-${String(nextId++).padStart(3, '0')}`,
    name,
    description,
    category,
    condition,
    photos,
    basePrice: Number(basePrice),
    minPrice: Number(minPrice) || Math.floor(Number(basePrice) * 0.6),
    sellerId,
    status: 'active',
    createdAt: new Date().toISOString(),
    aiAnalysis,
  }
  products.push(product)
  console.log(`[products] ✅ Added "${product.name}" (${product.id}) — ${product.basePrice / 1e6} USDC`)
  return product
}

export function getProduct(id) {
  return products.find(p => p.id === id) || null
}

export function getAllProducts() {
  return products.filter(p => p.status === 'active')
}

export function searchProducts({ query, category, condition, maxPrice }) {
  let results = products.filter(p => p.status === 'active')

  if (query) {
    const q = query.toLowerCase()
    results = results.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    )
  }
  if (category) {
    results = results.filter(p => p.category.toLowerCase() === category.toLowerCase())
  }
  if (condition) {
    results = results.filter(p => p.condition.toLowerCase() === condition.toLowerCase())
  }
  if (maxPrice) {
    results = results.filter(p => p.basePrice <= Number(maxPrice))
  }

  return results
}

export function updateProductStatus(id, status) {
  const product = products.find(p => p.id === id)
  if (product) {
    product.status = status
    console.log(`[products] 📝 ${product.name} status → ${status}`)
  }
  return product
}

export function removeProduct(id) {
  products = products.filter(p => p.id !== id)
}

/**
 * Seed some demo products for the hackathon
 */
export function seedDemoProducts() {
  addProduct({
    name: 'iPhone 14 Pro (Used)',
    description: 'Space Black, 256GB, minor scratches on back, battery health 89%. Comes with original charger.',
    category: 'electronics',
    condition: 'good',
    basePrice: 450_000000, // 450 USDC
    minPrice: 300_000000,
    sellerId: 'demo-seller',
    aiAnalysis: { confidence: 0.92, detectedBrand: 'Apple', suggestedCategory: 'electronics' },
  })

  addProduct({
    name: 'Nike Air Max 90 (Size 10)',
    description: 'White/Black colorway, worn ~20 times, soles in great shape. Original box included.',
    category: 'fashion',
    condition: 'like-new',
    basePrice: 80_000000, // 80 USDC
    minPrice: 50_000000,
    sellerId: 'demo-seller',
    aiAnalysis: { confidence: 0.88, detectedBrand: 'Nike', suggestedCategory: 'fashion' },
  })

  addProduct({
    name: 'Sony WH-1000XM5 Headphones',
    description: 'Silver, noise cancelling, includes case and cable. Left ear cushion slightly worn.',
    category: 'electronics',
    condition: 'good',
    basePrice: 180_000000, // 180 USDC
    minPrice: 120_000000,
    sellerId: 'demo-seller',
    aiAnalysis: { confidence: 0.95, detectedBrand: 'Sony', suggestedCategory: 'electronics' },
  })

  addProduct({
    name: 'IKEA MARKUS Office Chair',
    description: 'Black, ergonomic, 2 years old. Hydraulics work perfectly. Minor fabric pilling.',
    category: 'furniture',
    condition: 'fair',
    basePrice: 60_000000, // 60 USDC
    minPrice: 35_000000,
    sellerId: 'demo-seller',
    aiAnalysis: { confidence: 0.85, detectedBrand: 'IKEA', suggestedCategory: 'furniture' },
  })

  addProduct({
    name: 'MacBook Air M2 (2022)',
    description: 'Midnight, 8GB/256GB, 45 battery cycles, AppleCare+ until 2025. Mint condition.',
    category: 'electronics',
    condition: 'like-new',
    basePrice: 750_000000, // 750 USDC
    minPrice: 550_000000,
    sellerId: 'demo-seller',
    aiAnalysis: { confidence: 0.97, detectedBrand: 'Apple', suggestedCategory: 'electronics' },
  })

  console.log(`[products] 🎯 Seeded ${products.length} demo products`)
}

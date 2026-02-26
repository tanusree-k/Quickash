import 'dotenv/config'

export const CHAIN_ID   = 48816
export const RPC_URL    = 'https://rpc.testnet3.goat.network'
export const USDC       = '0x29d1ee93e9ecf6e50f309f498e40a6b42d352fa1'
export const ADMIN_URL  = 'https://x402-api-lx58aabp0r.testnet3.goat.network'

// ERC-8004 registries on GOAT Network
export const IDENTITY_REGISTRY    = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'
export const REPUTATION_REGISTRY  = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63'

export const SELLER_PORT = parseInt(process.env.SELLER_PORT || '4001')
export const BUYER_PORT  = parseInt(process.env.BUYER_PORT  || '4002')

// Seller merchant creds (x402)
export const seller = {
  merchantId: process.env.SELLER_MERCHANT_ID || 'hackathon_test',
  apiKey:     process.env.SELLER_API_KEY     || 'AwY0x3K5BWyCQ71wuyb8VaXegDjMTQVSIRiD9jDlGCg=',
  apiSecret:  process.env.SELLER_API_SECRET  || 'jgLe5QnScMre9lQ-Ziz__VLOUH_842LWu9CXXeNp_AI=',
}

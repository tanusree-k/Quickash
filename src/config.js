import 'dotenv/config'

export const CHAIN_ID   = 48816
export const RPC_URL    = 'https://rpc.testnet3.goat.network'
export const USDC       = '0x29d1ee93e9ecf6e50f309f498e40a6b42d352fa1'
export const ADMIN_URL  = process.env.GOATX402_API_URL || 'https://x402-api-lx58aabp0r.testnet3.goat.network'

// ERC-8004 registries on GOAT Network
export const IDENTITY_REGISTRY    = '0x556089008Fc0a60cD09390Eca93477ca254A5522'
export const REPUTATION_REGISTRY  = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63'
export const ERC8004_AGENT_ID     = parseInt(process.env.ERC8004_AGENT_ID || '203')

export const SELLER_PORT = parseInt(process.env.SELLER_PORT || '4001')
export const BUYER_PORT  = parseInt(process.env.BUYER_PORT  || '4002')

// Seller merchant creds (x402)
export const seller = {
  merchantId: process.env.SELLER_MERCHANT_ID || process.env.GOATX402_MERCHANT_ID || 'quickash',
  apiKey:     process.env.SELLER_API_KEY     || process.env.GOATX402_API_KEY     || '6R9IqMvZ0ReT_CZT1VMi_rpsrw_SBVt2ga4N5_wkNk0=',
  apiSecret:  process.env.SELLER_API_SECRET  || process.env.GOATX402_API_SECRET  || 'PRn6A4qlRdPGte8cwFTbLdGmBn_C1QvkAwMN0WYgXfU=',
}


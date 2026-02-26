/**
 * ERC-8004 Reputation checker
 * 
 * Reads on-chain reputation for a buyer agent.
 * Used by seller to decide whether to offer a discount.
 */

import { ethers } from 'ethers'
import { RPC_URL, IDENTITY_REGISTRY, REPUTATION_REGISTRY } from './config.js'

const IDENTITY_ABI = [
  'function tokenURI(uint256 agentId) external view returns (string)',
  'function ownerOf(uint256 agentId) external view returns (address)',
  'function getAgentWallet(uint256 agentId) external view returns (address)',
]

const REPUTATION_ABI = [
  'function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)',
  'function getClients(uint256 agentId) external view returns (address[] memory)',
]

let provider
let identityContract
let reputationContract

function setup() {
  if (provider) return
  provider = new ethers.JsonRpcProvider(RPC_URL)
  identityContract   = new ethers.Contract(IDENTITY_REGISTRY,   IDENTITY_ABI,   provider)
  reputationContract = new ethers.Contract(REPUTATION_REGISTRY, REPUTATION_ABI, provider)
}

/**
 * Get reputation score for an agent (0–100, or null if no data)
 * Returns: { agentId, score, feedbackCount, tier, discount }
 */
export async function getReputation(agentId) {
  setup()

  try {
    // Get all clients who gave feedback
    const clients = await reputationContract.getClients(agentId).catch(() => [])

    if (clients.length === 0) {
      return { agentId, score: null, feedbackCount: 0, tier: 'unknown', discount: 0 }
    }

    // Get aggregate score across all clients
    const [count, summaryValue, decimals] =
      await reputationContract.getSummary(agentId, clients, '', '')

    const score = Number(summaryValue) / Math.pow(10, Number(decimals))
    const feedbackCount = Number(count)

    const { tier, discount } = scoreTier(score, feedbackCount)

    return { agentId, score, feedbackCount, tier, discount }
  } catch (err) {
    console.warn(`[reputation] Could not fetch for agent #${agentId}:`, err.message)
    return { agentId, score: null, feedbackCount: 0, tier: 'unknown', discount: 0 }
  }
}

/**
 * Map score → tier → discount percentage
 * 
 * 5-star (90–100) + 5+ transactions → 25% discount
 * 4-star (70–89)                    → 10% discount
 * 3-star (50–69)                    → 5% discount
 * Unknown / new                     → 0% discount
 */
function scoreTier(score, count) {
  if (score === null) return { tier: 'unknown', discount: 0 }
  if (score >= 90 && count >= 5) return { tier: '5-star', discount: 25 }
  if (score >= 70)               return { tier: '4-star', discount: 10 }
  if (score >= 50)               return { tier: '3-star', discount: 5  }
  return                                { tier: 'low',    discount: 0  }
}

/**
 * Simulate reputation for demo (when no on-chain data exists yet)
 */
export function mockReputation(scenario) {
  const scenarios = {
    trusted:  { agentId: 0, score: 95, feedbackCount: 12, tier: '5-star', discount: 25 },
    average:  { agentId: 1, score: 72, feedbackCount: 3,  tier: '4-star', discount: 10 },
    newbie:   { agentId: 2, score: null, feedbackCount: 0, tier: 'unknown', discount: 0 },
  }
  return scenarios[scenario] || scenarios.newbie
}

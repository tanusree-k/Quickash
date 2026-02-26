# 🚀 AI Auto-Haggler

> An automated "Xianyu" (second-hand market) where AI Agents negotiate prices for digital assets without human intervention.

**The Stack:**
- 🧠 **OpenClaw** (The Brain) — negotiation logic, bidding strategy
- 💬 **x402** (The Messenger) — standardized payment language between agents  
- 🪪 **ERC-8004** (The ID Card) — trust layer; high reputation = automatic discount

## The Demo (30 Seconds)

```
1. User: "Buy this AI Prompt, budget is 0.4 USDC"
2. Buyer Agent pings Seller: "0.3 USDC for this?"
3. Seller checks ERC-8004: buyer has 5-star reputation
4. Seller: "Since you're a trusted buyer, I'll take 0.3 USDC 🤝"
5. x402: payment order created → buyer pays on-chain → asset delivered
```

**Key insight:** High on-chain reputation = automatic discount. Trust is money.

## Run It

```bash
# Terminal 1 — Seller Agent
npm run seller

# Terminal 2 — Buyer Agent (trusted buyer, budget 0.4 USDC)
node src/buyer.js prompt-001 400000 trusted

# Or run the full 3-scenario demo
npm run demo
```

## How Reputation Affects Price

| ERC-8004 Tier | Score | Reviews | Discount |
|---|---|---|---|
| 5-star ⭐⭐⭐⭐⭐ | 90–100 | 5+ | **25% off** |
| 4-star ⭐⭐⭐⭐ | 70–89 | any | 10% off |
| 3-star ⭐⭐⭐ | 50–69 | any | 5% off |
| Unknown 🆕 | — | 0 | 0% |

## The x402 Flow

```
Buyer offers price
  ↓
Seller checks ERC-8004 reputation
  ↓
Seller accepts (HTTP 402 + payment details)
  ↓
Buyer pays USDC on-chain (GOAT Testnet3)
  ↓
Buyer POSTs /confirm/:orderId
  ↓
Seller verifies + delivers asset
```

## Chain Info

| | |
|---|---|
| Chain | GOAT Testnet3 (48816) |
| Token | USDC `0x29d1ee93e9ecf6e50f309f498e40a6b42d352fa1` |
| Identity Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| Reputation Registry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |

---

🐐 Built on [GOAT Network](https://goat.network) — Bitcoin L2 for the Agent Economy

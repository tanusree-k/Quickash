/**
 * 💳 x402 Direct HTTP Client
 * 
 * Replaces the goatx402-sdk-server dependency with direct REST calls
 * to the GOAT x402 Core API.
 * 
 * Auth: HMAC-SHA256 signature using apiKey + apiSecret
 * Endpoints: POST /api/v1/orders, GET /api/v1/orders/{id}
 */

import crypto from 'crypto'

export class X402Client {
  constructor({ baseUrl, apiKey, apiSecret, merchantId }) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.apiKey = apiKey
    this.apiSecret = apiSecret
    this.merchantId = merchantId
  }

  /**
   * Generate HMAC-SHA256 signature for API auth
   * Algorithm (per x402 Core):
   * 1. Take all body fields, add api_key and timestamp
   * 2. Remove 'sign' if present, drop empty values
   * 3. Sort keys by ASCII, build k1=v1&k2=v2
   * 4. HMAC-SHA256 with apiSecret, hex-encode
   */
  _sign(bodyFields) {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonce = crypto.randomUUID()

    const params = {
      ...bodyFields,
      api_key: this.apiKey,
      timestamp,
      nonce,
    }

    // Remove empty values and 'sign'
    delete params.sign
    for (const key of Object.keys(params)) {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key]
      }
    }

    // Sort keys and build query string
    const sorted = Object.keys(params).sort()
    const signStr = sorted.map(k => `${k}=${params[k]}`).join('&')

    // HMAC-SHA256
    const sign = crypto
      .createHmac('sha256', this.apiSecret)
      .update(signStr)
      .digest('hex')

    return { timestamp, nonce, sign }
  }

  /**
   * Create a payment order
   * Returns: { orderId, payToAddress, flow, amountWei, ... }
   */
  async createOrder({ dappOrderId, chainId, tokenSymbol, tokenContract, fromAddress, amountWei }) {
    const body = {
      dapp_order_id: dappOrderId,
      chain_id: chainId,
      token_symbol: tokenSymbol,
      from_address: fromAddress,
      amount_wei: amountWei.toString(),
      merchant_id: this.merchantId,
    }
    if (tokenContract) {
      body.token_contract = tokenContract
    }

    const { timestamp, nonce, sign } = this._sign(body)

    console.log(`[x402] 📡 Creating order: ${amountWei} wei (${Number(amountWei) / 1e6} USDC)`)
    console.log(`[x402]    dapp_order_id: ${dappOrderId}`)
    console.log(`[x402]    chain_id: ${chainId}`)

    const url = `${this.baseUrl}/api/v1/orders`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'X-Sign': sign,
      },
      body: JSON.stringify(body),
    })

    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      console.error(`[x402] ❌ Non-JSON response: ${text.slice(0, 200)}`)
      throw new Error(`x402 API returned non-JSON: ${res.status}`)
    }

    if (res.status === 402) {
      // Success! 402 Payment Required is expected
      console.log(`[x402] ✅ Order created: ${data.order_id}`)
      console.log(`[x402]    Flow: ${data.flow}`)

      // Extract pay-to address from accepts array
      let payToAddress = null
      if (data.accepts && data.accepts.length > 0) {
        payToAddress = data.accepts[0].payTo
      }

      return {
        orderId: data.order_id,
        payToAddress: payToAddress || 'see-accepts',
        flow: data.flow,
        tokenSymbol: data.token_symbol,
        raw: data,
      }
    }

    if (!res.ok) {
      const errMsg = data.error || data.message || text
      console.error(`[x402] ❌ Order creation failed (${res.status}): ${errMsg}`)
      throw new Error(`x402 order creation failed: ${errMsg}`)
    }

    return data
  }

  /**
   * Get order status (poll after payment)
   * Returns: { status, txHash, ... }
   */
  async getOrderStatus(orderId) {
    // For GET requests, sign with empty body
    const { timestamp, sign } = this._sign({})

    const url = `${this.baseUrl}/api/v1/orders/${orderId}`
    const res = await fetch(url, {
      headers: {
        'X-API-Key': this.apiKey,
        'X-Timestamp': timestamp,
        'X-Sign': sign,
      },
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || data.message || `Status check failed: ${res.status}`)
    }

    return {
      orderId: data.order_id,
      status: data.status,
      txHash: data.tx_hash || null,
      confirmedAt: data.confirmed_at || null,
      merchantId: data.merchant_id,
      amountWei: data.amount_wei,
      chainId: data.chain_id,
    }
  }

  /**
   * Cancel a pending order (only CHECKOUT_VERIFIED orders)
   */
  async cancelOrder(orderId) {
    const { timestamp, sign } = this._sign({})

    const url = `${this.baseUrl}/api/v1/orders/${orderId}/cancel`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'X-Timestamp': timestamp,
        'X-Sign': sign,
      },
    })

    const data = await res.json()
    return data
  }

  /**
   * Get merchant info (public, no auth needed)
   */
  async getMerchant(merchantId) {
    const url = `${this.baseUrl}/merchants/${merchantId || this.merchantId}`
    const res = await fetch(url)
    return res.json()
  }
}

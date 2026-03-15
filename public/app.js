/* ═══════════════════════════════════════════════════════════
   Quickash — Frontend App
   Chat-based AI marketplace with agent negotiation
   ═══════════════════════════════════════════════════════════ */

const API = '';

// ── State ────────────────────────────────────────────────
let currentUser = null; // Will hold { name, email, picture, token }
let sellerSessionId = 'seller-' + Date.now();
let buyerSessionId = 'buyer-' + Date.now();
let sellerGreeted = false;
let buyerGreeted = false;

// ── Wallet State ─────────────────────────────────────────
const GOAT_CHAIN_ID = '0xBEB0'; // 48816 decimal
const GOAT_RPC = 'https://rpc.testnet3.goat.network';
const USDC_CONTRACT = '0x29d1ee93e9ecf6e50f309f498e40a6b42d352fa1';
let walletAddress = null;
let pendingPayment = null; // { orderId, payToAddress, amountWei, amountUsdc, productName, productId }
let pendingPhotoBase64 = null;

// ── Tab Navigation ────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (!currentUser && tab.dataset.tab !== 'marketplace') {
      alert('Please sign in with Google to access the AI agents.');
      document.getElementById('view-login').classList.add('active');
      return;
    }
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    const viewId = 'view-' + tab.dataset.tab;
    document.getElementById(viewId).classList.add('active');

    // Auto-greet on first visit
    if (tab.dataset.tab === 'sell' && !sellerGreeted) {
      sellerGreeted = true;
      sendSellerChat(null, true);
    }
    if (tab.dataset.tab === 'buy' && !buyerGreeted) {
      buyerGreeted = true;
      sendBuyerChat(null, true);
    }
    if (tab.dataset.tab === 'marketplace') {
      loadProducts();
    }
  });
});

// ── Load Products ─────────────────────────────────────────
async function loadProducts() {
  const grid = document.getElementById('product-grid');
  try {
    const query = document.getElementById('search-input').value;
    const category = document.getElementById('category-filter').value;
    let url = `${API}/api/products?`;
    if (query) url += `query=${encodeURIComponent(query)}&`;
    if (category) url += `category=${encodeURIComponent(category)}&`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();

    if (data.products.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 16px;">🔍</div>
          <p>No products found. Try a different search or list something!</p>
        </div>`;
      return;
    }

    grid.innerHTML = data.products.map(p => `
      <div class="product-card${p.status === 'sold' ? ' sold' : ''}" onclick="openProductModal('${p.id}')" style="position:relative">
        <span class="product-emoji">${getCategoryEmoji(p.category)}</span>
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="product-desc">${escapeHtml(p.description)}</div>
        <div class="product-meta">
          <span class="product-price">${p.basePriceUsdc} USDC</span>
          <span class="condition-badge condition-${p.condition}">${p.condition}</span>
        </div>
        <div class="category-tag">📁 ${p.category}</div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--danger)">Failed to load products: ${err.message}</div>`;
  }
}

// ── Search & Filter ───────────────────────────────────────
document.getElementById('search-input').addEventListener('input', debounce(loadProducts, 300));
document.getElementById('category-filter').addEventListener('change', loadProducts);

// ── Product Modal ─────────────────────────────────────────
async function openProductModal(id) {
  const modal = document.getElementById('product-modal');
  const body = document.getElementById('modal-body');

  try {
    const res = await fetch(`${API}/api/products/${id}`);
    const p = await res.json();

    body.innerHTML = `
      <div style="font-size: 3rem; margin-bottom: 12px;">${getCategoryEmoji(p.category)}</div>
      <h3>${escapeHtml(p.name)}</h3>
      <p>${escapeHtml(p.description)}</p>
      <div class="modal-detail">
        <span class="label">Price</span>
        <span class="value" style="color: var(--teal-700); font-weight: 700;">${p.basePriceUsdc} USDC</span>
      </div>
      <div class="modal-detail">
        <span class="label">Condition</span>
        <span class="value"><span class="condition-badge condition-${p.condition}">${p.condition}</span></span>
      </div>
      <div class="modal-detail">
        <span class="label">Category</span>
        <span class="value">${p.category}</span>
      </div>
      <div class="modal-detail">
        <span class="label">Status</span>
        <span class="value">${p.status === 'active' ? '🟢 Available' : p.status === 'sold' ? '🔴 Sold' : '🟡 Negotiating'}</span>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="startBuyingFromModal('${p.id}', '${escapeHtml(p.name)}', ${p.basePriceUsdc})">
          🤖 Start Negotiation
        </button>
        <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      </div>
    `;
    modal.style.display = 'flex';
  } catch (err) {
    console.error('Failed to load product:', err);
  }
}

function closeModal() {
  document.getElementById('product-modal').style.display = 'none';
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('product-modal').addEventListener('click', (e) => {
  if (e.target.id === 'product-modal') closeModal();
});

function startBuyingFromModal(productId, productName, priceUsdc) {
  closeModal();
  // Switch to buy tab
  document.querySelector('[data-tab="buy"]').click();
  // Pre-fill and send
  setTimeout(() => {
    const input = document.getElementById('buyer-input');
    input.value = `I want to buy the ${productName} under ${priceUsdc} USDC`;
    document.getElementById('buyer-send').click();
  }, 400);
}

// ── Seller Chat ───────────────────────────────────────────

document.getElementById('seller-image-btn').addEventListener('click', () => {
  document.getElementById('seller-image-input').click()
})

document.getElementById('seller-image-input').addEventListener('change', (e) => {
  const file = e.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (event) => {
    pendingPhotoBase64 = event.target.result
    
    // Show a mini preview in the chat input area
    const inputArea = document.querySelector('#view-sell .chat-input-area')
    let preview = document.getElementById('image-preview-badge')
    if (!preview) {
      preview = document.createElement('div')
      preview.id = 'image-preview-badge'
      preview.style = 'position:absolute; top:-40px; left:10px; background:var(--bg-glass); padding:4px; border-radius:8px; border:1px solid var(--border-glass); display:flex; align-items:center; gap:8px;'
      inputArea.style.position = 'relative'
      inputArea.appendChild(preview)
    }
    preview.innerHTML = `
      <img src="${pendingPhotoBase64}" style="height:30px; width:30px; object-fit:cover; border-radius:4px;" />
      <span style="font-size:0.8rem">Image ready</span>
      <button onclick="this.parentElement.remove(); window.pendingPhotoBase64 = null;" style="background:none;border:none;cursor:pointer">✕</button>
    `
  }
  reader.readAsDataURL(file)
})

async function sendSellerChat(customMessage, isGreeting = false) {
  const input = document.getElementById('seller-input');
  const messages = document.getElementById('seller-messages');
  const message = customMessage || input.value.trim();
  const photoToSend = window.pendingPhotoBase64 || pendingPhotoBase64

  if (!message && !photoToSend && !isGreeting) return;

  if (!isGreeting) {
    if (photoToSend) {
      const htmlMsg = `<div><img src="${photoToSend}" style="max-width:150px; border-radius:8px; margin-bottom:8px; display:block;" />${message}</div>`
      addMessageHtml(messages, htmlMsg, 'user')
    } else {
      addMessage(messages, message, 'user');
    }
    input.value = '';
    
    // Clear preview
    const preview = document.getElementById('image-preview-badge')
    if (preview) preview.remove()
    pendingPhotoBase64 = null
    window.pendingPhotoBase64 = null
    document.getElementById('seller-image-input').value = ''
  }

  addTypingIndicator(messages);

  try {
    const res = await fetch(`${API}/api/seller/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message || (photoToSend ? 'Here is a photo' : 'hello'),
        photo: photoToSend,
        sessionId: sellerSessionId,
      }),
    });
    const data = await res.json();
    removeTypingIndicator(messages);
    addMessage(messages, data.message, 'agent');

    if (data.product) {
      addMessage(messages, `🎉 Product listed! ID: ${data.product.id}`, 'system');
      loadProducts(); // Refresh marketplace
    }
  } catch (err) {
    removeTypingIndicator(messages);
    addMessage(messages, `❌ Error: ${err.message}`, 'system');
  }
}

document.getElementById('seller-send').addEventListener('click', () => sendSellerChat());
document.getElementById('seller-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendSellerChat();
});


// ── Buyer Chat ────────────────────────────────────────────
async function sendBuyerChat(customMessage, isGreeting = false) {
  const input = document.getElementById('buyer-input');
  const messages = document.getElementById('buyer-messages');
  const message = customMessage || input.value.trim();

  if (!message && !isGreeting) return;

  if (!isGreeting) {
    addMessage(messages, message, 'user');
    input.value = '';
  }

  addTypingIndicator(messages);

  try {
    const res = await fetch(`${API}/api/buyer/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message || 'hello',
        sessionId: buyerSessionId,
      }),
    });
    const data = await res.json();
    removeTypingIndicator(messages);
    addMessage(messages, data.message, 'agent');

    // If agent wants to negotiate, trigger it
    if (data.negotiating && data.productId) {
      addMessage(messages, '⏳ Negotiation in progress...', 'system');
      await runNegotiation(messages, data.productId, data.budget);
    }

    // Show product cards in chat
    if (data.products && data.products.length > 0) {
      const cards = data.products.map(p =>
        `<div style="padding:10px;margin:4px 0;background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:10px;cursor:pointer" onclick="openProductModal('${p.id}')">
          <strong>${getCategoryEmoji(p.category)} ${escapeHtml(p.name)}</strong><br/>
          <span style="font-size:0.78rem;color:var(--text-secondary)">${p.basePriceUsdc} USDC · ${p.condition}</span>
        </div>`
      ).join('');
      addMessageHtml(messages, cards, 'agent');
    }
  } catch (err) {
    removeTypingIndicator(messages);
    addMessage(messages, `❌ Error: ${err.message}`, 'system');
  }
}

document.getElementById('buyer-send').addEventListener('click', () => sendBuyerChat());
document.getElementById('buyer-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendBuyerChat();
});

// ── Negotiation ───────────────────────────────────────────
async function runNegotiation(messages, productId, budget) {
  try {
    const res = await fetch(`${API}/api/buyer/negotiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId,
        budget: budget || 500_000000,
        mockReputation: 'trusted',
      }),
    });
    const result = await res.json();

    if (result.result === 'accepted') {
      addMessage(messages,
        `🎉 **Deal Closed!**\n\n` +
        `💰 Price: ${result.amountUsdc} USDC\n` +
        `🌟 Reputation bonus: ${result.reputationBonus || 0}% off\n` +
        `📋 Order ID: ${result.orderId}\n\n` +
        `⛓️ Chain: GOAT Testnet3 (48816)`,
        'negotiation'
      );

      // Store pending payment info and show payment modal
      pendingPayment = {
        orderId: result.orderId,
        payToAddress: result.payToAddress,
        amountWei: result.amountWei,
        amountUsdc: result.amountUsdc,
        productName: result.productName || productId,
        productId: productId,
      };

      addMessage(messages,
        `✅ Click the button below to pay with MetaMask!`,
        'system'
      );

      // Add a "Pay Now" button in the chat
      const payBtnHtml = `<button class="btn btn-primary" style="margin-top:8px" onclick="showPaymentModal()">
        🦊 Pay ${result.amountUsdc} USDC with MetaMask
      </button>`;
      addMessageHtml(messages, payBtnHtml, 'system');

      loadProducts();
      loadTransactions();
    } else {
      addMessage(messages,
        `😔 Negotiation failed: ${result.reason || 'Could not reach a deal'}\n` +
        (result.minPrice ? `Minimum was ${result.minPrice / 1e6} USDC` : ''),
        'system'
      );
    }
  } catch (err) {
    addMessage(messages, `❌ Negotiation error: ${err.message}`, 'system');
  }
}

// ── Transaction Feed ──────────────────────────────────────
async function loadTransactions() {
  const list = document.getElementById('tx-list');
  try {
    const res = await fetch(`${API}/api/transactions`);
    const data = await res.json();

    if (data.transactions.length === 0) {
      list.innerHTML = '<div class="tx-empty">No transactions yet. Start buying!</div>';
      return;
    }

    list.innerHTML = data.transactions.map(tx => `
      <div class="tx-item">
        <span class="tx-product">${escapeHtml(tx.productName)}</span>
        <span class="tx-price">${tx.priceUsdc} USDC</span>
        <span class="tx-rep">⭐ ${tx.buyerRep} (-${tx.discount}%)</span>
        <span class="tx-time">${timeSince(tx.timestamp)}</span>
      </div>
    `).join('');
  } catch (err) {
    // silent fail
  }
}

// ── Chat Helpers ──────────────────────────────────────────
function addMessage(container, text, type) {
  const div = document.createElement('div');
  div.className = `message message-${type}`;
  // Parse basic markdown: **bold**, newlines
  div.innerHTML = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addMessageHtml(container, html, type) {
  const div = document.createElement('div');
  div.className = `message message-${type}`;
  div.innerHTML = html;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addTypingIndicator(container) {
  const div = document.createElement('div');
  div.className = 'typing-indicator';
  div.id = 'typing';
  div.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator(container) {
  const el = container.querySelector('#typing');
  if (el) el.remove();
}

// ── Utilities ─────────────────────────────────────────────
function getCategoryEmoji(category) {
  const map = {
    electronics: '📱',
    fashion: '👟',
    furniture: '🪑',
    books: '📚',
    sports: '⚽',
    gaming: '🎮',
    vehicles: '🚗',
    general: '📦',
  };
  return map[category] || '📦';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function timeSince(timestamp) {
  const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ── Authentication ────────────────────────────────────────────

let authMode = 'login'; // 'login' or 'signup'

function initAuth() {
  // Tab Listeners
  document.getElementById('tab-login').addEventListener('click', () => setAuthMode('login'));
  document.getElementById('tab-signup').addEventListener('click', () => setAuthMode('signup'));

  // Form Listener
  document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);

  // Guest Login
  document.getElementById('guest-login-btn').addEventListener('click', loginAsGuest);
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll('.auth-tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tab-${mode}`).classList.add('active');
  document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Sign In to Quickash' : 'Create Account';

  // Toggle signup-only fields
  const signupFields = document.querySelector('.signup-only');
  if (signupFields) {
    signupFields.style.display = mode === 'signup' ? 'block' : 'none';
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const btn = document.getElementById('auth-submit-btn');

  if (!email || !password) {
    alert('Please enter both email and password.');
    return;
  }

  btn.disabled = true;
  btn.textContent = authMode === 'login' ? 'Signing in...' : 'Creating account...';

  try {
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    
    let payload = { email, password };
    if (authMode === 'signup') {
      payload.name = document.getElementById('auth-name').value.trim();
      payload.phone = document.getElementById('auth-phone').value.trim();
      payload.address = document.getElementById('auth-address').value.trim();
      
      if (!payload.name) {
        alert('Please enter your full name.');
        return;
      }
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Authentication failed');
    }

    // Success — log the user in
    onLoginSuccess(data);

  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
  }
}

function onLoginSuccess(user) {
  currentUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=009688&color=fff`,
  };

  // Hide Login Overlay
  document.getElementById('view-login').classList.remove('active');

  // Show user profile in header
  const headerLeft = document.querySelector('.header-left');
  let profileEl = document.getElementById('user-profile-badge');
  if (profileEl) profileEl.remove();

  profileEl = document.createElement('div');
  profileEl.id = 'user-profile-badge';
  profileEl.className = 'user-profile';
  profileEl.innerHTML = `
    <img src="${currentUser.picture}" alt="Avatar" />
    <span>${currentUser.name}</span>
    <button class="logout-btn" title="Sign out" onclick="logout()">
      <span>⨯</span>
    </button>
  `;
  headerLeft.appendChild(profileEl);

  loadProducts();
}

function loginAsGuest() {
  onLoginSuccess({
    id: 'guest-' + Math.random().toString(36).substr(2, 9),
    email: 'guest@quickash.local',
    name: 'Guest User',
    picture: 'https://ui-avatars.com/api/?name=Guest+User&background=009688&color=fff',
  });
}

window.logout = function() {
  currentUser = null;
  document.getElementById('view-login').classList.add('active');
  const badge = document.getElementById('user-profile-badge');
  if (badge) badge.remove();
  // Reset form
  document.getElementById('auth-email').value = '';
  document.getElementById('auth-password').value = '';
  setAuthMode('login');
}

// ── MetaMask Wallet ─────────────────────────────────────

window.connectWallet = async function() {
  if (!window.ethereum) {
    alert('MetaMask is not installed! Please install MetaMask to connect your wallet.');
    return;
  }
  
  try {
    // Request accounts
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    walletAddress = accounts[0];
    
    // Switch to GOAT Testnet3
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: GOAT_CHAIN_ID }],
      });
    } catch (switchError) {
      // Chain not added, try adding it
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: GOAT_CHAIN_ID,
            chainName: 'GOAT Testnet3',
            rpcUrls: [GOAT_RPC],
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            blockExplorerUrls: ['https://explorer.testnet3.goat.network'],
          }],
        });
      }
    }
    
    // Update button
    const btn = document.getElementById('wallet-btn');
    const short = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
    btn.textContent = `✅ ${short}`;
    btn.classList.add('connected');
    
    console.log('[wallet] Connected:', walletAddress);
  } catch (err) {
    console.error('[wallet] Connect error:', err);
    alert('Failed to connect wallet: ' + err.message);
  }
}

// ── Payment Modal ───────────────────────────────────────

window.showPaymentModal = function() {
  if (!pendingPayment) {
    alert('No pending payment found.');
    return;
  }
  
  document.getElementById('pay-product').textContent = pendingPayment.productName;
  document.getElementById('pay-amount').textContent = pendingPayment.amountUsdc + ' USDC';
  document.getElementById('pay-address').textContent = pendingPayment.payToAddress;
  document.getElementById('pay-status').textContent = '';
  document.getElementById('pay-status').className = 'pay-status';
  document.getElementById('payment-modal').style.display = 'flex';
}

window.closePaymentModal = function() {
  document.getElementById('payment-modal').style.display = 'none';
}

window.executePayment = async function() {
  if (!walletAddress) {
    alert('Please connect your MetaMask wallet first!');
    await connectWallet();
    if (!walletAddress) return;
  }
  
  const statusEl = document.getElementById('pay-status');
  const payBtn = document.getElementById('pay-now-btn');
  
  payBtn.disabled = true;
  statusEl.textContent = 'Preparing transaction...';
  statusEl.className = 'pay-status';
  
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    
    // ERC-20 transfer
    const usdc = new ethers.Contract(USDC_CONTRACT, [
      'function transfer(address to, uint256 amount) returns (bool)'
    ], signer);
    
    statusEl.textContent = 'Confirm in MetaMask...';
    const tx = await usdc.transfer(pendingPayment.payToAddress, pendingPayment.amountWei);
    
    statusEl.textContent = 'Waiting for confirmation...';
    await tx.wait();
    
    statusEl.textContent = `✅ Payment confirmed! TX: ${tx.hash.slice(0, 10)}...`;
    statusEl.className = 'pay-status success';
    
    // Confirm with server
    await fetch(`/confirm/${pendingPayment.orderId}`, { method: 'POST' });
    
    const messages = document.getElementById('buyer-messages');
    addMessage(messages, `✅ **Payment Confirmed!**\nTX: ${tx.hash}\n\nYour purchase is complete!`, 'system');
    
    // Close payment modal and show delivery modal
    setTimeout(() => {
      closePaymentModal();
      showDeliveryModal();
    }, 1500);
    
    loadProducts();
    loadTransactions();
    
  } catch (err) {
    console.error('[payment] Error:', err);
    statusEl.textContent = `❌ ${err.message}`;
    statusEl.className = 'pay-status error';
  } finally {
    payBtn.disabled = false;
  }
}

// ── Delivery Modal ──────────────────────────────────────
let deliveryMode = 'ship';

window.showDeliveryModal = function() {
  if (!pendingPayment) return;
  document.getElementById('delivery-product-name').textContent = `📦 ${pendingPayment.productName}`;
  document.getElementById('delivery-modal').style.display = 'flex';
}

window.closeDeliveryModal = function() {
  document.getElementById('delivery-modal').style.display = 'none';
}

window.setDeliveryMode = function(mode) {
  deliveryMode = mode;
  document.querySelectorAll('.delivery-opt').forEach(b => b.classList.remove('active'));
  document.getElementById(`opt-${mode}`).classList.add('active');
  document.getElementById('ship-fields').style.display = mode === 'ship' ? 'block' : 'none';
  document.getElementById('pickup-fields').style.display = mode === 'pickup' ? 'block' : 'none';
}

document.getElementById('delivery-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  let deliveryInfo;
  if (deliveryMode === 'ship') {
    deliveryInfo = {
      mode: 'ship',
      name: document.getElementById('del-name').value,
      address: document.getElementById('del-address').value,
      city: document.getElementById('del-city').value,
      pincode: document.getElementById('del-pincode').value,
      phone: document.getElementById('del-phone').value,
    };
  } else {
    deliveryInfo = {
      mode: 'pickup',
      name: document.getElementById('pickup-name').value,
      phone: document.getElementById('pickup-phone').value,
    };
  }
  
  try {
    const res = await fetch('/api/delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: pendingPayment.orderId,
        productId: pendingPayment.productId,
        delivery: deliveryInfo,
      })
    });
    const data = await res.json();
    
    closeDeliveryModal();
    
    const messages = document.getElementById('buyer-messages');
    if (deliveryMode === 'ship') {
      addMessage(messages,
        `🚚 **Shipping Confirmed!**\n\n` +
        `📦 Your order will be shipped to:\n${deliveryInfo.name}\n${deliveryInfo.address}, ${deliveryInfo.city} ${deliveryInfo.pincode}\n\n` +
        (data.trackingId ? `📍 Tracking ID: ${data.trackingId}` : 'Tracking details will be sent to your email.'),
        'system'
      );
    } else {
      addMessage(messages,
        `📍 **Pickup Confirmed!**\n\n` +
        `The seller has been notified. They'll contact you at ${deliveryInfo.phone} to arrange pickup.\n\n` +
        `✅ Order complete!`,
        'system'
      );
    }
    
    pendingPayment = null;
  } catch (err) {
    alert('Error submitting delivery info: ' + err.message);
  }
});

// ── Initial Load ──────────────────────────────────────────
loadProducts();
setInterval(loadTransactions, 5000);
initAuth();

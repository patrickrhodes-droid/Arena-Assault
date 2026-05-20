import { game } from "../state.js";

// Inventory + hotbar + shop UI. All survival-only — the elements are inserted
// into the DOM at startup but hidden by default; survival mode toggles them.

const ITEM_LABELS = {
  pistol: 'Pistol', shotgun: 'Shotgun', assault: 'Assault', sniper: 'Sniper',
  sword: 'Sword', bazooka: 'Bazooka', grapple: 'Grapple', minigun: 'Minigun',
  pistol_ammo: 'Ammo', medkit: 'Medkit', torch_placeable: 'Torch',
  potion_health: 'HP+', potion_speed: 'SPD', potion_jump: 'JMP',
  potion_fuel: 'FUEL', potion_damage: 'DMG',
  jetpack: 'Jetpack', backpack_small: 'Backpack', backpack_large: 'Pack+',
};

const ITEM_ICON = {
  pistol: '🔫', shotgun: '💥', assault: '🔫', sniper: '🎯', sword: '⚔',
  bazooka: '💣', grapple: '🪝', minigun: '🔫',
  pistol_ammo: '📦', medkit: '⚕', torch_placeable: '🔥',
  potion_health: '🧪', potion_speed: '💨', potion_jump: '↑',
  potion_fuel: '⛽', potion_damage: '⚡',
  jetpack: '🚀', backpack_small: '🎒', backpack_large: '🎒',
};

let _hotbarEl = null;
let _invPanelEl = null;
let _shopEl = null;
let _shopOpen = false;
let _invOpen = false;
let _moneyEl = null;
let _effectsEl = null;
let _bloodMoonEl = null;
let _shopHintEl = null;

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style') Object.assign(n.style, v);
    else if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  for (const c of children) n.appendChild(c);
  return n;
}

function renderSlot(slot, index, parent) {
  const tile = el('div', { class: 'inv-slot', 'data-slot': String(index), style: {
    width: '46px', height: '46px',
    border: '1px solid #444', background: 'rgba(0,0,0,0.55)',
    position: 'relative', cursor: 'pointer',
    boxSizing: 'border-box', display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center',
    fontSize: '20px', color: '#cde',
  }});
  if (index < 9 && index === game.activeSlot) {
    tile.style.outline = '2px solid #00ffaa';
  }
  if (slot) {
    tile.textContent = ITEM_ICON[slot.itemId] || '?';
    if (slot.qty > 1) {
      const qty = el('div', { style: {
        position: 'absolute', bottom: '1px', right: '2px',
        fontSize: '10px', color: '#fff', fontFamily: 'monospace',
      }});
      qty.textContent = String(slot.qty);
      tile.appendChild(qty);
    }
    const lbl = el('div', { style: {
      position: 'absolute', top: '1px', left: '2px',
      fontSize: '8px', color: '#9ab', fontFamily: 'monospace',
      letterSpacing: '0.5px',
    }});
    lbl.textContent = (ITEM_LABELS[slot.itemId] || slot.itemId).slice(0, 6);
    tile.appendChild(lbl);
  }
  // Index number (1-9 for hotbar)
  if (index < 9) {
    const num = el('div', { style: {
      position: 'absolute', top: '1px', right: '3px',
      fontSize: '9px', color: '#688', fontFamily: 'monospace',
    }});
    num.textContent = String(index + 1);
    tile.appendChild(num);
  }
  // Drag/drop
  tile.draggable = true;
  tile.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', String(index));
  });
  tile.addEventListener('dragover', (e) => { e.preventDefault(); });
  tile.addEventListener('drop', (e) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    if (Number.isInteger(from) && from !== index) {
      game.socket?.emit('inventoryReorder', { from, to: index });
    }
  });
  tile.addEventListener('click', () => {
    if (index < 9) {
      game.activeSlot = index;
      game.socket?.emit('inventorySetActive', { slot: index });
      refreshInventoryUI();
    }
  });
  parent.appendChild(tile);
}

function ensureHotbar() {
  if (_hotbarEl) return _hotbarEl;
  _hotbarEl = el('div', { id: 'survival-hotbar', style: {
    position: 'fixed', bottom: '12px', left: '50%',
    transform: 'translateX(-50%)',
    display: 'none',
    gap: '4px',
    padding: '4px',
    background: 'rgba(0,0,0,0.35)',
    border: '1px solid #335',
    zIndex: '40',
  }});
  document.body.appendChild(_hotbarEl);
  return _hotbarEl;
}

function ensureMoneyHUD() {
  if (_moneyEl) return _moneyEl;
  _moneyEl = el('div', { id: 'survival-money', style: {
    position: 'fixed', top: '12px', right: '14px',
    display: 'none',
    padding: '4px 10px',
    background: 'rgba(0,0,0,0.45)',
    border: '1px solid #00ffaa55',
    color: '#00ffaa',
    fontFamily: 'monospace', fontSize: '16px', letterSpacing: '1px',
    zIndex: '40',
  }});
  _moneyEl.textContent = '$0';
  document.body.appendChild(_moneyEl);
  return _moneyEl;
}

function ensureEffects() {
  if (_effectsEl) return _effectsEl;
  _effectsEl = el('div', { id: 'survival-effects', style: {
    position: 'fixed', bottom: '64px', left: '50%',
    transform: 'translateX(-50%)',
    display: 'none',
    gap: '6px',
    fontFamily: 'monospace',
    fontSize: '11px', color: '#fff',
    zIndex: '40',
  }});
  document.body.appendChild(_effectsEl);
  return _effectsEl;
}

function ensureShopHint() {
  if (_shopHintEl) return _shopHintEl;
  _shopHintEl = el('div', { style: {
    position: 'fixed', bottom: '120px', left: '50%',
    transform: 'translateX(-50%)',
    display: 'none',
    padding: '8px 16px',
    background: 'rgba(0, 30, 20, 0.85)',
    border: '1px solid #00ffaa',
    color: '#cffae0',
    fontFamily: 'monospace', fontSize: '14px',
    letterSpacing: '2px',
    zIndex: '42',
    pointerEvents: 'none',
  }});
  _shopHintEl.innerHTML = 'PRESS <span style="color:#00ffaa;font-weight:bold">[E]</span> TO OPEN SHOP';
  document.body.appendChild(_shopHintEl);
  return _shopHintEl;
}

function ensureBloodMoonBanner() {
  if (_bloodMoonEl) return _bloodMoonEl;
  _bloodMoonEl = el('div', { style: {
    position: 'fixed', top: '50px', left: '50%',
    transform: 'translateX(-50%)',
    display: 'none',
    padding: '6px 14px',
    background: 'rgba(80, 4, 4, 0.7)',
    border: '1px solid #ff3030',
    color: '#ffd0d0',
    fontFamily: 'monospace', fontSize: '15px',
    letterSpacing: '3px',
    zIndex: '41',
  }});
  _bloodMoonEl.textContent = 'BLOOD MOON';
  document.body.appendChild(_bloodMoonEl);
  return _bloodMoonEl;
}

function ensureInventoryPanel() {
  if (_invPanelEl) return _invPanelEl;
  _invPanelEl = el('div', { id: 'survival-inv-panel', style: {
    position: 'fixed', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'none',
    padding: '14px',
    background: 'rgba(8, 12, 18, 0.95)',
    border: '1px solid #3a4a5a',
    color: '#cde',
    fontFamily: 'monospace', fontSize: '12px',
    zIndex: '60', minWidth: '440px',
  }});
  const h = el('div', { style: { fontSize: '14px', letterSpacing: '2px', marginBottom: '10px' }});
  h.textContent = 'INVENTORY';
  _invPanelEl.appendChild(h);
  const slots = el('div', { id: 'inv-slots', style: { display: 'flex', flexWrap: 'wrap', gap: '4px' }});
  _invPanelEl.appendChild(slots);
  const hint = el('div', { style: { marginTop: '10px', fontSize: '10px', color: '#788' }});
  hint.textContent = 'Drag slots to reorder. Hotbar = slots 1-9.';
  _invPanelEl.appendChild(hint);
  document.body.appendChild(_invPanelEl);
  return _invPanelEl;
}

function ensureShopUI() {
  if (_shopEl) return _shopEl;
  _shopEl = el('div', { id: 'survival-shop', style: {
    position: 'fixed', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'none',
    padding: '14px',
    background: 'rgba(8, 14, 12, 0.97)',
    border: '1px solid #00ffaa66',
    color: '#cde',
    fontFamily: 'monospace', fontSize: '12px',
    zIndex: '60', minWidth: '420px', maxHeight: '70vh',
    overflowY: 'auto',
  }});
  const h = el('div', { style: { fontSize: '14px', letterSpacing: '2px', marginBottom: '10px', color: '#00ffaa' }});
  h.textContent = 'OUTPOST SHOP';
  _shopEl.appendChild(h);
  const status = el('div', { id: 'shop-status', style: { fontSize: '10px', color: '#788', marginBottom: '8px' }});
  status.textContent = 'Press E to close.';
  _shopEl.appendChild(status);
  const list = el('div', { id: 'shop-list' });
  _shopEl.appendChild(list);
  document.body.appendChild(_shopEl);
  return _shopEl;
}

export function refreshInventoryUI() {
  if (game.mode !== 'SURVIVAL') {
    if (_hotbarEl) _hotbarEl.style.display = 'none';
    if (_moneyEl) _moneyEl.style.display = 'none';
    if (_effectsEl) _effectsEl.style.display = 'none';
    if (_bloodMoonEl) _bloodMoonEl.style.display = 'none';
    if (_shopHintEl) _shopHintEl.style.display = 'none';
    return;
  }
  // Shop proximity hint: show when within vendor reach and shop is closed.
  const pp = game.visuals?.player?.playerGroup?.position;
  if (pp && !_shopOpen) {
    const dx = pp.x - 0, dz = pp.z - (-6);
    const near = dx * dx + dz * dz < 36; // 6u radius
    ensureShopHint().style.display = near ? 'block' : 'none';
  } else if (_shopHintEl) {
    _shopHintEl.style.display = 'none';
  }
  ensureHotbar().style.display = 'flex';
  const money = ensureMoneyHUD();
  money.style.display = 'block';
  money.textContent = `$${game.money | 0}`;
  // Repaint hotbar
  _hotbarEl.innerHTML = '';
  const inv = Array.isArray(game.inventory) ? game.inventory : [];
  for (let i = 0; i < 9; i++) renderSlot(inv[i] || null, i, _hotbarEl);
  // Effects line
  const fx = ensureEffects();
  const parts = [];
  for (const [k, v] of Object.entries(game.effects || {})) {
    const remain = Math.max(0, Math.round((v.until - Date.now()) / 1000));
    parts.push(`${k.toUpperCase()} ${remain}s`);
  }
  if (parts.length > 0) {
    fx.style.display = 'flex';
    fx.textContent = parts.join('  •  ');
  } else {
    fx.style.display = 'none';
  }
  // Blood moon banner
  const bm = ensureBloodMoonBanner();
  bm.style.display = game.bloodMoon ? 'block' : 'none';
  // Inv panel if open
  if (_invOpen && _invPanelEl) {
    const slotEl = _invPanelEl.querySelector('#inv-slots');
    slotEl.innerHTML = '';
    const cap = 9 + (game.backpackTier || 0) * 9;
    for (let i = 0; i < cap; i++) renderSlot(inv[i] || null, i, slotEl);
  }
}

const CLIENT_FALLBACK_CATALOG = [
  { id: 'pistol_ammo',  name: 'Pistol Ammo',    price: 20,  kind: 'consumable' },
  { id: 'shotgun',      name: 'Shotgun',        price: 150, kind: 'weapon' },
  { id: 'assault',      name: 'Assault Rifle',  price: 250, kind: 'weapon' },
  { id: 'sniper',       name: 'Sniper Rifle',   price: 400, kind: 'weapon' },
  { id: 'bazooka',      name: 'Bazooka',        price: 700, kind: 'weapon' },
  { id: 'minigun',      name: 'Minigun',        price: 950, kind: 'weapon' },
  { id: 'jetpack',      name: 'Jetpack',        price: 500, kind: 'gear' },
  { id: 'torch_placeable', name: 'Torch',       price: 30,  kind: 'placeable' },
  { id: 'medkit',       name: 'Medkit',         price: 80,  kind: 'consumable' },
  { id: 'potion_health', name: 'Health Potion', price: 60,  kind: 'consumable' },
  { id: 'potion_speed',  name: 'Speed Potion',  price: 90,  kind: 'consumable' },
  { id: 'potion_jump',   name: 'Jump Potion',   price: 70,  kind: 'consumable' },
  { id: 'potion_fuel',   name: 'Fuel Potion',   price: 120, kind: 'consumable' },
  { id: 'potion_damage', name: 'Damage Potion', price: 150, kind: 'consumable' },
  { id: 'backpack_small', name: 'Small Backpack', price: 300, kind: 'gear' },
  { id: 'backpack_large', name: 'Large Backpack', price: 800, kind: 'gear' },
];

function releasePointerLock() {
  // Exit pointer lock and explicitly show the OS cursor. Three.js holds the
  // lock until exitPointerLock fires; also nudge the canvas style in case the
  // browser keeps the cursor:none rule on it.
  if (document.pointerLockElement) document.exitPointerLock?.();
  const canvas = document.querySelector('canvas');
  if (canvas) canvas.style.cursor = 'auto';
  // Block player-fire while a modal is open (set a flag the input layer reads).
  game.modalOpen = true;
}

function restorePointerLockState() {
  // Allow firing again only when both modals are closed.
  if (!_shopOpen && !_invOpen) {
    game.modalOpen = false;
    const canvas = document.querySelector('canvas');
    if (canvas) canvas.style.cursor = '';
  }
}

export function toggleInventoryPanel() {
  _invOpen = !_invOpen;
  ensureInventoryPanel().style.display = _invOpen ? 'block' : 'none';
  if (_invOpen) releasePointerLock();
  else restorePointerLockState();
  refreshInventoryUI();
}

export function toggleShopUI() {
  _shopOpen = !_shopOpen;
  if (_shopOpen) {
    releasePointerLock();
    // Show with the client-side fallback catalog so the modal is never empty.
    if (!game.shopCatalog || game.shopCatalog.length === 0) {
      game.shopCatalog = CLIENT_FALLBACK_CATALOG;
    }
    renderShopCatalog();
    game.socket?.emit('shopOpen');
  } else {
    restorePointerLockState();
  }
  ensureShopUI().style.display = _shopOpen ? 'block' : 'none';
}

export function renderShopCatalog() {
  if (!_shopEl) return;
  const list = _shopEl.querySelector('#shop-list');
  list.innerHTML = '';
  for (const item of (game.shopCatalog || [])) {
    const row = el('div', { style: {
      display: 'flex', justifyContent: 'space-between',
      padding: '4px 6px', borderBottom: '1px dashed #244',
      cursor: 'pointer',
    }});
    row.innerHTML = `<span>${ITEM_ICON[item.id] || '•'} ${item.name}</span><span style="color:#00ffaa">$${item.price}</span>`;
    row.addEventListener('click', () => {
      game.socket?.emit('shopPurchase', { itemId: item.id, qty: 1 });
    });
    list.appendChild(row);
  }
}

export function flashShopRejected(reason) {
  const s = _shopEl?.querySelector('#shop-status');
  if (!s) return;
  const map = {
    distance: 'You must be at the outpost vendor.',
    broke: 'Not enough money.',
    inventory_full: 'Inventory full.',
    requires_small: 'Requires Small Backpack first.',
  };
  s.textContent = map[reason] || 'Purchase failed.';
  s.style.color = '#ff5050';
  setTimeout(() => { s.textContent = 'Press E to close.'; s.style.color = '#788'; }, 2400);
}

export function flashShopPurchase(itemId) {
  const s = _shopEl?.querySelector('#shop-status');
  if (!s) return;
  s.textContent = `Bought ${ITEM_LABELS[itemId] || itemId}.`;
  s.style.color = '#00ffaa';
  setTimeout(() => { s.textContent = 'Press E to close.'; s.style.color = '#788'; }, 1600);
  refreshInventoryUI();
}

// Hook globals so network.js can call without circular imports.
if (typeof window !== 'undefined') {
  window.refreshInventoryUI = refreshInventoryUI;
  window.toggleInventoryPanel = toggleInventoryPanel;
  window.toggleShopUI = toggleShopUI;
  window.renderShopCatalog = renderShopCatalog;
  window.flashShopRejected = flashShopRejected;
  window.flashShopPurchase = flashShopPurchase;
  window.spawnMoneyToast = function (delta) {
    if (!_moneyEl) return;
    const t = el('div', { style: {
      position: 'fixed', top: '36px', right: '20px',
      color: delta > 0 ? '#00ffaa' : '#ff7070',
      fontFamily: 'monospace', fontSize: '13px',
      zIndex: '50', pointerEvents: 'none',
      transition: 'opacity 1.4s linear, transform 1.4s ease-out',
    }});
    t.textContent = (delta > 0 ? '+' : '') + '$' + delta;
    document.body.appendChild(t);
    requestAnimationFrame(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(-30px)';
    });
    setTimeout(() => t.remove(), 1500);
  };
  window.addPlacedTorch = function (data) {
    // Defer to scene.js to actually add a mesh + point light
    if (window.__addPlacedTorchMesh) window.__addPlacedTorchMesh(data);
  };
  window.showSurvivalEndScreen = function () {
    const m = el('div', { style: {
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', background: 'rgba(0,0,0,0.85)',
      color: '#fff', fontFamily: 'monospace', zIndex: '80',
    }});
    m.innerHTML = `
      <div style="font-size:28px;letter-spacing:4px;color:#ff5050">PARTY WIPE</div>
      <div style="margin-top:14px;font-size:14px;color:#aab">The run is over.</div>
      <div style="margin-top:22px;font-size:13px;color:#cde">Best money this run: $${game.money|0}</div>
      <button id="surv-redeploy" style="margin-top:32px;padding:8px 20px;background:#080;color:#fff;border:none;font-family:monospace;cursor:pointer">REDEPLOY</button>
    `;
    document.body.appendChild(m);
    m.querySelector('#surv-redeploy').addEventListener('click', () => window.location.reload());
  };
}

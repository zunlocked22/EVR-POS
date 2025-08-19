// pos.js (full file) ------------------------------------------------------
// ====== SAFER localStorage WRAPPER ======
const SafeLS = (() => {
  let ok = true;
  try { const t='__t'; localStorage.setItem(t,'1'); localStorage.removeItem(t); }
  catch(e){ ok = false; console.warn('localStorage disabled, using memory fallback:', e); }
  const mem = {};
  return {
    getItem(k){ return ok ? localStorage.getItem(k) : (k in mem ? mem[k] : null); },
    setItem(k,v){ if(ok) localStorage.setItem(k,v); else mem[k]=String(v); },
    removeItem(k){ if(ok) localStorage.removeItem(k); else delete mem[k]; }
  };
})();

// ====== CONFIG ======
const ADMIN_PASSWORD = 'admin123';
const STORE_NAME = 'EVR VET OPTIONS';
const STORE_ADDRESS = 'Vivape Center, Lot 2 Block 6, Brgy Camachiles, MacArthur Hwy, Mabalacat City, Pampanga';

// ====== PRODUCTS DB (defaults) ======
const DEFAULT_PRODUCTS = {
  "1":  { name: "Dog Food",         price: 120, stock: 50, brand: "Pedigree" },
  "2":  { name: "Cat Food (500g)",  price:  90, stock: 30, brand: "Whiskas" },
  "13": { name: "Vitamins",         price:  60, stock: 40, brand: "Zoetis" }
};

let productDB = {};
function loadProductsFromStorage(){
  const savedRaw = SafeLS.getItem('pos_products');
  const saved = savedRaw ? JSON.parse(savedRaw) : {};
  productDB = Object.assign({}, DEFAULT_PRODUCTS, saved);
}
function saveProductsToStorage(){ SafeLS.setItem('pos_products', JSON.stringify(productDB)); }

// ====== CART ======
let cart = [];

function scanProduct(code=null){
  const barcodeEl = document.getElementById('barcode');
  const inputCode = (code || (barcodeEl && barcodeEl.value) || '').toString().trim();
  const qtyInput = parseInt(document.getElementById('quantity').value) || 1;
  if(!inputCode) return;

  if(!productDB[inputCode]){
    if(confirm('Product not found. Register it now?')){ openProductsModal(inputCode); }
    else { if(barcodeEl) barcodeEl.value = ''; }
    return;
  }

  const stock = parseInt(productDB[inputCode].stock || 0);
  const existing = cart.find(p => p.code === inputCode);
  const newQty = (existing ? existing.qty : 0) + qtyInput;
  if(newQty > stock){ alert(`Not enough stock. Available: ${stock}`); return; }

  if(existing){ existing.qty += qtyInput; }
  else{
    const { name, price, brand } = productDB[inputCode];
    cart.push({ code:inputCode, name, qty:qtyInput, price:parseFloat(price), brand:brand||'' });
  }
  autoApplyDiscountIfQualified();
  renderCart();
  saveCartToStorage();
  if(barcodeEl) barcodeEl.value = '';
}

function renderCart(){
  const tbody = document.getElementById('cartBody');
  if(!tbody) return;
  tbody.innerHTML = '';
  cart.forEach((item, idx) => {
    tbody.insertAdjacentHTML('beforeend', `
      <tr data-brand="${(item.brand||'').replace(/"/g,'&quot;')}">
        <td>${item.code}</td>
        <td class="text-start">${escapeHtml(item.name)}</td>
        <td>${item.qty}</td>
        <td class="right">${item.price.toFixed(2)}</td>
        <td class="right">${(item.qty*item.price).toFixed(2)}</td>
        <td>
          <button type="button" class="btn btn-sm btn-warning" onclick="openEditQty(${idx})">✏️ Edit</button>
          <button type="button" class="btn btn-sm btn-danger ms-1" onclick="removeItem(${idx})">❌</button>
        </td>
      </tr>`);
  });
  calculateChange();
}

function removeItem(index){ cart.splice(index,1); autoApplyDiscountIfQualified(); renderCart(); saveCartToStorage(); }
function getCartSubtotal(){ return cart.reduce((s,i)=>s+i.qty*i.price,0); }

// ====== DISCOUNT ======
function autoApplyDiscountIfQualified(){
  const subtotal = getCartSubtotal();
  const hasSingleBig = cart.some(i => i.price >= 5000 && i.qty === 1);
  const d = document.getElementById('discountInput');
  if(d){
    if(subtotal >= 5000 || hasSingleBig){ if(!d.dataset.userEdited){ d.value = 5; d.dataset.autoApplied = '1'; } }
    else { if(!d.dataset.userEdited){ d.value = 0; delete d.dataset.autoApplied; } }
    recalcTotalsDisplay();
  }
}
document.addEventListener('input', (e) => {
  if(e.target && e.target.id === 'discountInput') { e.target.dataset.userEdited='1'; recalcTotalsDisplay(); }
});
function setDiscountPreset(v){ const d=document.getElementById('discountInput'); if(d){ d.value=v; d.dataset.userEdited='1'; recalcTotalsDisplay(); } }

// ====== PAYMENT UI ======
document.addEventListener('change', (e) => { if(e.target && e.target.id === 'paymentMethod') syncPaymentUI(); });
document.addEventListener('input', (e) => { if(e.target && e.target.id === 'cashInput') calculateChange(); });

function syncPaymentUI(){
  const methodEl = document.getElementById('paymentMethod');
  if(!methodEl) return;
  const method = methodEl.value;
  const cashEl = document.getElementById('cashInput');
  const refEl  = document.getElementById('paymentRef');
  if(method==='Cash'){
    if(cashEl) { cashEl.disabled=false; }
    if(refEl) refEl.classList.add('d-none');
    const ch = document.getElementById('changeContainer'); if(ch) ch.classList.remove('d-none');
  } else {
    if(cashEl){ cashEl.value=''; cashEl.disabled=true; }
    if(refEl) refEl.classList.remove('d-none');
    const ch = document.getElementById('changeContainer'); if(ch) ch.classList.add('d-none');
  }
  recalcTotalsDisplay();
}

function recalcTotalsDisplay(){
  const subtotal = getCartSubtotal();
  const dEl = document.getElementById('discountInput');
  const dPct = parseFloat((dEl && dEl.value) || 0) || 0;
  const dAmt = subtotal * (dPct/100);
  const total = subtotal - dAmt;
  const cash = parseFloat((document.getElementById('cashInput') && document.getElementById('cashInput').value) || 0) || 0;
  if(document.getElementById('subtotalDisplay')) document.getElementById('subtotalDisplay').innerText = subtotal.toFixed(2);
  if(document.getElementById('discountDisplay')) document.getElementById('discountDisplay').innerText = dAmt.toFixed(2);
  if(document.getElementById('discountPercentDisplay')) document.getElementById('discountPercentDisplay').innerText = `(${dPct}%)`;
  if(document.getElementById('totalDisplay')) document.getElementById('totalDisplay').innerText = total.toFixed(2);
  if(document.getElementById('change')) document.getElementById('change').innerText = (cash - total).toFixed(2);
}
function calculateChange(){ recalcTotalsDisplay(); }

function clearCart(){
  cart = [];
  renderCart();
  saveCartToStorage();
  const cashIn = document.getElementById('cashInput'); if(cashIn) cashIn.value = '';
  const d=document.getElementById('discountInput'); if(d){ d.value=0; delete d.dataset.userEdited; delete d.dataset.autoApplied; }
}

// ====== INVOICE ======
function generateInvoiceNumber(){
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const dd = String(today.getDate()).padStart(2,'0');
  const dateKey = `${yyyy}${mm}${dd}`;
  const countersRaw = SafeLS.getItem('evr_invoice_counters') || '{}';
  const counters = JSON.parse(countersRaw || '{}');
  const current = (counters[dateKey] || 0) + 1;
  counters[dateKey] = current;
  SafeLS.setItem('evr_invoice_counters', JSON.stringify(counters));
  const seq = String(current).padStart(4,'0');
  return `EVR-${dateKey}-${seq}`;
}

// ====== NORMALIZED HISTORY HELPERS ======
function loadNormalizedHistory(){
  const raw = SafeLS.getItem('transactionHistory') || '[]';
  let data;
  try {
    data = JSON.parse(raw);
    if(!Array.isArray(data)) data = [];
  } catch(e) {
    console.warn('transactionHistory is not valid JSON, resetting to []', e);
    data = [];
  }

  data = data.map(t => {
    const copy = Object.assign({}, t);
    if (typeof copy.items === 'string') {
      try { copy.items = JSON.parse(copy.items); }
      catch(e){ console.warn('Could not parse items JSON for invoice', copy.invoice, e); copy.items = []; }
    }
    if (!Array.isArray(copy.items)) copy.items = [];
    copy.total = Number(copy.total || 0);
    copy.subtotal = Number(copy.subtotal || 0);
    copy.discountPercent = Number(copy.discountPercent || 0);
    copy.discountAmount = Number(copy.discountAmount || 0);
    copy.cash = Number(copy.cash || 0);
    copy.change = Number(copy.change || 0);
    return copy;
  });

  return data;
}

// ====== HISTORY (save, render, filters) ======
function saveTransaction(){
  if(cart.length===0) return alert('Cart is empty.');
  const subtotal = getCartSubtotal();
  const dPct = parseFloat(document.getElementById('discountInput').value) || 0;
  const dAmt = subtotal * (dPct/100);
  const total = subtotal - dAmt;

  const method = document.getElementById('paymentMethod').value;
  const refNo = (document.getElementById('paymentRef') && document.getElementById('paymentRef').value || '').trim();
  const cash = parseFloat(document.getElementById('cashInput').value || 0);
  if(method==='Cash' && cash < total) return alert('Not enough cash');
  if((method==='GCash' || method==='Card') && !refNo) return alert('Please enter Ref/Approval No.');

  const customer = (document.getElementById('customerName').value || '').trim() || 'Unknown';
  const date = new Date().toLocaleString();
  const invoice = generateInvoiceNumber();
  const reason = (subtotal >= 5000) ? 'Promo: Purchase over ₱5,000' : (cart.some(i=>i.price>=5000 && i.qty===1) ? 'Promo: Single item ₱5,000+' : '');

  // Deduct stock
  cart.forEach(i => { if(productDB[i.code]){ productDB[i.code].stock = (parseInt(productDB[i.code].stock||0)) - i.qty; if(productDB[i.code].stock<0) productDB[i.code].stock = 0; } });
  saveProductsToStorage();

  const items = cart.map(i=>({ code:i.code, name:i.name, qty:i.qty, price:i.price, brand:i.brand||'' }));
  let data = loadNormalizedHistory();
  data.push({ invoice, date, customer, items, subtotal, discountPercent:dPct, discountAmount:dAmt, total, cash: method==='Cash'?cash:0, change: method==='Cash'? (cash-total):0, reason, paymentMethod:method, refNo });
  // trim to last 5000 entries as safety
  if(Array.isArray(data) && data.length > 5000) data = data.slice(data.length - 5000);
  SafeLS.setItem('transactionHistory', JSON.stringify(data));

  clearCart();
  SafeLS.removeItem('evr_cart');
  if(document.getElementById('customerName')) document.getElementById('customerName').value='';
  if(document.getElementById('paymentRef')) document.getElementById('paymentRef').value='';
  renderProductsTable();
  renderHistory();
  alert('Saved! Invoice: '+invoice);
}

function toggleHistory(){
  populateHistoryBrandFilter();
  renderHistory();
  const el = document.getElementById('historyModal');
  if(window.bootstrap){ new bootstrap.Modal(el).show(); }
  else { el.classList.add('show'); el.style.display='block'; }
}

function populateHistoryBrandFilter(){
  const brands = new Set();
  Object.values(productDB).forEach(p => { if(p && p.brand) brands.add(p.brand); });

  const hist = loadNormalizedHistory();
  hist.forEach(t => {
    if(!Array.isArray(t.items)) return;
    t.items.forEach(i => { if(i && i.brand) brands.add(i.brand); });
  });

  const sel = document.getElementById('historyBrandFilter');
  if(!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">All Brands</option>' + Array.from(brands).sort().map(b=>`<option value="${b}">${b}</option>`).join('');
  if(Array.from(brands).includes(current)) sel.value = current;
}

// Improved renderHistory with preview + view modal
function renderHistory(){
  const data = loadNormalizedHistory();
  const tbody = document.getElementById('historyBody');
  const query = (document.getElementById('searchHistory') && document.getElementById('searchHistory').value||'').toLowerCase();
  const brandFilter = (document.getElementById('historyBrandFilter') && document.getElementById('historyBrandFilter').value||'').toLowerCase();
  if(!tbody) return;
  tbody.innerHTML = '';

  // iterate newest-first
  for (let idxRev = 0; idxRev < data.length; idxRev++){
    const idx = data.length - 1 - idxRev;
    const t = data[idx];
    if(!t) continue;
    const items = Array.isArray(t.items) ? t.items : [];

    // build readable strings for items
    const itemsReadable = items.map(it => {
      const brandMarker = it.brand ? '['+it.brand+'] ' : '';
      return { code: it.code||'', text: `${brandMarker}${it.name||''} x${it.qty||0} @${(Number(it.price||0)).toFixed(2)}`, raw: it };
    });

    // assemble preview (first 3) and count more
    const previewCount = 3;
    const previewList = itemsReadable.slice(0, previewCount).map(i => i.text).join('; ');
    const moreCount = Math.max(0, itemsReadable.length - previewCount);

    // searchable haystack
    const hay = `${t.invoice||''} ${t.date||''} ${t.customer||''} ${itemsReadable.map(it=>it.text).join('; ')} ${t.paymentMethod||''} ${t.refNo||''}`.toLowerCase();
    if(query && !hay.includes(query)) continue;
    if(brandFilter && !items.some(it => (it.brand||'').toLowerCase() === brandFilter)) continue;

    // safe invoice used for data attribute
    const invoiceSafe = (t.invoice || '').replace(/"/g,'&quot;').replace(/'/g,"&#39;");

    // build a single TR with exactly the same number of TDs as header
    const rowHtml = `
  <tr>
    <td>${escapeHtml(t.invoice||'')}</td>
    <td>${escapeHtml(t.date||'')}</td>
    <td>${escapeHtml(t.customer||'')}</td>
    <td class="text-start">
      <span class="history-items-preview">${escapeHtml(previewList || '(no items)')}</span>
      ${moreCount>0?` <button type="button" class="btn btn-link btn-sm view-items-btn" data-invoice="${invoiceSafe}" data-idx="${idx}">+${moreCount} more</button>` : ''}
    </td>
    <td class="right">${(Number(t.total)||0).toFixed(2)}</td>
    <td>${escapeHtml(t.paymentMethod||'')}</td>
    <td class="truncate-1line">${escapeHtml(t.refNo||'')}</td>
    <td class="right">${(Number(t.cash)||0).toFixed(2)}</td>
    <td class="right">${(Number(t.change)||0).toFixed(2)}</td>
    <td class="right">${Number(t.discountPercent || 0)}%</td>
    <td class="text-start truncate-1line">${escapeHtml(t.reason||'')}</td>

    <!-- THIS is the Action cell (single TD). Put buttons here. -->
    <td class="action-cell align-middle" title="Actions">

      <div class="history-actions" role="group" aria-label="actions">
        <button type="button" class="btn act-btn btn-primary" title="Print" onclick="printHistoryReceipt(${idx})">🖨️</button>
        <button type="button" class="btn act-btn btn-warning" title="Edit" onclick="openEditTransactionModal(${idx})">✏️</button>
        <button type="button" class="btn act-btn btn-info" title="Refund" onclick="openRefundModal(${idx})">↩️</button>
        <button type="button" class="btn act-btn btn-danger" title="Void" onclick="showAdminModal('void', ${idx})">⛔</button>
      </div>
    </td>
  </tr>
`;

    tbody.insertAdjacentHTML('beforeend', rowHtml);
  }

  // attach view-items handlers (safe attach/remove)
  Array.from(document.querySelectorAll('#historyBody .view-items-btn')).forEach(btn => {
    if(btn._viewHandler) btn.removeEventListener('click', btn._viewHandler);
    btn._viewHandler = function(e){
      const invoice = e.currentTarget.dataset.invoice;
      const idx = parseInt(e.currentTarget.dataset.idx);
      openItemsModalByInvoice(invoice, idx);
    };
    btn.addEventListener('click', btn._viewHandler);
  });

  if(tbody.children.length === 0){
    tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted">No results</td></tr>';
  }
}


// ====== PRINTING (new reliable method using print window) ======
function openPrintWindow(receiptHtml, winTitle = 'Receipt') {
  const html = `
    <!doctype html><html><head><meta charset="utf-8"><title>${winTitle}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      body { font-family: monospace, "Segoe UI", Arial; margin: 8px; color:#000; }
      .center { text-align:center; }
      .store { font-weight:700; font-size:16px; margin-bottom:4px; }
      .address { font-size:11px; margin-bottom:8px; }
      table { width:100%; border-collapse: collapse; font-size:13px; }
      th, td { padding:4px 6px; }
      td.right { text-align:right; }
      hr { border: none; border-top: 1px dashed #444; margin:8px 0; }
      .totals { margin-top:8px; font-size:14px; }
      .small { font-size:11px; color:#333; }
      @media print { @page { margin: 6mm; } body { margin:0; } }
    </style>
    </head><body>${receiptHtml}</body></html>
  `;
  const w = window.open('', '_blank', 'toolbar=0,location=0,menubar=0,width=400,height=600');
  if (!w) { alert('Popup blocked. Allow popups for this site to print receipts.'); return null; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = function() {
    setTimeout(() => {
      try { w.print(); } catch (e) { console.warn('Print failed:', e); }
      setTimeout(() => { try{ w.close(); }catch(e){} }, 500);
    }, 150);
  };
  return w;
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function printReceipt(){
  if(cart.length===0) return alert('Cart is empty.');
  const customer = (document.getElementById('customerName') && document.getElementById('customerName').value.trim()) || 'Unknown';
  const subtotal = getCartSubtotal();
  const dPct = parseFloat(document.getElementById('discountInput').value) || 0;
  const dAmt = subtotal * (dPct/100);
  const total = subtotal - dAmt;
  const method = document.getElementById('paymentMethod').value;
  const refNo = (document.getElementById('paymentRef') && document.getElementById('paymentRef').value || '').trim();
  const cash = parseFloat(document.getElementById('cashInput').value || 0);
  if(method==='Cash' && cash < total) return alert('Not enough cash');
  if((method==='GCash' || method==='Card') && !refNo) return alert('Please enter Ref/Approval No.');
  const invoice = generateInvoiceNumber();
  const reason = (subtotal >= 5000) ? 'Promo: Purchase over ₱5,000' : (cart.some(i=>i.price>=5000 && i.qty===1) ? 'Promo: Single item ₱5,000+' : '');

  let itemsHtml = '';
  cart.forEach(item => {
    const itemTotal = item.qty * item.price;
    itemsHtml += `<tr><td style="text-align:left;">${escapeHtml(item.name)}</td><td class="right">${item.qty}</td><td class="right">${item.price.toFixed(2)}</td><td class="right">${itemTotal.toFixed(2)}</td></tr>`;
  });

  const receiptHtml = `
    <div class="center store">${escapeHtml(STORE_NAME)}</div>
    <div class="center address">${escapeHtml(STORE_ADDRESS)}</div>
    <div style="margin-top:6px;"><strong>Invoice:</strong> ${escapeHtml(invoice)}</div>
    <div><strong>Date:</strong> ${escapeHtml(new Date().toLocaleString())}</div>
    <div><strong>Customer:</strong> ${escapeHtml(customer)}</div>
    <hr>
    <table><thead><tr><th style="width:48%;">Item</th><th style="width:12%;">Qty</th><th style="width:20%;">Price</th><th style="width:20%;">Total</th></tr></thead><tbody>
      ${itemsHtml}
    </tbody></table>
    <hr>
    <div class="totals">
      <div><strong>Subtotal:</strong> ₱${subtotal.toFixed(2)}</div>
      <div><strong>Discount (${dPct}%):</strong> -₱${dAmt.toFixed(2)}</div>
      <div style="font-size:16px; margin-top:6px;"><strong>Total:</strong> ₱${total.toFixed(2)}</div>
      <div style="margin-top:6px;"><strong>Payment:</strong> ${escapeHtml(method)} ${refNo?`(#${escapeHtml(refNo)})`:''}</div>
      ${method==='Cash' ? `<div><strong>Cash:</strong> ₱${cash.toFixed(2)}</div><div><strong>Change:</strong> ₱${(cash-total).toFixed(2)}</div>` : ''}
      <div style="margin-top:6px;">Reason: ${escapeHtml(reason)}</div>
    </div>
    <hr>
    <div class="center small">${escapeHtml(STORE_NAME)}\n${escapeHtml(STORE_ADDRESS)}</div>
    <div class="center" style="margin-top:10px;">Thank you!</div>
  `;
  openPrintWindow(receiptHtml, 'Receipt - '+invoice);
}

function printHistoryReceipt(index){
  const data = loadNormalizedHistory();
  const t = data[index];
  if(!t) return alert('Transaction not found');
  let itemsHtml = '';
  (t.items || []).forEach(item => {
    const itemTotal = Number(item.qty) * Number(item.price);
    itemsHtml += `<tr><td style="text-align:left;">${escapeHtml(item.name)}</td><td class="right">${Number(item.qty)}</td><td class="right">${Number(item.price).toFixed(2)}</td><td class="right">${itemTotal.toFixed(2)}</td></tr>`;
  });
  const receiptHtml = `
    <div class="center store">${escapeHtml(STORE_NAME)}</div>
    <div class="center address">${escapeHtml(STORE_ADDRESS)}</div>
    <div style="margin-top:6px;"><strong>Invoice:</strong> ${escapeHtml(t.invoice || '')}</div>
    <div><strong>Date:</strong> ${escapeHtml(t.date || '')}</div>
    <div><strong>Customer:</strong> ${escapeHtml(t.customer || 'Unknown')}</div>
    <hr>
    <table><thead><tr><th style="width:48%;">Item</th><th style="width:12%;">Qty</th><th style="width:20%;">Price</th><th style="width:20%;">Total</th></tr></thead><tbody>
      ${itemsHtml}
    </tbody></table>
    <hr>
    <div class="totals">
      <div><strong>Subtotal:</strong> ₱${Number(t.subtotal||0).toFixed(2)}</div>
      <div><strong>Discount (${Number(t.discountPercent||0)}%):</strong> -₱${Number(t.discountAmount||0).toFixed(2)}</div>
      <div style="font-size:16px; margin-top:6px;"><strong>Total:</strong> ₱${Number(t.total||0).toFixed(2)}</div>
      <div style="margin-top:6px;"><strong>Payment:</strong> ${escapeHtml(t.paymentMethod||'')} ${t.refNo?`(#${escapeHtml(t.refNo)})`:''}</div>
      ${t.paymentMethod==='Cash' ? `<div><strong>Cash:</strong> ₱${Number(t.cash||0).toFixed(2)}</div><div><strong>Change:</strong> ₱${Number(t.change||0).toFixed(2)}</div>` : ''}
      <div style="margin-top:6px;">Reason: ${escapeHtml(t.reason||'')}</div>
    </div>
    <hr>
    <div class="center small">${escapeHtml(STORE_NAME)}\n${escapeHtml(STORE_ADDRESS)}</div>
    <div class="center" style="margin-top:10px;">Thank you!</div>
  `;
  openPrintWindow(receiptHtml, 'Receipt - '+(t.invoice || ''));
}

// ====== TOP SUPPLIERS ======
function getSupplierEarnings(){
  const history = loadNormalizedHistory();
  const map = {};
  history.forEach(t => { (t.items||[]).forEach(i => {
    const b = (i.brand||'').trim();
    if(!b) return;
    map[b] = map[b] || { earnings:0, qty:0 };
    map[b].earnings += (Number(i.price||0) * Number(i.qty||0));
    map[b].qty += Number(i.qty||0);
  }); });
  return Object.entries(map).sort((a,b)=> b[1].earnings - a[1].earnings);
}

function showTopSuppliers(){
  const rows = getSupplierEarnings();
  const tbody = document.getElementById('topSuppliersBody');
  if(!tbody) return;

  const modalBody = document.querySelector('#topSuppliersModal .modal-body');
  if(modalBody && !modalBody.querySelector('.ts-search')){
    const searchDiv = document.createElement('div');
    searchDiv.className = 'mb-2 ts-search';
    searchDiv.innerHTML = `<input class="form-control" id="topSupplierSearch" placeholder="Search supplier...">`;
    modalBody.prepend(searchDiv);
    const searchEl = modalBody.querySelector('#topSupplierSearch');
    searchEl.addEventListener('input', renderTopSuppliersTable);
  }

  renderTopSuppliersTable();

  function renderTopSuppliersTable(){
    const q = (document.getElementById('topSupplierSearch') && document.getElementById('topSupplierSearch').value||'').toLowerCase();
    tbody.innerHTML = '';
    if(!rows.length){ tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No data yet.</td></tr>'; return; }
    rows.forEach((row, idx) => {
      const brand = row[0]; const meta = row[1];
      if(q && !brand.toLowerCase().includes(q)) return;
      tbody.insertAdjacentHTML('beforeend', `
        <tr>
          <td>${idx+1}</td>
          <td>${escapeHtml(brand)}</td>
          <td class="right">${meta.qty}</td>
          <td class="right">₱${meta.earnings.toFixed(2)}</td>
        </tr>`);
    });
  }

  const el = document.getElementById('topSuppliersModal');
  if(window.bootstrap){ new bootstrap.Modal(el).show(); }
  else { el.classList.add('show'); el.style.display='block'; }
}

function openBrandInHistory(brand){
  populateHistoryBrandFilter();
  const searchHistoryEl = document.getElementById('searchHistory'); if(searchHistoryEl) searchHistoryEl.value = brand;
  renderHistory();
  const el = document.getElementById('historyModal');
  if(window.bootstrap){ new bootstrap.Modal(el).show(); }
  else { el.classList.add('show'); el.style.display='block'; }
}

// ====== PRODUCTS / MANAGE PRODUCTS UI ======
// (first version gets replaced later by improved version — OK lang, last definition wins)
function renderProductsTable() {
  const tbody = document.getElementById('productsBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const codes = Object.keys(productDB).sort((a,b)=> {
    const na = Number(a), nb = Number(b);
    if(!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
  if(codes.length === 0){
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No products registered</td></tr>';
    return;
  }
  codes.forEach(code => {
    const product = productDB[code];
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${escapeHtml(code)}</td>
        <td>${escapeHtml(product.name)}</td>
        <td>${escapeHtml(product.brand || '')}</td>
        <td class="right">${Number(product.price).toFixed(2)}</td>
        <td class="right">${Number(product.stock).toFixed(0)}</td>
        <td>
          <button class="btn btn-sm btn-warning" onclick="editProduct('${code}')">✏️</button>
          <button class="btn btn-sm btn-danger ms-1" onclick="deleteProduct('${code}')">🗑️</button>
        </td>
      </tr>`);
  });
}

function openProductsModal(prefillCode = '') {
  const barcodeField = document.getElementById('prodBarcode');
  if (barcodeField) barcodeField.value = prefillCode || '';
  const name = document.getElementById('prodName'); if(name) name.value = '';
  const brand = document.getElementById('prodBrand'); if(brand) brand.value = '';
  const price = document.getElementById('prodPrice'); if(price) price.value = '';
  const stock = document.getElementById('prodStock'); if(stock) stock.value = '';
  renderProductsTable();
  const modalEl = document.getElementById('productsModal');
  if(window.bootstrap){ new bootstrap.Modal(modalEl).show(); }
  else { modalEl.classList.add('show'); modalEl.style.display = 'block'; }
}

// --- Simple Delete for Manage Products (legacy; will be overridden by final deleteProduct below) ---
(function () {
  if (window._simpleDeleteAttached) return;
  window._simpleDeleteAttached = true;

  window.deleteProduct = function (code) {
    const db = window.productDB || {};
    const name = (db[code] && db[code].name) || '';
    const msg = name
      ? `Are you sure you want to delete "${name}" (code: ${code})?`
      : `Are you sure you want to delete product ${code}?`;

    if (!confirm(msg)) return;

    delete db[code];
    if (window.localStorage) {
      localStorage.setItem('productDB', JSON.stringify(db)); // (legacy; final override fixes storage key)
    }
    if (typeof renderProductsTable === 'function') renderProductsTable();
  };

  document.addEventListener('click', function (e) {
    const delBtn = e.target.closest('.action-delete');
    if (delBtn) {
      const code = delBtn.dataset.code || delBtn.getAttribute('data-code');
      if (code) {
        window.deleteProduct(code);
      }
    }
  });
})();


let currentEditCode = null;

function addOrUpdateProduct(){
  const codeEl = document.getElementById('prodBarcode'); 
  const nameEl = document.getElementById('prodName');
  const brandEl = document.getElementById('prodBrand'); 
  const priceEl = document.getElementById('prodPrice');
  const stockEl = document.getElementById('prodStock');
  if(!codeEl || !nameEl || !priceEl || !stockEl) return alert('Missing product fields');

  const code = codeEl.value.trim();
  if(!code) return alert('Please enter Barcode / Code');
  const name = nameEl.value.trim() || 'Unnamed';
  const brand = (brandEl && brandEl.value.trim()) || '';
  const price = parseFloat(priceEl.value || 0) || 0;
  const stock = parseInt(stockEl.value || 0) || 0;

  productDB[code] = { name, price, stock, brand };
  saveProductsToStorage();
  renderProductsTable();

  if(currentEditCode){
    alert('Product updated');
    currentEditCode = null;
    document.getElementById('addProdBtn').textContent = "➕ Add Product";
  } else {
    alert('Product added');
  }

  codeEl.value = ''; 
  nameEl.value = ''; 
  brandEl.value = ''; 
  priceEl.value = ''; 
  stockEl.value = '';

  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('padding-right');
  const backdrops = document.querySelectorAll('.modal-backdrop');
  backdrops.forEach(b => b.remove());
}


function editProduct(code){
  if(!productDB[code]) return alert('Product not found');
  const p = productDB[code];
  document.getElementById('editProdCode').value = code;
  document.getElementById('editProdName').value = p.name || '';
  document.getElementById('editProdBrand').value = p.brand || '';
  document.getElementById('editProdPrice').value = p.price || '';
  document.getElementById('editProdStock').value = p.stock || '';

  const modalEl = document.getElementById('editProductModal');
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

function saveEditedProduct(){
  const code = document.getElementById('editProdCode').value;
  if(!productDB[code]) return alert('Product not found');

  productDB[code] = {
    name: document.getElementById('editProdName').value.trim() || 'Unnamed',
    brand: document.getElementById('editProdBrand').value.trim() || '',
    price: parseFloat(document.getElementById('editProdPrice').value || 0) || 0,
    stock: parseInt(document.getElementById('editProdStock').value || 0) || 0
  };

  saveProductsToStorage();
  renderProductsTable();

  bootstrap.Modal.getInstance(document.getElementById('editProductModal')).hide();
}

// ====== EDIT QTY MODAL ======
function openEditQty(index){
  const item = cart[index];
  if(!item) return;
  document.getElementById('editQtyIndex').value = index;
  document.getElementById('editQtyInput').value = item.qty;
  document.getElementById('editQtyHelp').innerText = `Max available: ${productDB[item.code] ? productDB[item.code].stock : 'N/A'}`;
  const modalEl = document.getElementById('editQtyModal');
  if(window.bootstrap){ new bootstrap.Modal(modalEl).show(); }
  else { modalEl.classList.add('show'); modalEl.style.display = 'block'; }
}

function saveEditQty(){
  const idx = parseInt(document.getElementById('editQtyIndex').value || -1);
  const val = parseInt(document.getElementById('editQtyInput').value || 1);
  if(idx < 0 || !cart[idx]) return;
  const stock = productDB[cart[idx].code] ? parseInt(productDB[cart[idx].code].stock || 0) : Infinity;
  if(val < 1) return alert('Quantity must be at least 1');
  if(val > stock) return alert(`Not enough stock. Available: ${stock}`);
  cart[idx].qty = val;
  autoApplyDiscountIfQualified();
  renderCart();
  saveCartToStorage();
  const modalEl = document.getElementById('editQtyModal');
  if(window.bootstrap){ const bs = bootstrap.Modal.getInstance(modalEl); if(bs) bs.hide(); }
}

// ====== HISTORY DOWNLOAD / DELETE ======
function downloadTransactionHistory(){
  const history = loadNormalizedHistory();
  if(!history.length){ alert('No transaction history found.'); return; }
  let csv = 'Invoice,Date,Customer,Items,Subtotal,Discount %,Discount Amount,Total,Cash,Change,Reason,Payment Method,Ref No\n';
  history.forEach(t => {
    const items = t.items.map(i => `${i.brand ? '['+i.brand+'] ' : ''}${i.name} (x${i.qty})`).join(' | ');
    csv += [t.invoice,t.date,t.customer,items,t.subtotal,t.discountPercent,t.discountAmount,t.total,t.cash,t.change,t.reason,t.paymentMethod||'',t.refNo||'']
      .map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'transaction_history.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ====== ADMIN MODAL FLOW ======
let adminAction = null; let adminPayload = null;
function showAdminModal(action, payload){
  adminAction = action; adminPayload = payload;
  const pwd = document.getElementById('adminPasswordInput'); if(pwd) pwd.value='';
  const el = document.getElementById('adminModal');
  if(window.bootstrap){ new bootstrap.Modal(el).show(); }
  else { el.classList.add('show'); el.style.display='block'; }
}

// helper to delete history item (kept but not exposed in UI)
function deleteHistoryConfirmed(index){
  const data = loadNormalizedHistory();
  data.splice(index,1);
  SafeLS.setItem('transactionHistory', JSON.stringify(data));
  renderHistory();
}
function confirmClearAllHistory(){ if(!confirm('Delete ALL history? This cannot be undone.')) return; showAdminModal('clearAll', null); }

// ====== INIT ======
function init(){
  loadProductsFromStorage();
  renderProductsTable();
  renderCart();
  try{ syncPaymentUI(); }catch(e){}
  // Keyboard scanning and shortcuts
  const barcodeEl = document.getElementById('barcode'); if(barcodeEl) barcodeEl.addEventListener('keypress', e => { if(e.key==='Enter') scanProduct(); });
  document.addEventListener('keydown', e => { if(e.key==='F2') openProductsModal(); });
  populateHistoryBrandFilter();
  // load saved cart if present
  loadCartFromStorage();
}
init();

// ====== IMPORT (Excel/CSV) ======
function triggerImport(){
  const inp = document.getElementById('importFileInput');
  if(!inp) return alert('Import input not found');
  inp.value = '';
  inp.onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    try{
      const { added, updated, skipped } = await importProductsFromFile(file);
      saveProductsToStorage();
      renderProductsTable();
      alert(`Import done.\nAdded: ${added}\nUpdated: ${updated}\nSkipped: ${skipped}`);
    }catch(err){
      console.error(err);
      alert('Import failed: ' + (err && err.message ? err.message : err));
    }
  };
  inp.click();
}

async function importProductsFromFile(file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  const ws = wb.Sheets[wb.SheetNames[0]];
  if(!ws) throw new Error('No sheet found in file');

  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  let added = 0, updated = 0, skipped = 0;

  rows.forEach((row, idx) => {
    const code   = String(row.code || row.Code || row.CODE || row.barcode || row.Barcode || row.BARCODE || row.sku || row.SKU || '').trim();
    const name   = String(row.name || row.Name || row.product || row.Product || '').trim();
    const brand  = String(row.brand || row.Brand || row.supplier || row.Supplier || '').trim();
    const priceV = Number(row.price ?? row.Price ?? row.PRICE ?? row.unitprice ?? row.UnitPrice ?? row['Unit Price'] ?? 0);
    const stockV = Number(row.stock ?? row.Stock ?? row.STOCK ?? row.qty ?? row.Qty ?? row.quantity ?? row.Quantity ?? 0);

    if(!code){ skipped++; return; }

    const price = isFinite(priceV) ? priceV : 0;
    const stock = isFinite(stockV) ? Math.max(0, Math.round(stockV)) : 0;

    if(!productDB[code]){
      productDB[code] = {
        name: name || 'Unnamed',
        brand: brand || '',
        price: price || 0,
        stock: stock || 0
      };
      added++;
    } else {
      const p = productDB[code];
      p.name  = name  || p.name  || 'Unnamed';
      p.brand = brand || p.brand || '';
      if(!isNaN(priceV) && String(priceV).trim() !== '') p.price = price;
      if(!isNaN(stockV) && String(stockV).trim() !== '') p.stock = stock;
      updated++;
    }
  });

  return { added, updated, skipped };
}

// ====== TEMPLATE DOWNLOAD (CSV) ======
function downloadProductsTemplate(){
  const csvHeader = 'code,name,brand,price,stock\n';
  const sample = [
    '1001,Dog Food 3kg,Pedigree,540,20',
    '1002,Cat Food 500g,Whiskas,95,35',
    '1003,Anti-Tick Shampoo 250ml,PetShield,180,12'
  ].join('\n');
  const blob = new Blob([csvHeader + sample], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'products_template.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ====== Autosave cart to localStorage ======
function saveCartToStorage(){
  try{ SafeLS.setItem('evr_cart', JSON.stringify(cart)); }catch(e){ console.warn('Could not save cart', e); }
}
function loadCartFromStorage(){
  try{
    const raw = SafeLS.getItem('evr_cart');
    if(!raw) return;
    const arr = JSON.parse(raw);
    if(Array.isArray(arr)) { cart = arr; renderCart(); }
  }catch(e){ console.warn('Could not load cart', e); }
}

// ====== Refund / Edit / Void support ======
/* Helper: safely get history and write back */
function getHistory(){ return loadNormalizedHistory(); }
function saveHistory(arr){ SafeLS.setItem('transactionHistory', JSON.stringify(arr || [])); }

// REFUND
let refundContext = null;
function openRefundModal(index){
  const hist = getHistory();
  const t = hist[index];
  if(!t) return alert('Transaction not found');
  refundContext = { index, invoice: t.invoice, original: t };
  document.getElementById('refundInfo').innerText = `Invoice: ${t.invoice} — Date: ${t.date} — Customer: ${t.customer || 'Unknown'}`;
  const tbody = document.getElementById('refundItemsBody');
  tbody.innerHTML = '';
  (t.items || []).forEach((it, i) => {
    const sold = Number(it.qty || 0);
    tbody.insertAdjacentHTML('beforeend', `
      <tr data-index="${i}">
        <td>${escapeHtml(it.name || '')}</td>
        <td class="text-center">${sold}</td>
        <td><input type="number" min="0" max="${sold}" value="0" class="form-control refundQty" style="max-width:120px"></td>
        <td class="text-end">${Number(it.price || 0).toFixed(2)}</td>
        <td class="text-end refundAmount">0.00</td>
      </tr>
    `);
  });

  const inputs = Array.from(document.querySelectorAll('#refundItemsBody .refundQty'));
  inputs.forEach((inp, idx) => {
    inp.addEventListener('input', () => {
      const val = Math.max(0, Math.min(Number(inp.max||0), parseInt(inp.value||0) || 0));
      inp.value = val;
      const price = Number((refundContext.original.items[idx].price||0));
      const amtEl = document.querySelectorAll('#refundItemsBody .refundAmount')[idx];
      if(amtEl) amtEl.innerText = (val * price).toFixed(2);
    });
  });

  const modalEl = document.getElementById('refundModal');
  if(window.bootstrap){ new bootstrap.Modal(modalEl).show(); } else { modalEl.style.display='block'; }
}

document.getElementById('refundPrepareBtn').addEventListener('click', function(){
  if(!refundContext) return alert('No refund selected');
  const rows = Array.from(document.querySelectorAll('#refundItemsBody tr'));
  const refunds = [];
  let totalRefund = 0;
  rows.forEach((row, i) => {
    const qty = parseInt(row.querySelector('.refundQty').value || 0) || 0;
    if(qty > 0){
      const it = refundContext.original.items[i];
      refunds.push({ code: it.code, name: it.name, price: Number(it.price||0), qty });
      totalRefund += qty * Number(it.price||0);
    }
  });
  if(refunds.length === 0) return alert('No refund quantity entered');

  const reason = (document.getElementById('refundReason') && document.getElementById('refundReason').value) || '';
  const payload = { index: refundContext.index, invoice: refundContext.invoice, refunds, reason, totalRefund };
  const modalEl = document.getElementById('refundModal'); if(window.bootstrap){ const bs=bootstrap.Modal.getInstance(modalEl); if(bs) bs.hide(); }
  showAdminModal('refundConfirm', payload);
});

function performRefund(payload){
  try{
    const { index, refunds, reason } = payload;
    const hist = getHistory();
    const orig = hist[index];
    if(!orig) return alert('Original transaction not found');

    refunds.forEach(r => {
      if(productDB[r.code]) {
        productDB[r.code].stock = (parseInt(productDB[r.code].stock||0)) + Number(r.qty||0);
      }
    });
    saveProductsToStorage();

    const refundItems = refunds.map(r => ({ code: r.code, name: r.name, qty: -Math.abs(Number(r.qty)), price: Number(r.price||0), brand: (productDB[r.code] && productDB[r.code].brand) || '' }));
    const subtotal = refundItems.reduce((s,i)=> s + (i.qty * i.price), 0);
    const refundInvoice = generateInvoiceNumber();
    const refundEntry = {
      invoice: refundInvoice,
      date: new Date().toLocaleString(),
      customer: orig.customer || 'Unknown',
      items: refundItems,
      subtotal: subtotal,
      discountPercent: 0,
      discountAmount: 0,
      total: subtotal,
      cash: 0,
      change: 0,
      reason: 'Refund for ' + (orig.invoice || '') + (reason? ' — ' + reason : ''),
      paymentMethod: 'Refund',
      refNo: '',
      refundOf: orig.invoice || ''
    };

    hist.push(refundEntry);
    saveHistory(hist);

    orig.refunded = true;
    orig.reason = (orig.reason ? orig.reason + ' | ' : '') + `Partial refund ${refundInvoice}`;
    saveHistory(hist);
    renderProductsTable();
    renderHistory();
    alert('Refund processed — Refund Invoice: '+refundInvoice);
  }catch(e){ console.error(e); alert('Refund failed: '+e.message); }
}

// VOID
function performVoid(index){
  const hist = getHistory();
  const t = hist[index];
  if(!t) return alert('Transaction not found');
  if(t.voided) return alert('Transaction already voided');
  (t.items || []).forEach(it => {
    const code = it.code;
    const q = Number(it.qty || 0);
    if(productDB[code]) {
      productDB[code].stock = (parseInt(productDB[code].stock||0)) + q;
    }
  });
  saveProductsToStorage();
  t.voided = true;
  t.reason = (t.reason ? t.reason + ' | ' : '') + 'VOIDED';
  saveHistory(hist);
  renderProductsTable();
  renderHistory();
  alert('Transaction voided and stock restored: ' + (t.invoice || ''));
}

// EDIT TRANSACTION
let editContext = null;
function openEditTransactionModal(index){
  const hist = getHistory();
  const t = hist[index];
  if(!t) return alert('Transaction not found');
  editContext = { index, original: t };
  document.getElementById('editInfo').innerText = `Invoice: ${t.invoice} — Date: ${t.date} — Customer: ${t.customer || 'Unknown'}`;
  const tbody = document.getElementById('editItemsBody');
  tbody.innerHTML = '';
  (t.items || []).forEach((it, i) => {
    const sold = Number(it.qty || 0);
    tbody.insertAdjacentHTML('beforeend', `
      <tr data-index="${i}">
        <td>${escapeHtml(it.name || '')}</td>
        <td class="text-center">${sold}</td>
        <td><input type="number" min="0" value="${sold}" class="form-control editQty" style="max-width:120px"></td>
        <td class="text-end">${Number(it.price || 0).toFixed(2)}</td>
        <td class="text-end editDelta">0</td>
      </tr>
    `);
  });

  const inputs = Array.from(document.querySelectorAll('#editItemsBody .editQty'));
  inputs.forEach((inp, idx) => {
    inp.addEventListener('input', () => {
      const originalQty = Number(editContext.original.items[idx].qty || 0);
      const val = Math.max(0, parseInt(inp.value||0) || 0);
      inp.value = val;
      const delta = val - originalQty;
      const el = document.querySelectorAll('#editItemsBody .editDelta')[idx];
      if(el) el.innerText = (delta >= 0 ? '+'+delta : String(delta));
    });
  });

  const modalEl = document.getElementById('editTransactionModal');
  if(window.bootstrap){ new bootstrap.Modal(modalEl).show(); } else { modalEl.style.display='block'; }
}

document.getElementById('editPrepareBtn').addEventListener('click', function(){
  if(!editContext) return alert('No transaction selected');
  const rows = Array.from(document.querySelectorAll('#editItemsBody tr'));
  const changes = [];
  rows.forEach((row, i) => {
    const newQty = parseInt(row.querySelector('.editQty').value || 0) || 0;
    const origQty = Number(editContext.original.items[i].qty || 0);
    if(newQty !== origQty){
      const it = editContext.original.items[i];
      changes.push({ code: it.code, name: it.name, price: Number(it.price||0), origQty, newQty });
    }
  });
  if(changes.length === 0) return alert('No changes detected');
  const reason = (document.getElementById('editReason') && document.getElementById('editReason').value) || '';
  const payload = { index: editContext.index, changes, reason };
  const modalEl = document.getElementById('editTransactionModal'); if(window.bootstrap){ const bs = bootstrap.Modal.getInstance(modalEl); if(bs) bs.hide(); }
  showAdminModal('editConfirm', payload);
});

function performEdit(payload){
  try{
    const { index, changes, reason } = payload;
    const hist = getHistory();
    const t = hist[index];
    if(!t) return alert('Transaction not found');

    changes.forEach(ch => {
      const code = ch.code;
      const delta = ch.newQty - ch.origQty;
      if(productDB[code]) {
        productDB[code].stock = (parseInt(productDB[code].stock||0) - delta);
        if(productDB[code].stock < 0) productDB[code].stock = 0;
        const item = t.items.find(it=>it.code===code);
        if(item) item.qty = ch.newQty;
      }
    });

    t.subtotal = (t.items || []).reduce((s,it)=> s + (Number(it.qty||0) * Number(it.price||0)), 0);
    t.discountAmount = Number(t.subtotal) * (Number(t.discountPercent||0)/100);
    t.total = Number(t.subtotal) - Number(t.discountAmount || 0);
    t.reason = (t.reason ? t.reason + ' | ' : '') + 'Edited: ' + (reason||'');
    saveProductsToStorage();
    saveHistory(hist);
    renderProductsTable();
    renderHistory();
    alert('Transaction edited and stock adjusted.');
  }catch(e){ console.error(e); alert('Edit failed: '+e.message); }
}

// VIEW ITEMS modal helper
function openItemsModalByInvoice(invoice, idxFallback){
  const hist = loadNormalizedHistory();
  let t = null;
  if(invoice){
    t = hist.find(h => (h.invoice || '') === invoice);
  }
  if(!t && typeof idxFallback === 'number'){
    t = hist[idxFallback];
  }
  if(!t) return alert('Transaction not found for items view');

  document.getElementById('viewItemsHeader').innerText = `Invoice: ${t.invoice || ''} — Date: ${t.date || ''} — Customer: ${t.customer || 'Unknown'}`;
  const tbody = document.getElementById('viewItemsContent');
  tbody.innerHTML = '';
  (t.items || []).forEach(it => {
    const qty = Number(it.qty||0);
    const price = Number(it.price||0);
    const total = qty * price;
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${escapeHtml(it.code||'')}</td>
        <td>${escapeHtml(it.name||'')}</td>
        <td class="right">${qty}</td>
        <td class="right">${price.toFixed(2)}</td>
        <td class="right">${total.toFixed(2)}</td>
      </tr>
    `);
  });

  const modalEl = document.getElementById('viewItemsModal');
  if(window.bootstrap){ new bootstrap.Modal(modalEl).show(); } else { modalEl.style.display='block'; }
}

// ====== ADMIN Confirm handler (single place) ======
(function setupAdminConfirmHandler(){
  const btn = document.getElementById('adminConfirmBtn');
  if(!btn) return;
  btn.addEventListener('click', function(){
    const passEl = document.getElementById('adminPasswordInput');
    const pass = passEl ? passEl.value || '' : '';
    if(pass !== ADMIN_PASSWORD){ alert('Wrong password'); return; }
    const adminModalEl = document.getElementById('adminModal');
    if(window.bootstrap){ const bs = bootstrap.Modal.getInstance(adminModalEl); if(bs) bs.hide(); }
    try {
      if(adminAction === 'delete'){ deleteHistoryConfirmed(adminPayload); }
      else if(adminAction === 'clearAll'){ SafeLS.removeItem('transactionHistory'); renderHistory(); }
      else if(adminAction === 'void'){ performVoid(adminPayload); }
      else if(adminAction === 'refundConfirm'){ performRefund(adminPayload); }
      else if(adminAction === 'editConfirm'){ performEdit(adminPayload); }
      else if(adminAction === 'deleteIndex'){ deleteHistoryConfirmed(adminPayload); }
    } catch(e){ console.error('Admin action failed', e); alert('Action failed: '+(e && e.message ? e.message : e)); }
    adminAction=null; adminPayload=null;
  });
})();

// ====== Improved Products Modal + Search (overrides earlier minimal one) ======
function openProductsModal(prefillCode = '') {
  const barcodeField = document.getElementById('prodBarcode');
  if (barcodeField) barcodeField.value = prefillCode || '';
  const name = document.getElementById('prodName'); if (name) name.value = '';
  const brand = document.getElementById('prodBrand'); if (brand) brand.value = '';
  const price = document.getElementById('prodPrice'); if (price) price.value = '';
  const stock = document.getElementById('prodStock'); if (stock) stock.value = '';

  // inject search box once
  const tbody = document.getElementById('productsBody');
  if (tbody) {
    const table = tbody.closest('table');
    const container = table ? table.parentElement : null;
    if (container && !document.getElementById('productsSearch')) {
      const div = document.createElement('div');
      div.className = 'mb-2';
      div.innerHTML = `
        <input class="form-control" id="productsSearch" placeholder="Search products (code, name, brand)…">
      `;
      container.insertBefore(div, table);

      const searchEl = div.querySelector('#productsSearch');
      searchEl.addEventListener('input', renderProductsTable);
      searchEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchEl.value = '';
          renderProductsTable();
        }
      });
    }
  }

  renderProductsTable();

  const modalEl = document.getElementById('productsModal');
  if (window.bootstrap) { new bootstrap.Modal(modalEl).show(); }
  else { modalEl.classList.add('show'); modalEl.style.display = 'block'; }

  const s = document.getElementById('productsSearch');
  if (s) setTimeout(() => s.focus(), 150);
}

function renderProductsTable() {
  const tbody = document.getElementById('productsBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const q = (document.getElementById('productsSearch')?.value || '').toLowerCase().trim();

  const codes = Object.keys(productDB).sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });

  if (codes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No products registered</td></tr>';
    return;
  }

  let count = 0;
  for (const code of codes) {
    const p = productDB[code];
    const hay = `${code} ${p?.name || ''} ${p?.brand || ''}`.toLowerCase();
    if (q && !hay.includes(q)) continue;

    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${escapeHtml(code)}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.brand || '')}</td>
        <td class="right">${Number(p.price).toFixed(2)}</td>
        <td class="right">${Number(p.stock).toFixed(0)}</td>
        <td>
          <button class="btn btn-sm btn-warning" onclick="editProduct('${code}')">✏️</button>
          <button class="btn btn-sm btn-danger ms-1" onclick="deleteProduct('${code}')">🗑️</button>
        </td>
      </tr>
    `);
    count++;
  }

  if (count === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No results</td></tr>';
  }
}

// ====== CART AUTOSAVE hook on unload ======
window.addEventListener('beforeunload', function(){ try{ SafeLS.setItem('evr_cart', JSON.stringify(cart)); }catch(e){} });

// ====== Utility: trim history (safety) ======
function trimHistoryIfNeeded(arr, max=5000){
  if(!Array.isArray(arr)) return arr || [];
  if(arr.length <= max) return arr;
  return arr.slice(Math.max(0, arr.length - max));
}

// (legacy wrong deleteProduct kept above; final one below fixes storage key and refresh)
// (legacy wrong delete using "products" + renderProducts() kept in original source — overridden)

// ====== ✅ FINAL OVERRIDE: Delete Product (correct storage + refresh) ======
window.deleteProduct = function (code) {
  if (!code) return;
  const p = productDB[code];
  const label = p ? `"${p.name}" (code: ${code})` : `product ${code}`;
  if (!confirm(`Are you sure you want to delete ${label}?`)) return;

  // remove from in-memory DB
  delete productDB[code];

  // persist to same storage used by the app
  saveProductsToStorage();

  // refresh Manage Products table
  if (typeof renderProductsTable === 'function') renderProductsTable();

  alert('Product deleted successfully!');
};

// ====== End of file ------------------------------------------------------

// ============================================================
// MEERAS PANEMORFI — INVENTORY MANAGEMENT SYSTEM
// Fixed: Supabase namespace, empty tables, error handling
// ============================================================

// ---- SUPABASE CLIENT ----
// Use _db to avoid colliding with window.supabase (the library itself)
let _db = null;
let _isConnected = false;
let _consecutiveErrors = 0;
var MAX_RETRY_ATTEMPTS = 1;
var RETRY_DELAY_MS = 1500;

function isValidSupabaseUrl(url) {
  try {
    var parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co');
  } catch (e) {
    return false;
  }
}

function isValidSupabaseKey(key) {
  return typeof key === 'string' && key.startsWith('eyJ') && key.length > 30;
}

function classifyError(error) {
  if (!error) return null;
  var msg = (error.message || '').toLowerCase();
  var code = error.code || '';
  var status = error.status || error.statusCode || 0;

  if (!navigator.onLine) return { type: 'network', userMessage: 'You are offline. Please check your internet connection.', retryable: true };
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network request failed') || msg.includes('load failed'))
    return { type: 'network', userMessage: 'Network error — unable to reach the server. Check your internet connection.', retryable: true };
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted'))
    return { type: 'timeout', userMessage: 'Request timed out. The server may be slow — please try again.', retryable: true };
  if (status === 401 || msg.includes('invalid api key') || msg.includes('jwt') || msg.includes('invalid claim') || msg.includes('token is expired') || code === 'PGRST301')
    return { type: 'auth', userMessage: 'Invalid or expired API credentials. Please check your URL and API key in Settings.', retryable: false };
  if (status === 403 || msg.includes('permission denied') || msg.includes('row-level security') || code === '42501')
    return { type: 'permission', userMessage: 'Permission denied. Your API key may not have access to this data.', retryable: false };
  if (status === 404 || code === '42P01' || msg.includes('does not exist') || msg.includes('relation') && msg.includes('does not exist'))
    return { type: 'missing_table', userMessage: 'Database table not found. Please run the SQL schema setup from Settings.', retryable: false };
  if (status === 409 || msg.includes('duplicate') || msg.includes('unique constraint') || code === '23505')
    return { type: 'conflict', userMessage: 'A record with this information already exists.', retryable: false };
  if (status === 429 || msg.includes('rate limit') || msg.includes('too many requests'))
    return { type: 'rate_limit', userMessage: 'Too many requests. Please wait a moment and try again.', retryable: true };
  if (status >= 500 || msg.includes('server error') || msg.includes('internal error'))
    return { type: 'server', userMessage: 'Supabase server error. The service may be temporarily down — try again shortly.', retryable: true };

  return { type: 'unknown', userMessage: 'Something went wrong: ' + (error.message || 'Unknown error'), retryable: false };
}

function initSupabase(url, key) {
  if (!url || !key || url.includes('YOUR_SUPABASE')) return null;

  if (!isValidSupabaseUrl(url)) {
    showToast('Invalid Supabase URL. Expected format: https://xxxxx.supabase.co', 'error', 5000);
    _isConnected = false;
    return null;
  }
  if (!isValidSupabaseKey(key)) {
    showToast('Invalid API key format. The key should start with "eyJ..."', 'error', 5000);
    _isConnected = false;
    return null;
  }

  try {
    _db = window.supabase.createClient(url, key);
    // createClient does not validate credentials — actual validation
    // happens on the first query via verifyConnection().
    _isConnected = true;
    _consecutiveErrors = 0;
    console.log('[Meeras IMS] Supabase client created');
    return _db;
  } catch (e) {
    console.error('[Meeras IMS] Supabase init error:', e);
    _isConnected = false;
    showToast('Failed to initialize Supabase: ' + e.message, 'error', 5000);
    return null;
  }
}

async function verifyConnection() {
  if (!_db) return false;
  try {
    var res = await _db.from('products').select('id', { count: 'exact', head: true }).limit(1);
    if (res.error) {
      var classified = classifyError(res.error);
      if (classified.type === 'missing_table') {
        _isConnected = true;
        return true;
      }
      _isConnected = false;
      showToast(classified.userMessage, 'error', 6000);
      return false;
    }
    _isConnected = true;
    _consecutiveErrors = 0;
    return true;
  } catch (e) {
    _isConnected = false;
    var classified = classifyError(e);
    showToast(classified.userMessage, 'error', 5000);
    return false;
  }
}

// Safe query wrapper with error classification and retry
async function dbQuery(fn) {
  if (!_db) return { data: null, error: new Error('Not connected to Supabase'), count: null };

  for (var attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      var result = await fn(_db);
      if (result.error) {
        var classified = classifyError(result.error);
        console.warn('[DB]', classified.type + ':', result.error.message);

        if (classified.retryable && attempt < MAX_RETRY_ATTEMPTS) {
          console.log('[DB] Retrying in ' + RETRY_DELAY_MS + 'ms (attempt ' + (attempt + 1) + ')...');
          await new Promise(function(resolve) { setTimeout(resolve, RETRY_DELAY_MS); });
          continue;
        }

        _consecutiveErrors++;
        if (classified.type === 'auth') {
          _isConnected = false;
          updateConnectionBadge();
          updateSetupBanner();
        }
        if (_consecutiveErrors >= 3 && _isConnected) {
          _isConnected = false;
          updateConnectionBadge();
          updateSetupBanner();
          showToast('Connection lost — switching to Demo Mode. Check Settings to reconnect.', 'warning', 6000);
        }
        result._classified = classified;
        return result;
      }
      _consecutiveErrors = 0;
      return result;
    } catch (e) {
      var classified = classifyError(e);
      console.error('[DB Error]', classified.type + ':', e.message || e);

      if (classified.retryable && attempt < MAX_RETRY_ATTEMPTS) {
        console.log('[DB] Retrying in ' + RETRY_DELAY_MS + 'ms (attempt ' + (attempt + 1) + ')...');
        await new Promise(function(resolve) { setTimeout(resolve, RETRY_DELAY_MS); });
        continue;
      }

      _consecutiveErrors++;
      if (_consecutiveErrors >= 3 && _isConnected) {
        _isConnected = false;
        updateConnectionBadge();
        updateSetupBanner();
        showToast('Connection lost — switching to Demo Mode. Check Settings to reconnect.', 'warning', 6000);
      }
      return { data: null, error: e, count: null, _classified: classified };
    }
  }
}

// ---- TOAST ----
function showToast(msg, type = 'info', duration = 3500) {
  const icons = { success: '✓', error: '✕', warning: '⚠', info: '◆' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = '<span>' + (icons[type]||'◆') + '</span><span>' + msg + '</span>';
  container.appendChild(toast);
  setTimeout(function() {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(function() { toast.remove(); }, 300);
  }, duration);
}

// ---- NAVIGATION ----
function navigateTo(page) {
  document.querySelectorAll('.page-content').forEach(function(p) { p.classList.add('hidden'); });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });

  var targetPage = document.getElementById('page-' + page);
  if (targetPage) targetPage.classList.remove('hidden');

  var navItem = document.querySelector('[data-page="' + page + '"]');
  if (navItem) navItem.classList.add('active');

  var titles = {
    dashboard:    ['Dashboard', 'Welcome back, Owner'],
    inventory:    ['Inventory', 'Manage products & supplies'],
    services:     ['Services', 'Beauty & wellness services'],
    appointments: ['Appointments', 'Schedule & bookings'],
    sales:        ['Sales & POS', 'Point of sale & transactions'],
    reports:      ['Reports & Analytics', 'Data insights & performance'],
    suppliers:    ['Suppliers', 'Vendor management'],
    staff:        ['Staff', 'Team members'],
    settings:     ['Settings', 'System configuration'],
  };
  var t = titles[page] || ['', ''];
  setText('page-title', t[0]);
  setText('page-sub', t[1]);

  if (page === 'dashboard')    loadDashboard();
  else if (page === 'inventory')    loadInventory();
  else if (page === 'services')     loadServices();
  else if (page === 'appointments') loadAppointments();
  else if (page === 'sales')        loadSales();
  else if (page === 'reports')      loadReports();
  else if (page === 'suppliers')    loadSuppliers();
  else if (page === 'staff')        loadStaff();
}

function updateSetupBanner() {
  var banner = document.getElementById('setup-banner');
  if (banner) banner.style.display = _isConnected ? 'none' : 'flex';
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  updateSetupBanner();
  updateConnectionBadge();

  if (!_isConnected) {
    renderDemoDashboard();
    renderDemoChart();
    return;
  }

  try {
    var today = new Date().toISOString().split('T')[0];
    var [pRes, lRes, sRes, aRes] = await Promise.all([
      dbQuery(function(db) { return db.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true); }),
      dbQuery(function(db) { return db.from('products').select('id', { count: 'exact', head: true }).lt('quantity', 5).gte('quantity', 0).eq('is_active', true); }),
      dbQuery(function(db) { return db.from('sales').select('total').gte('created_at', today + 'T00:00:00'); }),
      dbQuery(function(db) { return db.from('appointments').select('id', { count: 'exact', head: true }).eq('appointment_date', today); }),
    ]);
    var hasErrors = [pRes, lRes, sRes, aRes].some(function(r) { return r.error; });
    if (hasErrors) {
      var firstErr = [pRes, lRes, sRes, aRes].find(function(r) { return r.error; });
      var classified = firstErr._classified || classifyError(firstErr.error);
      showToast('Dashboard: ' + classified.userMessage, 'error', 5000);
      renderDemoDashboard();
      return;
    }
    var totalProducts = pRes.count || 0;
    var lowStock = lRes.count || 0;
    var todayRevenue = (sRes.data || []).reduce(function(s,r) { return s + (parseFloat(r.total)||0); }, 0);
    var todayAppts = aRes.count || 0;
    updateDashboardStats(totalProducts, lowStock, todayRevenue, todayAppts);
    await Promise.all([loadRecentActivity(), loadLowStockAlerts()]);
    renderDemoChart();
  } catch(e) {
    console.error('[Dashboard Error]', e);
    var classified = classifyError(e);
    showToast('Dashboard: ' + classified.userMessage, 'error', 5000);
    renderDemoDashboard();
  }
}

function updateDashboardStats(products, lowStock, revenue, appts) {
  setText('stat-products',  products);
  setText('stat-low-stock', lowStock);
  setText('stat-revenue',   '₱' + formatNumber(revenue));
  setText('stat-appts',     appts);
  var badge = document.getElementById('low-stock-badge');
  if (badge) { badge.textContent = lowStock; badge.style.display = lowStock > 0 ? 'inline-block' : 'none'; }
  var dot = document.getElementById('header-alert-dot');
  if (dot) dot.style.display = lowStock > 0 ? 'block' : 'none';
}

function renderDemoDashboard() {
  updateDashboardStats(47, 3, 8500, 6);
  renderDemoActivity();
  renderDemoLowStock();
}

async function loadRecentActivity() {
  if (!_isConnected) { renderDemoActivity(); return; }
  var res = await dbQuery(function(db) {
    return db.from('stock_transactions').select('*, products(name)').order('created_at', { ascending: false }).limit(6);
  });
  renderActivity(res.data || []);
}

function renderActivity(items) {
  var list = document.getElementById('activity-list');
  if (!items.length) {
    list.innerHTML = '<p class="td-muted" style="text-align:center;padding:20px">No recent activity. Add stock to see history here.</p>';
    return;
  }
  list.innerHTML = items.map(function(item) {
    var color = item.type==='in' ? 'var(--green)' : item.type==='out' ? 'var(--red)' : 'var(--orange)';
    var action = item.type==='in' ? 'Stock added' : item.type==='out' ? 'Stock removed' : 'Adjusted';
    return '<div class="activity-item"><div class="activity-dot" style="background:' + color + '"></div><div class="activity-text"><span>' + (item.products && item.products.name ? item.products.name : 'Product') + '</span> — ' + action + ': ' + Math.abs(item.quantity) + ' units' + (item.notes ? ' <em class="td-muted">(' + item.notes + ')</em>' : '') + '</div><div class="activity-time">' + timeAgo(item.created_at) + '</div></div>';
  }).join('');
}

function renderDemoActivity() {
  var demos = [
    { c:'var(--green)',  t:'<span>Facial Serum</span> — Stock added: 10 units',    time:'2m ago' },
    { c:'var(--red)',    t:'<span>Wax Strips</span> — Used for service: 5 units',  time:'1h ago' },
    { c:'var(--orange)', t:'<span>Nail Polish</span> — Adjusted: -2 units',        time:'3h ago' },
    { c:'var(--green)',  t:'<span>Facial Cleanser</span> — Stock added: 24 units', time:'5h ago' },
    { c:'var(--red)',    t:'<span>Eyebrow Tint</span> — Used for service: 1 unit', time:'Yesterday' },
  ];
  document.getElementById('activity-list').innerHTML = demos.map(function(d) {
    return '<div class="activity-item"><div class="activity-dot" style="background:' + d.c + '"></div><div class="activity-text">' + d.t + '</div><div class="activity-time">' + d.time + '</div></div>';
  }).join('');
}

async function loadLowStockAlerts() {
  if (!_isConnected) { renderDemoLowStock(); return; }
  var res = await dbQuery(function(db) {
    return db.from('products').select('name,quantity,min_stock').lt('quantity', 5).eq('is_active', true).order('quantity').limit(6);
  });
  renderLowStock(res.data || []);
}

function renderLowStock(items) {
  var list = document.getElementById('low-stock-list');
  if (!items.length) {
    list.innerHTML = '<p style="color:var(--green);font-size:0.82rem;padding:8px 0">✓ All products are well-stocked!</p>';
    return;
  }
  list.innerHTML = items.map(function(i) {
    return '<div class="low-stock-item"><span class="low-stock-name">' + i.name + '</span><span class="low-stock-count">' + i.quantity + ' left</span></div>';
  }).join('');
}

function renderDemoLowStock() {
  renderLowStock([{ name:'Wax Strips (Roll)', quantity:2 }, { name:'Exfoliating Scrub', quantity:1 }, { name:'Threading Thread', quantity:4 }]);
}

function renderDemoChart() {
  var canvas = document.getElementById('revenue-chart');
  if (!canvas) return;
  canvas.width = canvas.offsetWidth || 560;
  var ctx = canvas.getContext('2d');
  drawBarChart(ctx, canvas.width, 220, ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], [3200,4500,2800,6700,5100,8900,7200]);
}

function drawBarChart(ctx, w, h, labels, values) {
  ctx.clearRect(0, 0, w, h);
  if (!values.length) return;
  var max = Math.max.apply(null, values.concat([1])) * 1.15;
  var pad = { top:20, right:16, bottom:36, left:58 };
  var chartW = w - pad.left - pad.right;
  var chartH = h - pad.top - pad.bottom;
  var barW = (chartW / labels.length) * 0.55;
  var gap = chartW / labels.length;
  ctx.strokeStyle = 'rgba(201,151,28,0.1)'; ctx.lineWidth = 1;
  for (var i = 0; i <= 4; i++) {
    var y = pad.top + chartH - (i/4)*chartH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w-pad.right, y); ctx.stroke();
    ctx.fillStyle = 'rgba(107,101,96,0.65)';
    ctx.font = '10px Jost,sans-serif'; ctx.textAlign = 'right';
    var val = (i/4)*max;
    ctx.fillText(val >= 1000 ? '₱'+(val/1000).toFixed(1)+'k' : '₱'+val.toFixed(0), pad.left-5, y+4);
  }
  labels.forEach(function(label, i) {
    var x = pad.left + i*gap + (gap-barW)/2;
    var barH = (values[i]/max)*chartH;
    var y = pad.top + chartH - barH;
    var grad = ctx.createLinearGradient(0, y, 0, y+barH);
    grad.addColorStop(0, '#E8B94F'); grad.addColorStop(1, '#9A7213');
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, barW, barH, 4); else ctx.rect(x, y, barW, barH);
    ctx.fill();
    ctx.fillStyle = 'rgba(44,36,22,0.65)'; ctx.font = '10px Jost,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(label, x+barW/2, h-pad.bottom/2+6);
  });
}

// ============================================================
// INVENTORY
// ============================================================
var allProducts = [];
var editingProductId = null;

async function loadInventory() {
  document.getElementById('inventory-tbody').innerHTML = loadingRow(8);
  var res = await dbQuery(function(db) { return db.from('products').select('*').eq('is_active', true).order('name'); });
  if (res.error) {
    if (_isConnected) {
      var classified = res._classified || classifyError(res.error);
      showToast('Inventory: ' + classified.userMessage, 'error', 5000);
    }
    renderDemoInventory(); return;
  }
  allProducts = res.data || [];
  if (!allProducts.length && !_isConnected) renderDemoInventory();
  else renderInventoryTable(allProducts);
}

function renderDemoInventory() {
  allProducts = [
    { id:'d1', name:'Facial Cleanser',       category:'Skincare',  sku:'SK001', quantity:18,  min_stock:5,  unit:'bottle', cost_price:250,  selling_price:450,  supplier:'Beauty Supplies Co.', is_active:true },
    { id:'d2', name:'Wax Strips (Roll)',      category:'Waxing',    sku:'WX001', quantity:2,   min_stock:10, unit:'roll',   cost_price:180,  selling_price:0,    supplier:'Hair Removal PH',     is_active:true },
    { id:'d3', name:'Threading Thread',       category:'Threading', sku:'TH001', quantity:4,   min_stock:15, unit:'spool',  cost_price:45,   selling_price:0,    supplier:'Beauty Supplies Co.', is_active:true },
    { id:'d4', name:'Exfoliating Scrub',      category:'Skincare',  sku:'SK002', quantity:1,   min_stock:5,  unit:'tube',   cost_price:320,  selling_price:550,  supplier:'Glow Essentials',     is_active:true },
    { id:'d5', name:'Nail Polish Set (Gel)',  category:'Nails',     sku:'NL001', quantity:12,  min_stock:5,  unit:'set',    cost_price:1200, selling_price:2000, supplier:'Nail World PH',       is_active:true },
    { id:'d6', name:'Eyebrow Tint',           category:'Tinting',   sku:'TN001', quantity:8,   min_stock:5,  unit:'tube',   cost_price:350,  selling_price:0,    supplier:'Beauty Supplies Co.', is_active:true },
    { id:'d7', name:'Disposable Spatulas',    category:'Waxing',    sku:'WX002', quantity:200, min_stock:50, unit:'pcs',    cost_price:3,    selling_price:0,    supplier:'Hair Removal PH',     is_active:true },
    { id:'d8', name:'Vitamin C Serum',        category:'Skincare',  sku:'SK003', quantity:7,   min_stock:5,  unit:'bottle', cost_price:420,  selling_price:750,  supplier:'Glow Essentials',     is_active:true },
  ];
  renderInventoryTable(allProducts);
}

function renderInventoryTable(products) {
  var tbody = document.getElementById('inventory-tbody');
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📦</div><h3>No products yet</h3><p>Click <strong>+ Add Product</strong> to add your first item</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = products.map(function(p) {
    var maxQ = Math.max(p.min_stock*3, p.quantity, 1);
    var pct = Math.min(100, Math.round((p.quantity/maxQ)*100));
    var isOut = p.quantity <= 0;
    var isLow = !isOut && p.quantity < p.min_stock;
    var barC = isOut ? 'critical' : isLow ? 'low' : 'ok';
    var bdg  = isOut ? 'badge-red' : isLow ? 'badge-orange' : 'badge-green';
    var lbl  = isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock';
    return '<tr><td><div style="font-weight:600;font-size:0.83rem">' + p.name + '</div><div class="td-muted">' + (p.sku||'—') + '</div></td>'
      + '<td><span class="badge badge-gold">' + p.category + '</span></td>'
      + '<td><div class="stock-bar"><div class="stock-bar-track"><div class="stock-bar-fill ' + barC + '" style="width:' + pct + '%"></div></div><span class="stock-count">' + p.quantity + ' ' + (p.unit||'pcs') + '</span></div></td>'
      + '<td class="td-muted">' + p.min_stock + '</td>'
      + '<td>₱' + formatNumber(p.cost_price) + '</td>'
      + '<td>' + (p.selling_price > 0 ? '₱' + formatNumber(p.selling_price) : '<span class="td-muted">—</span>') + '</td>'
      + '<td><span class="badge ' + bdg + '">' + lbl + '</span></td>'
      + '<td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-outline btn-sm" onclick="openStockModal(\'' + p.id + '\',\'' + esc(p.name) + '\')">± Stock</button><button class="btn btn-outline btn-sm" onclick="editProduct(\'' + p.id + '\')">Edit</button><button class="btn btn-danger btn-sm" onclick="deleteProduct(\'' + p.id + '\')">Delete</button></div></td></tr>';
  }).join('');
}

function filterInventory() {
  var search = (getVal('inv-search')||'').toLowerCase();
  var cat = getVal('inv-cat-filter');
  var stock = getVal('inv-stock-filter');
  var filtered = allProducts.filter(function(p) {
    var ms = !search || p.name.toLowerCase().includes(search) || (p.sku||'').toLowerCase().includes(search);
    var mc = !cat || p.category === cat;
    var mk = !stock || (stock==='ok' && p.quantity>=p.min_stock) || (stock==='low' && p.quantity>0 && p.quantity<p.min_stock) || (stock==='out' && p.quantity<=0);
    return ms && mc && mk;
  });
  renderInventoryTable(filtered);
}

function openAddProductModal() {
  editingProductId = null;
  setText('product-modal-title', 'Add New Product');
  document.getElementById('product-form').reset();
  openModal('product-modal');
}

function editProduct(id) {
  var p = allProducts.find(function(x) { return x.id === id; });
  if (!p) return;
  editingProductId = id;
  setText('product-modal-title', 'Edit Product');
  setVal('pf-name', p.name); setVal('pf-category', p.category); setVal('pf-sku', p.sku||'');
  setVal('pf-unit', p.unit||'pcs'); setVal('pf-quantity', p.quantity); setVal('pf-min-stock', p.min_stock);
  setVal('pf-cost', p.cost_price); setVal('pf-price', p.selling_price); setVal('pf-supplier', p.supplier||''); setVal('pf-description', p.description||'');
  openModal('product-modal');
}

async function saveProduct() {
  var data = { name:getVal('pf-name').trim(), category:getVal('pf-category'), sku:getVal('pf-sku').trim()||null, unit:getVal('pf-unit'), quantity:parseInt(getVal('pf-quantity'))||0, min_stock:parseInt(getVal('pf-min-stock'))||5, cost_price:parseFloat(getVal('pf-cost'))||0, selling_price:parseFloat(getVal('pf-price'))||0, supplier:getVal('pf-supplier').trim()||null, description:getVal('pf-description').trim()||null, updated_at:new Date().toISOString() };
  if (!data.name || !data.category) { showToast('Name and category are required', 'error'); return; }
  if (!_isConnected) {
    if (editingProductId) { var i=allProducts.findIndex(function(p){return p.id===editingProductId;}); if(i>-1) allProducts[i]={...allProducts[i],...data}; }
    else allProducts.unshift({id:'d'+Date.now(),...data,is_active:true,created_at:new Date().toISOString()});
    renderInventoryTable(allProducts); closeModal('product-modal'); showToast(editingProductId?'Product updated':'Product added','success'); return;
  }
  var res = editingProductId
    ? await dbQuery(function(db){return db.from('products').update(data).eq('id',editingProductId).select().single();})
    : await dbQuery(function(db){return db.from('products').insert({...data,is_active:true}).select().single();});
  if (res.error) { showToast((res._classified||classifyError(res.error)).userMessage,'error',5000); return; }
  closeModal('product-modal'); showToast(editingProductId?'Updated ✓':'Added ✓','success'); loadInventory();
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  if (!_isConnected) { allProducts=allProducts.filter(function(p){return p.id!==id;}); renderInventoryTable(allProducts); showToast('Deleted','success'); return; }
  var res = await dbQuery(function(db){return db.from('products').update({is_active:false}).eq('id',id);});
  if (res.error) { showToast((res._classified||classifyError(res.error)).userMessage,'error',5000); return; }
  showToast('Deleted','success'); loadInventory();
}

// ---- STOCK ADJUSTMENT ----
var adjustingProductId = null;
function openStockModal(productId, productName) {
  adjustingProductId = productId;
  setText('stock-product-name', productName);
  setVal('stock-qty', 1); setVal('stock-type', 'in'); setVal('stock-notes', '');
  openModal('stock-modal');
}
async function saveStockAdjustment() {
  var type = getVal('stock-type'), qty = parseInt(getVal('stock-qty'))||0, notes = getVal('stock-notes').trim();
  if (qty<=0) { showToast('Enter a valid quantity','error'); return; }
  var product = allProducts.find(function(p){return p.id===adjustingProductId;});
  if (!product) return;
  var delta = type==='out' ? -qty : qty;
  var newQty = Math.max(0, product.quantity+delta);
  if (!_isConnected) {
    product.quantity=newQty; renderInventoryTable(allProducts); closeModal('stock-modal'); showToast('Stock updated','success'); return;
  }
  var r1 = await dbQuery(function(db){return db.from('products').update({quantity:newQty,updated_at:new Date().toISOString()}).eq('id',adjustingProductId);});
  if (r1.error) { showToast('Error: '+r1.error.message,'error'); return; }
  await dbQuery(function(db){return db.from('stock_transactions').insert({product_id:adjustingProductId,type,quantity:qty,notes});});
  closeModal('stock-modal'); showToast('Stock updated ✓','success'); loadInventory(); loadDashboard();
}

// ============================================================
// SERVICES
// ============================================================
var allServices = [];
var editingServiceId = null;
var DEFAULT_SERVICES = [
  {id:'s01',name:'Basic Facial',category:'Facial',price:400,duration_minutes:60,is_active:true},
  {id:'s02',name:'Diamond Peel',category:'Facial',price:500,duration_minutes:60,is_active:true},
  {id:'s03',name:'Glycopeel Facial',category:'Facial',price:800,duration_minutes:75,is_active:true},
  {id:'s04',name:'Hydra Glow Facial',category:'Facial',price:1000,duration_minutes:75,is_active:true},
  {id:'s05',name:'Black Crystal Carbon Peel',category:'Facial',price:1000,duration_minutes:75,is_active:true},
  {id:'s06',name:'Anti Aging Facial',category:'Facial',price:1000,duration_minutes:90,is_active:true},
  {id:'s07',name:'Korean BB Glow',category:'Facial',price:1000,duration_minutes:90,is_active:true},
  {id:'s08',name:'Korean BB Slim',category:'Facial',price:1500,duration_minutes:90,is_active:true},
  {id:'s09',name:'Korean Black Pearl',category:'Facial',price:1800,duration_minutes:90,is_active:true},
  {id:'s10',name:'RF Face Tightening',category:'Face Tightening',price:500,duration_minutes:45,is_active:true},
  {id:'s11',name:'RF Eye Bag Removal',category:'Face Tightening',price:300,duration_minutes:30,is_active:true},
  {id:'s12',name:'Underarm Waxing',category:'Waxing',price:250,duration_minutes:20,is_active:true},
  {id:'s13',name:'Half Leg Waxing',category:'Waxing',price:350,duration_minutes:30,is_active:true},
  {id:'s14',name:'Full Leg Waxing',category:'Waxing',price:600,duration_minutes:45,is_active:true},
  {id:'s15',name:'Bikini Waxing',category:'Waxing',price:400,duration_minutes:30,is_active:true},
  {id:'s16',name:'Brazilian Waxing',category:'Waxing',price:800,duration_minutes:45,is_active:true},
  {id:'s17',name:'Eyebrow Threading',category:'Threading',price:150,duration_minutes:15,is_active:true},
  {id:'s18',name:'Upper Lips Threading',category:'Threading',price:150,duration_minutes:10,is_active:true},
  {id:'s19',name:'Lower Lips Threading',category:'Threading',price:150,duration_minutes:10,is_active:true},
  {id:'s20',name:'Eyebrow Tinting',category:'Tinting',price:150,duration_minutes:20,is_active:true},
  {id:'s21',name:'Eyelash Tinting',category:'Tinting',price:150,duration_minutes:20,is_active:true},
  {id:'s22',name:'Meso Acne',category:'Meso Treatments',price:1500,duration_minutes:60,is_active:true},
  {id:'s23',name:'Meso Scar',category:'Meso Treatments',price:1500,duration_minutes:60,is_active:true},
  {id:'s24',name:'Meso White',category:'Meso Treatments',price:1500,duration_minutes:60,is_active:true},
  {id:'s25',name:'Exilis Whole Face',category:'Exilis Treatments',price:2000,duration_minutes:90,is_active:true},
  {id:'s26',name:'Exilis Eye Bag',category:'Exilis Treatments',price:500,duration_minutes:30,is_active:true},
  {id:'s27',name:'Exilis Cheeks',category:'Exilis Treatments',price:800,duration_minutes:45,is_active:true},
  {id:'s28',name:'Exilis Double Chin',category:'Exilis Treatments',price:1000,duration_minutes:45,is_active:true},
  {id:'s29',name:'Exilis Arms',category:'Exilis Treatments',price:1500,duration_minutes:60,is_active:true},
  {id:'s30',name:'Exilis Legs',category:'Exilis Treatments',price:1500,duration_minutes:60,is_active:true},
  {id:'s31',name:'Exilis Tummy',category:'Exilis Treatments',price:2000,duration_minutes:90,is_active:true},
];

async function loadServices() {
  document.getElementById('services-tbody').innerHTML = loadingRow(6);
  var res = await dbQuery(function(db){return db.from('services').select('*').order('category').order('name');});
  if (res.error || !res.data) {
    allServices = DEFAULT_SERVICES;
  } else if (res.data.length === 0) {
    allServices = DEFAULT_SERVICES;
    await seedServices();
  } else {
    allServices = res.data;
  }
  renderServicesTable(allServices);
}

async function seedServices() {
  if (!_isConnected) return;
  var rows = DEFAULT_SERVICES.map(function(s){return {name:s.name,category:s.category,price:s.price,duration_minutes:s.duration_minutes,is_active:true};});
  var res = await dbQuery(function(db){return db.from('services').insert(rows);});
  if (!res.error) showToast('All services seeded from your price list ✓','success');
}

function renderServicesTable(services) {
  var tbody = document.getElementById('services-tbody');
  if (!services.length) {
    tbody.innerHTML='<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">✨</div><h3>No services yet</h3><p>Click <strong>+ Add Service</strong></p></div></td></tr>';
    return;
  }
  tbody.innerHTML = services.map(function(s){
    return '<tr><td><div style="font-weight:600;font-size:0.83rem">'+s.name+'</div></td><td><span class="badge badge-teal">'+s.category+'</span></td><td style="font-weight:600;color:var(--gold-dark)">₱'+formatNumber(s.price)+'</td><td class="td-muted">'+s.duration_minutes+' min</td><td><span class="badge '+(s.is_active?'badge-green':'badge-gray')+'">'+(s.is_active?'Active':'Inactive')+'</span></td><td><div style="display:flex;gap:6px"><button class="btn btn-outline btn-sm" onclick="editService(\''+s.id+'\')">Edit</button><button class="btn btn-ghost btn-sm" onclick="toggleService(\''+s.id+'\','+(!s.is_active)+')">'+(s.is_active?'Deactivate':'Activate')+'</button></div></td></tr>';
  }).join('');
}

function filterServices(q) {
  var lq=q.toLowerCase();
  renderServicesTable(allServices.filter(function(s){return s.name.toLowerCase().includes(lq)||s.category.toLowerCase().includes(lq);}));
}
function openAddServiceModal() { editingServiceId=null; setText('service-modal-title','Add Service'); document.getElementById('service-form').reset(); openModal('service-modal'); }
function editService(id) {
  var s=allServices.find(function(x){return x.id===id;}); if(!s) return;
  editingServiceId=id; setText('service-modal-title','Edit Service');
  setVal('sf-name',s.name); setVal('sf-category',s.category); setVal('sf-price',s.price); setVal('sf-duration',s.duration_minutes); setVal('sf-description',s.description||'');
  openModal('service-modal');
}
async function saveService() {
  var data={name:getVal('sf-name').trim(),category:getVal('sf-category').trim(),price:parseFloat(getVal('sf-price'))||0,duration_minutes:parseInt(getVal('sf-duration'))||60,description:getVal('sf-description').trim()||null};
  if (!data.name||!data.category||!data.price) { showToast('Name, category and price required','error'); return; }
  if (!_isConnected) {
    if (editingServiceId) { var i=allServices.findIndex(function(s){return s.id===editingServiceId;}); if(i>-1) allServices[i]={...allServices[i],...data}; }
    else allServices.unshift({id:'s'+Date.now(),...data,is_active:true});
    renderServicesTable(allServices); closeModal('service-modal'); showToast('Saved','success'); return;
  }
  var res=editingServiceId
    ? await dbQuery(function(db){return db.from('services').update(data).eq('id',editingServiceId);})
    : await dbQuery(function(db){return db.from('services').insert({...data,is_active:true});});
  if (res.error) { showToast((res._classified||classifyError(res.error)).userMessage,'error',5000); return; }
  closeModal('service-modal'); showToast('Service saved ✓','success'); loadServices();
}
async function toggleService(id, active) {
  if (!_isConnected) { var s=allServices.find(function(x){return x.id===id;}); if(s){s.is_active=active;renderServicesTable(allServices);} return; }
  await dbQuery(function(db){return db.from('services').update({is_active:active}).eq('id',id);}); loadServices();
}

// ============================================================
// APPOINTMENTS
// ============================================================
var allAppointments=[], selectedDate=new Date(), editingApptId=null;

async function loadAppointments() { renderDateStrip(); await fetchAppointmentsForDate(selectedDate); }
function renderDateStrip() {
  var strip=document.getElementById('date-strip'), days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], today=new Date(), html='';
  for (var i=-2;i<=9;i++) { var d=new Date(today); d.setDate(today.getDate()+i); var active=d.toDateString()===selectedDate.toDateString(); html+='<div class="date-chip '+(active?'active':'')+'" onclick="selectDate('+d.getTime()+')"><span class="day">'+days[d.getDay()]+'</span><span class="num">'+d.getDate()+'</span></div>'; }
  strip.innerHTML=html;
}
function selectDate(ts) { selectedDate=new Date(ts); renderDateStrip(); fetchAppointmentsForDate(selectedDate); }
async function fetchAppointmentsForDate(date) {
  var dateStr=date.toISOString().split('T')[0];
  setText('appt-date-label', date.toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'}));
  document.getElementById('appointments-list').innerHTML='<div class="loading-spinner"></div>';
  var res=await dbQuery(function(db){return db.from('appointments').select('*').eq('appointment_date',dateStr).order('appointment_time');});
  if (res.error) {
    if (_isConnected) {
      var classified = res._classified || classifyError(res.error);
      showToast('Appointments: ' + classified.userMessage, 'error', 5000);
    }
    renderDemoAppointments(); return;
  }
  allAppointments=res.data||[];
  renderAppointments(allAppointments);
}
function renderDemoAppointments() {
  allAppointments=[
    {id:'a1',client_name:'Maria Santos',client_phone:'0917-123-4567',service_name:'Korean Black Pearl',appointment_time:'13:00',status:'confirmed',amount:1800},
    {id:'a2',client_name:'Ana Reyes',client_phone:'0918-987-6543',service_name:'Brazilian Waxing',appointment_time:'14:30',status:'pending',amount:800},
    {id:'a3',client_name:'Carla Dela Cruz',client_phone:'0919-555-1234',service_name:'Meso Acne',appointment_time:'16:00',status:'confirmed',amount:1500},
    {id:'a4',client_name:'Lisa Flores',client_phone:'0920-111-2222',service_name:'Diamond Peel',appointment_time:'18:00',status:'completed',amount:500},
  ];
  renderAppointments(allAppointments);
}
function renderAppointments(appts) {
  var list=document.getElementById('appointments-list');
  if (!appts.length) { list.innerHTML='<div class="empty-state"><div class="empty-icon">📅</div><h3>No appointments</h3><p>No bookings for this day. Click <strong>+ New Appointment</strong>.</p></div>'; return; }
  list.innerHTML=appts.map(function(a){
    var badgeCls=a.status==='confirmed'?'badge-green':a.status==='completed'?'badge-gray':a.status==='cancelled'?'badge-red':'badge-orange';
    var btns=(a.status!=='completed'&&a.status!=='cancelled')?'<button class="btn btn-outline btn-sm" onclick="updateApptStatus(\''+a.id+'\',\'confirmed\')">✓</button><button class="btn btn-danger btn-sm" onclick="updateApptStatus(\''+a.id+'\',\'cancelled\')">✕</button>':'';
    return '<div class="appt-card '+a.status+'"><div class="appt-time">'+formatTime(a.appointment_time)+'</div><div class="appt-info"><div class="appt-client">'+a.client_name+'</div><div class="appt-service">'+(a.service_name||'No service')+' • '+(a.client_phone||'No phone')+'</div></div><span class="badge '+badgeCls+'">'+capitalize(a.status)+'</span><div class="appt-amount">₱'+formatNumber(a.amount||0)+'</div><div style="display:flex;gap:6px">'+btns+'<button class="btn btn-ghost btn-sm" onclick="editAppointment(\''+a.id+'\')">Edit</button></div></div>';
  }).join('');
}
async function updateApptStatus(id, status) {
  if (!_isConnected) { var a=allAppointments.find(function(x){return x.id===id;}); if(a){a.status=status;renderAppointments(allAppointments);} showToast('Updated','success'); return; }
  var res=await dbQuery(function(db){return db.from('appointments').update({status}).eq('id',id);});
  if (res.error) { showToast((res._classified||classifyError(res.error)).userMessage,'error',5000); return; }
  showToast('Updated ✓','success'); fetchAppointmentsForDate(selectedDate);
}
function openAddAppointmentModal() {
  editingApptId=null; setText('appt-modal-title','New Appointment'); document.getElementById('appt-form').reset();
  setVal('af-date',selectedDate.toISOString().split('T')[0]); setVal('af-status','pending');
  populateServiceSelect(); openModal('appt-modal');
}
function editAppointment(id) {
  var a=allAppointments.find(function(x){return x.id===id;}); if(!a) return;
  editingApptId=id; setText('appt-modal-title','Edit Appointment');
  setVal('af-client',a.client_name); setVal('af-phone',a.client_phone||''); setVal('af-date',a.appointment_date||selectedDate.toISOString().split('T')[0]);
  setVal('af-time',a.appointment_time); setVal('af-amount',a.amount||''); setVal('af-status',a.status); setVal('af-notes',a.notes||'');
  populateServiceSelect(a.service_id); openModal('appt-modal');
}
function populateServiceSelect(selectedId) {
  var sel=document.getElementById('af-service');
  sel.innerHTML='<option value="">— Select service —</option>'+allServices.filter(function(s){return s.is_active;}).map(function(s){return '<option value="'+s.id+'" data-price="'+s.price+'"'+(s.id===selectedId?' selected':'')+'>'+s.name+' — ₱'+formatNumber(s.price)+'</option>';}).join('');
  sel.onchange=function(){var opt=sel.options[sel.selectedIndex]; if(opt&&opt.dataset.price) setVal('af-amount',opt.dataset.price);};
}
async function saveAppointment() {
  var sel=document.getElementById('af-service'), sOpt=sel.options[sel.selectedIndex];
  var data={client_name:getVal('af-client').trim(),client_phone:getVal('af-phone').trim()||null,service_id:sel.value||null,service_name:(sel.value&&sOpt)?sOpt.text.split(' — ')[0].trim():null,appointment_date:getVal('af-date'),appointment_time:getVal('af-time'),amount:parseFloat(getVal('af-amount'))||0,status:getVal('af-status'),notes:getVal('af-notes').trim()||null};
  if (!data.client_name||!data.appointment_date||!data.appointment_time) { showToast('Client name, date and time required','error'); return; }
  if (!_isConnected) {
    if (editingApptId) { var i=allAppointments.findIndex(function(a){return a.id===editingApptId;}); if(i>-1) allAppointments[i]={...allAppointments[i],...data}; }
    else allAppointments.push({id:'a'+Date.now(),...data});
    allAppointments.sort(function(a,b){return a.appointment_time.localeCompare(b.appointment_time);});
    renderAppointments(allAppointments); closeModal('appt-modal'); showToast('Saved (demo)','success'); return;
  }
  var res=editingApptId?await dbQuery(function(db){return db.from('appointments').update(data).eq('id',editingApptId);}):await dbQuery(function(db){return db.from('appointments').insert(data);});
  if (res.error) { showToast((res._classified||classifyError(res.error)).userMessage,'error',5000); return; }
  closeModal('appt-modal'); showToast('Appointment saved ✓','success'); fetchAppointmentsForDate(selectedDate);
}

// ============================================================
// SALES / POS
// ============================================================
var posCart=[], allSales=[];
async function loadSales() {
  if (!allServices.length) await loadServices();
  populatePOSServiceList(''); renderCart(); loadSalesHistory();
}
function populatePOSServiceList(category) {
  var list=document.getElementById('pos-services');
  var svcs=allServices.filter(function(s){return s.is_active&&(!category||s.category===category);});
  if (!svcs.length) { list.innerHTML='<p class="td-muted" style="padding:20px;text-align:center">No services here</p>'; return; }
  list.innerHTML=svcs.map(function(s){return '<div class="pos-service-item" onclick="addToCart(\''+s.id+'\',\''+esc(s.name)+'\','+s.price+')"><div style="font-weight:600;font-size:0.82rem">'+s.name+'</div><div style="color:var(--gold-dark);font-weight:700;margin-top:3px">₱'+formatNumber(s.price)+'</div><div style="font-size:0.68rem;color:var(--gray);margin-top:2px">'+s.category+'</div></div>';}).join('');
}
function filterPOS(btn, category) { document.querySelectorAll('.pos-cat-btn').forEach(function(b){b.classList.remove('active');}); btn.classList.add('active'); populatePOSServiceList(category); }
function addToCart(id,name,price) { var e=posCart.find(function(c){return c.id===id;}); e?e.qty++:posCart.push({id,name,price,qty:1}); renderCart(); }
function removeFromCart(idx) { posCart.splice(idx,1); renderCart(); }
function clearCart() { posCart=[]; setVal('pos-client',''); setVal('pos-discount',''); renderCart(); }
function renderCart() {
  var cartList=document.getElementById('cart-list');
  var subtotal=posCart.reduce(function(s,i){return s+i.price*i.qty;},0);
  var discount=parseFloat(getVal('pos-discount'))||0, total=Math.max(0,subtotal-discount);
  if (!posCart.length) { cartList.innerHTML='<div class="empty-state" style="padding:24px"><div class="empty-icon" style="font-size:2rem">🛒</div><p style="font-size:0.78rem">Tap a service to add</p></div>'; }
  else { cartList.innerHTML=posCart.map(function(item,idx){return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(201,151,28,0.08)"><div style="flex:1"><div style="font-size:0.82rem;font-weight:500">'+item.name+'</div><div style="font-size:0.7rem;color:var(--gray)">₱'+formatNumber(item.price)+' × '+item.qty+'</div></div><div style="font-weight:600;color:var(--dark);font-size:0.82rem;white-space:nowrap">₱'+formatNumber(item.price*item.qty)+'</div><button onclick="removeFromCart('+idx+')" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:1.1rem;line-height:1;padding:2px 4px">×</button></div>';}).join(''); }
  setText('cart-subtotal','₱'+formatNumber(subtotal)); setText('cart-discount','₱'+formatNumber(discount)); setText('cart-total','₱'+formatNumber(total));
}
async function processSale() {
  var clientName=getVal('pos-client').trim()||'Walk-in Client', discount=parseFloat(getVal('pos-discount'))||0, payMethod=getVal('pos-payment');
  if (!posCart.length) { showToast('Add services first','error'); return; }
  var subtotal=posCart.reduce(function(s,i){return s+i.price*i.qty;},0), total=Math.max(0,subtotal-discount);
  var saleData={client_name:clientName,items:posCart,subtotal,discount,total,payment_method:payMethod,status:'completed'};
  if (!_isConnected) { allSales.unshift({id:'sale'+Date.now(),...saleData,created_at:new Date().toISOString()}); showToast('₱'+formatNumber(total)+' sale for '+clientName+' ✓','success'); clearCart(); return; }
  var res=await dbQuery(function(db){return db.from('sales').insert(saleData);});
  if (res.error) { showToast((res._classified||classifyError(res.error)).userMessage,'error',5000); return; }
  showToast('₱'+formatNumber(total)+' processed ✓','success'); clearCart(); loadSalesHistory();
}
async function loadSalesHistory() {
  document.getElementById('sales-tbody').innerHTML=loadingRow(6);
  var res=await dbQuery(function(db){return db.from('sales').select('*').order('created_at',{ascending:false}).limit(50);});
  var sales=(res.data&&!res.error)?res.data:allSales.length?allSales:getDemoSales();
  renderSalesTable(sales);
}
function getDemoSales() {
  return [
    {id:'ds1',client_name:'Maria Santos',items:[{name:'Korean Black Pearl',qty:1,price:1800}],total:1800,discount:0,payment_method:'gcash',created_at:new Date().toISOString()},
    {id:'ds2',client_name:'Ana Reyes',items:[{name:'Brazilian Waxing',qty:1,price:800}],total:750,discount:50,payment_method:'cash',created_at:new Date(Date.now()-86400000).toISOString()},
    {id:'ds3',client_name:'Carla Dela Cruz',items:[{name:'Meso Acne',qty:1,price:1500},{name:'Diamond Peel',qty:1,price:500}],total:2000,discount:0,payment_method:'card',created_at:new Date(Date.now()-172800000).toISOString()},
  ];
}
function renderSalesTable(sales) {
  var tbody=document.getElementById('sales-tbody');
  if (!sales.length) { tbody.innerHTML='<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">💰</div><h3>No sales yet</h3><p>Process a sale from the <strong>New Sale</strong> tab</p></div></td></tr>'; return; }
  tbody.innerHTML=sales.map(function(s){var items=Array.isArray(s.items)?s.items.map(function(i){return i.name;}).join(', '):'—'; return '<tr><td class="td-muted">'+formatDate(s.created_at)+'</td><td style="font-weight:500">'+s.client_name+'</td><td class="td-muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+items+'">'+items+'</td><td style="font-weight:700;color:var(--gold-dark)">₱'+formatNumber(s.total)+'</td><td><span class="badge badge-teal">'+capitalize(s.payment_method||'cash')+'</span></td><td><span class="badge badge-green">Completed</span></td></tr>';}).join('');
}

// ============================================================
// REPORTS
// ============================================================
async function loadReports() {
  if (!_isConnected) { renderDemoReports(); return; }
  var startOfMonth=new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
  var dateStr=startOfMonth.toISOString().split('T')[0];
  var [sRes,aRes,pRes]=await Promise.all([
    dbQuery(function(db){return db.from('sales').select('total,created_at').gte('created_at',startOfMonth.toISOString());}),
    dbQuery(function(db){return db.from('appointments').select('status,service_name,amount').gte('appointment_date',dateStr);}),
    dbQuery(function(db){return db.from('products').select('id',{count:'exact',head:true}).eq('is_active',true);}),
  ]);
  var sales=sRes.data||[], appts=aRes.data||[];
  var monthRev=sales.reduce(function(s,r){return s+(parseFloat(r.total)||0);},0);
  var completed=appts.filter(function(a){return a.status==='completed';}).length;
  setText('rpt-revenue','₱'+formatNumber(monthRev)); setText('rpt-completed',completed); setText('rpt-total-appts',appts.length); setText('rpt-products',pRes.count||0);
  renderRevenueBarChart(sales); renderTopServices(appts);
}
function renderDemoReports() {
  setText('rpt-revenue','₱52,500'); setText('rpt-completed',38); setText('rpt-total-appts',45); setText('rpt-products',47);
  var canvas=document.getElementById('rpt-revenue-chart'); if(!canvas) return;
  canvas.width=canvas.offsetWidth||400;
  drawBarChart(canvas.getContext('2d'),canvas.width,200,['1','2','3','4','5','6','7','8','9','10'],[4200,6100,3800,7500,5400,9200,4700,6800,8100,7400]);
  renderTopServices([]);
}
function renderRevenueBarChart(sales) {
  var canvas=document.getElementById('rpt-revenue-chart'); if(!canvas||!sales.length) { renderDemoReports(); return; }
  canvas.width=canvas.offsetWidth||400;
  var groups={};
  sales.forEach(function(s){var d=new Date(s.created_at).getDate().toString(); groups[d]=(groups[d]||0)+(parseFloat(s.total)||0);});
  var days=Object.keys(groups).sort(function(a,b){return +a-+b;});
  drawBarChart(canvas.getContext('2d'),canvas.width,200,days,days.map(function(d){return groups[d];}));
}
function renderTopServices(appts) {
  var counts={};
  appts.forEach(function(a){if(a.service_name) counts[a.service_name]=(counts[a.service_name]||0)+1;});
  var sorted=Object.entries(counts).sort(function(a,b){return b[1]-a[1];}).slice(0,5);
  var el=document.getElementById('top-services-list');
  el.innerHTML=sorted.length?sorted.map(function(e){return '<div class="report-metric"><span class="report-metric-label">'+e[0]+'</span><span class="badge badge-teal">'+e[1]+' bookings</span></div>';}).join(''):
    '<div class="report-metric"><span class="report-metric-label">Korean Black Pearl</span><span class="badge badge-gold">₱1,800</span></div><div class="report-metric"><span class="report-metric-label">Exilis Tummy</span><span class="badge badge-gold">₱2,000</span></div><div class="report-metric"><span class="report-metric-label">Meso Acne</span><span class="badge badge-teal">₱1,500</span></div><div class="report-metric"><span class="report-metric-label">Brazilian Waxing</span><span class="badge badge-teal">₱800</span></div><div class="report-metric"><span class="report-metric-label">Diamond Peel</span><span class="badge badge-green">₱500</span></div>';
}

// ============================================================
// SUPPLIERS
// ============================================================
var allSuppliers=[], editingSuppId=null;
async function loadSuppliers() {
  document.getElementById('suppliers-tbody').innerHTML=loadingRow(6);
  var res=await dbQuery(function(db){return db.from('suppliers').select('*').order('name');});
  allSuppliers=(res.data&&!res.error)?res.data:getDemoSuppliers();
  renderSuppliersTable(allSuppliers);
}
function getDemoSuppliers(){return [{id:'sup1',name:'Beauty Supplies Co.',contact_person:'Ms. Rivera',phone:'02-8123-4567',email:'orders@beautysupplies.ph',is_active:true},{id:'sup2',name:'Hair Removal PH',contact_person:'Mr. Santos',phone:'0917-456-7890',email:'sales@hairremoval.ph',is_active:true},{id:'sup3',name:'Glow Essentials',contact_person:'Ms. Dela Cruz',phone:'0918-111-2222',email:'glow@essentials.ph',is_active:true},{id:'sup4',name:'Nail World PH',contact_person:'Ms. Flores',phone:'0919-333-4444',email:'nailworld@ph.com',is_active:true}];}
function renderSuppliersTable(suppliers) {
  var tbody=document.getElementById('suppliers-tbody');
  if (!suppliers.length) { tbody.innerHTML='<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🚚</div><h3>No suppliers yet</h3><p>Click <strong>+ Add Supplier</strong></p></div></td></tr>'; return; }
  tbody.innerHTML=suppliers.map(function(s){return '<tr><td style="font-weight:600">'+s.name+'</td><td class="td-muted">'+(s.contact_person||'—')+'</td><td class="td-muted">'+(s.phone||'—')+'</td><td class="td-muted">'+(s.email||'—')+'</td><td><span class="badge '+(s.is_active?'badge-green':'badge-gray')+'">'+(s.is_active?'Active':'Inactive')+'</span></td><td><button class="btn btn-outline btn-sm" onclick="editSupplier(\''+s.id+'\')">Edit</button></td></tr>';}).join('');
}
function openAddSupplierModal(){editingSuppId=null;setText('supplier-modal-title','Add Supplier');document.getElementById('supplier-form').reset();openModal('supplier-modal');}
function editSupplier(id){var s=allSuppliers.find(function(x){return x.id===id;});if(!s)return;editingSuppId=id;setText('supplier-modal-title','Edit Supplier');setVal('supf-name',s.name);setVal('supf-contact',s.contact_person||'');setVal('supf-phone',s.phone||'');setVal('supf-email',s.email||'');setVal('supf-address',s.address||'');openModal('supplier-modal');}
async function saveSupplier(){var data={name:getVal('supf-name').trim(),contact_person:getVal('supf-contact').trim()||null,phone:getVal('supf-phone').trim()||null,email:getVal('supf-email').trim()||null,address:getVal('supf-address').trim()||null};if(!data.name){showToast('Name required','error');return;}if(!_isConnected){if(editingSuppId){var i=allSuppliers.findIndex(function(s){return s.id===editingSuppId;});if(i>-1)allSuppliers[i]={...allSuppliers[i],...data};}else allSuppliers.push({id:'sup'+Date.now(),...data,is_active:true});renderSuppliersTable(allSuppliers);closeModal('supplier-modal');showToast('Saved','success');return;}var res=editingSuppId?await dbQuery(function(db){return db.from('suppliers').update(data).eq('id',editingSuppId);}):await dbQuery(function(db){return db.from('suppliers').insert({...data,is_active:true});});if(res.error){showToast((res._classified||classifyError(res.error)).userMessage,'error',5000);return;}closeModal('supplier-modal');showToast('Saved ✓','success');loadSuppliers();}

// ============================================================
// STAFF
// ============================================================
var allStaff=[], editingStaffId=null;
async function loadStaff(){document.getElementById('staff-tbody').innerHTML=loadingRow(6);var res=await dbQuery(function(db){return db.from('staff').select('*').order('name');});allStaff=(res.data&&!res.error)?res.data:getDemoStaff();renderStaffTable(allStaff);}
function getDemoStaff(){return [{id:'st1',name:'Meera',role:'Owner / Aesthetician',phone:'09993962841',email:'meera@panemorfi.ph',is_active:true},{id:'st2',name:'Ana Cruz',role:'Nail Technician',phone:'0918-111-2222',email:'',is_active:true},{id:'st3',name:'Rica Santos',role:'Skin Therapist',phone:'0919-333-4444',email:'',is_active:true}];}
function renderStaffTable(staff){var tbody=document.getElementById('staff-tbody');if(!staff.length){tbody.innerHTML='<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👥</div><h3>No staff yet</h3></div></td></tr>';return;}tbody.innerHTML=staff.map(function(s){return '<tr><td><div style="display:flex;align-items:center;gap:10px"><div class="user-avatar" style="width:32px;height:32px;font-size:0.75rem">'+s.name.charAt(0).toUpperCase()+'</div><span style="font-weight:600">'+s.name+'</span></div></td><td><span class="badge badge-gold">'+(s.role||'Staff')+'</span></td><td class="td-muted">'+(s.phone||'—')+'</td><td class="td-muted">'+(s.email||'—')+'</td><td><span class="badge '+(s.is_active?'badge-green':'badge-gray')+'">'+(s.is_active?'Active':'Inactive')+'</span></td><td><button class="btn btn-outline btn-sm" onclick="editStaff(\''+s.id+'\')">Edit</button></td></tr>';}).join('');}
function openAddStaffModal(){editingStaffId=null;setText('staff-modal-title','Add Staff Member');document.getElementById('staff-form').reset();openModal('staff-modal');}
function editStaff(id){var s=allStaff.find(function(x){return x.id===id;});if(!s)return;editingStaffId=id;setText('staff-modal-title','Edit Staff Member');setVal('stf-name',s.name);setVal('stf-role',s.role||'');setVal('stf-phone',s.phone||'');setVal('stf-email',s.email||'');openModal('staff-modal');}
async function saveStaff(){var data={name:getVal('stf-name').trim(),role:getVal('stf-role').trim()||null,phone:getVal('stf-phone').trim()||null,email:getVal('stf-email').trim()||null};if(!data.name){showToast('Name required','error');return;}if(!_isConnected){if(editingStaffId){var i=allStaff.findIndex(function(s){return s.id===editingStaffId;});if(i>-1)allStaff[i]={...allStaff[i],...data};}else allStaff.push({id:'st'+Date.now(),...data,is_active:true});renderStaffTable(allStaff);closeModal('staff-modal');showToast('Saved','success');return;}var res=editingStaffId?await dbQuery(function(db){return db.from('staff').update(data).eq('id',editingStaffId);}):await dbQuery(function(db){return db.from('staff').insert({...data,is_active:true});});if(res.error){showToast((res._classified||classifyError(res.error)).userMessage,'error',5000);return;}closeModal('staff-modal');showToast('Saved ✓','success');loadStaff();}

// ============================================================
// SETTINGS
// ============================================================
function updateConnectionBadge(){var el=document.getElementById('connection-status');if(!el)return;el.innerHTML=_isConnected?'<span class="badge badge-green">Connected to Supabase</span>':'<span class="badge badge-orange">Not Connected (Demo Mode)</span>';}
async function saveSupabaseConfig(){var url=getVal('cfg-url').trim(),key=getVal('cfg-key').trim();if(!url||!key){showToast('Enter both URL and API key','error');return;}if(!isValidSupabaseUrl(url)){showToast('Invalid URL format. Expected: https://xxxxx.supabase.co','error',5000);return;}if(!isValidSupabaseKey(key)){showToast('Invalid API key. The key should start with "eyJ..."','error',5000);return;}showToast('Testing connection…','info',10000);var client=initSupabase(url,key);if(!client){updateConnectionBadge();updateSetupBanner();return;}var ok=await verifyConnection();updateConnectionBadge();updateSetupBanner();if(ok){localStorage.setItem('mp_supabase_url',url);localStorage.setItem('mp_supabase_key',key);showToast('Connected and verified — loading data…','success');setTimeout(function(){navigateTo('dashboard');},800);}else{_db=null;_isConnected=false;updateConnectionBadge();updateSetupBanner();}}
async function testConnection(){if(!_isConnected||!_db){showToast('Not connected — configure Supabase in Settings first','warning');return;}showToast('Testing connection…','info',8000);var ok=await verifyConnection();updateConnectionBadge();updateSetupBanner();if(ok){showToast('Connection test passed — Supabase is reachable','success');}}
function copySQLSchema(){var ta=document.querySelector('textarea[readonly]');if(!ta)return;navigator.clipboard.writeText(ta.value).then(function(){showToast('SQL copied ✓','success');}).catch(function(){showToast('Copy failed — select manually','error');});}

// ============================================================
// MODALS & TABS
// ============================================================
function openModal(id){document.getElementById(id)&&document.getElementById(id).classList.add('active');document.body.style.overflow='hidden';}
function closeModal(id){document.getElementById(id)&&document.getElementById(id).classList.remove('active');document.body.style.overflow='';}
document.addEventListener('click',function(e){if(e.target.classList.contains('modal-overlay')){e.target.classList.remove('active');document.body.style.overflow='';}});
function switchTab(groupId,tabId){var group=document.getElementById(groupId);if(!group)return;group.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active');});group.querySelectorAll('.tab-content').forEach(function(c){c.classList.remove('active');});var btn=group.querySelector('[data-tab="'+tabId+'"]');if(btn)btn.classList.add('active');var content=document.getElementById(tabId);if(content)content.classList.add('active');}

// ============================================================
// UTILITIES
// ============================================================
function formatNumber(n){return (parseFloat(n)||0).toLocaleString('en-PH',{minimumFractionDigits:0,maximumFractionDigits:2});}
function formatDate(iso){if(!iso)return '—';return new Date(iso).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});}
function formatTime(t){if(!t)return '';var parts=t.split(':'),hN=parseInt(parts[0]);return (hN>12?hN-12:hN||12)+':'+parts[1]+' '+(hN>=12?'PM':'AM');}
function timeAgo(iso){var diff=Date.now()-new Date(iso).getTime(),mins=Math.floor(diff/60000);if(mins<1)return 'just now';if(mins<60)return mins+'m ago';var hrs=Math.floor(mins/60);if(hrs<24)return hrs+'h ago';return Math.floor(hrs/24)+'d ago';}
function capitalize(s){return s?s.charAt(0).toUpperCase()+s.slice(1):'';}
function esc(s){return (s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');}
function getVal(id){var el=document.getElementById(id);return el?el.value:'';}
function setVal(id,v){var el=document.getElementById(id);if(el)el.value=(v==null?'':v);}
function setText(id,v){var el=document.getElementById(id);if(el)el.textContent=(v==null?'':v);}
function loadingRow(cols){return '<tr><td colspan="'+cols+'" style="text-align:center;padding:32px"><div class="loading-spinner"></div></td></tr>';}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  var savedUrl=localStorage.getItem('mp_supabase_url');
  var savedKey=localStorage.getItem('mp_supabase_key');
  if (savedUrl && savedKey) {
    setVal('cfg-url', savedUrl);
    setVal('cfg-key', savedKey);
    var client = initSupabase(savedUrl, savedKey);
    if (client) {
      verifyConnection().then(function(ok) {
        updateConnectionBadge();
        updateSetupBanner();
        if (!ok) {
          showToast('Could not verify Supabase connection — running in Demo Mode', 'warning', 5000);
        }
      });
    }
  }
  updateConnectionBadge();
  updateSetupBanner();
  document.querySelectorAll('.nav-item[data-page]').forEach(function(item){
    item.addEventListener('click', function(){ navigateTo(item.dataset.page); });
  });
  navigateTo('dashboard');
  renderCart();

  // Monitor network connectivity
  window.addEventListener('offline', function() {
    showToast('You are offline — data changes will not be saved', 'warning', 5000);
  });
  window.addEventListener('online', function() {
    showToast('Back online', 'info', 3000);
    if (_db && !_isConnected) {
      verifyConnection().then(function(ok) {
        updateConnectionBadge();
        updateSetupBanner();
        if (ok) {
          showToast('Reconnected to Supabase', 'success');
          _consecutiveErrors = 0;
        }
      });
    }
  });
});

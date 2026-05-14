// ============================================================
// MEERAS PANEMORFI — INVENTORY MANAGEMENT SYSTEM
// Fixed: Supabase namespace, empty tables, error handling
// ============================================================

// ---- SUPABASE CLIENT ----
// Use _db to avoid colliding with window.supabase (the library itself)
let _db = null;
let _isConnected = false;

function initSupabase(url, key) {
  if (!url || !key || url.includes('YOUR_SUPABASE')) return null;
  try {
    _db = window.supabase.createClient(url, key);
    _isConnected = true;
    console.log('[Meeras IMS] Supabase connected');
    return _db;
  } catch (e) {
    console.error('[Meeras IMS] Supabase init error:', e);
    _isConnected = false;
    return null;
  }
}

// Safe query wrapper
async function dbQuery(fn) {
  if (!_db) return { data: null, error: new Error('Not connected'), count: null };
  try {
    const result = await fn(_db);
    if (result.error) console.warn('[DB]', result.error.message);
    return result;
  } catch (e) {
    console.error('[DB Error]', e);
    return { data: null, error: e, count: null };
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
  var role = sessionStorage.getItem('mp_user_role');
  if (role === 'staff' && (page === 'reports' || page === 'suppliers')) {
    showToast('Access denied: Staff cannot view ' + page, 'error');
    return;
  }

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
    staff:        ['Staff', 'Team members']
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



// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  if (!_isConnected) {
    renderDemoDashboard();
    renderDemoChart();
    return;
  }

  try {
    var today = new Date().toISOString().split('T')[0];
    var [pRes, lRes] = await Promise.all([
      dbQuery(function(db) { return db.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true); }),
      dbQuery(function(db) { return db.from('products').select('id', { count: 'exact', head: true }).lt('quantity', 5).gte('quantity', 0).eq('is_active', true); })
    ]);
    var totalProducts = pRes.count || 0;
    var lowStock = lRes.count || 0;
    updateDashboardStats(totalProducts, lowStock);
    await Promise.all([loadRecentActivity(), loadLowStockAlerts()]);
    loadDashboardChart();
  } catch(e) {
    console.error(e);
    renderDemoDashboard();
    renderDemoChart();
  }
}

async function loadDashboardChart() {
  var res = await dbQuery(function(db){return db.from('stock_transactions').select('type, quantity, created_at');});
  if(res.error) { renderDemoChart(); return; }
  var txns = res.data || [];
  
  var dailyCanvas=document.getElementById('daily-revenue-chart');
  var weeklyCanvas=document.getElementById('weekly-revenue-chart');
  if(!dailyCanvas || !weeklyCanvas) return;
  
  dailyCanvas.width=dailyCanvas.offsetWidth||300;
  weeklyCanvas.width=weeklyCanvas.offsetWidth||300;
  
  var dCtx=dailyCanvas.getContext('2d');
  var wCtx=weeklyCanvas.getContext('2d');
  
  var outs = txns.filter(function(t){return t.type==='out';});
  
  // Daily Logic (Fixed Sun-Sat)
  var fixedDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var dGroups = { 'Sun':0, 'Mon':0, 'Tue':0, 'Wed':0, 'Thu':0, 'Fri':0, 'Sat':0 };
  var now = new Date();
  var sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  
  outs.forEach(function(t){
    var dt = new Date(t.created_at);
    if (dt >= sevenDaysAgo) {
      var dayStr = dt.toLocaleDateString('en-US', {weekday: 'short'});
      if (dGroups[dayStr] !== undefined) {
        dGroups[dayStr] += (t.quantity || 0);
      }
    }
  });
  
  drawBarChart(dCtx, dailyCanvas.width, 200, fixedDays, fixedDays.map(function(d){return dGroups[d];}));

  // Weekly Logic (Fixed Week 1-4)
  var fixedWeeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
  var wGroups = { 'Week 1':0, 'Week 2':0, 'Week 3':0, 'Week 4':0 };
  var currentMonth = now.getMonth();
  var currentYear = now.getFullYear();

  outs.forEach(function(t){
    var dt = new Date(t.created_at);
    if (dt.getMonth() === currentMonth && dt.getFullYear() === currentYear) {
      var weekNum = Math.ceil(dt.getDate() / 7);
      if (weekNum > 4) weekNum = 4; // group days 29-31 into week 4
      var wStr = "Week " + weekNum;
      wGroups[wStr] = (wGroups[wStr] || 0) + (t.quantity || 0);
    }
  });

  drawBarChart(wCtx, weeklyCanvas.width, 200, fixedWeeks, fixedWeeks.map(function(w){return wGroups[w];}));
}

function updateDashboardStats(products, lowStock) {
  setText('stat-products',  products);
  setText('stat-low-stock', lowStock);
  var badge = document.getElementById('low-stock-badge');
  if (badge) { badge.textContent = lowStock; badge.style.display = lowStock > 0 ? 'inline-block' : 'none'; }
  var dot = document.getElementById('header-alert-dot');
  if (dot) dot.style.display = lowStock > 0 ? 'block' : 'none';
}

function renderDemoDashboard() {
  updateDashboardStats(47, 3);
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
  var dCanvas = document.getElementById('daily-revenue-chart');
  var wCanvas = document.getElementById('weekly-revenue-chart');
  if (dCanvas) {
    dCanvas.width = dCanvas.offsetWidth || 300;
    drawBarChart(dCanvas.getContext('2d'), dCanvas.width, 200, ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], [5, 12, 19, 8, 25, 14, 22]);
  }
  if (wCanvas) {
    wCanvas.width = wCanvas.offsetWidth || 300;
    drawBarChart(wCanvas.getContext('2d'), wCanvas.width, 200, ['Week 1', 'Week 2', 'Week 3', 'Week 4'], [45, 60, 30, 85]);
  }
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
    ctx.fillText(val >= 1000 ? (val/1000).toFixed(1)+'k' : val.toFixed(0), pad.left-5, y+4);
  }
  var rects = [];
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
    rects.push({x: x+barW/2, y: y+barH/2, w: barW, h: barH, label: label, value: values[i]});
  });

  // Attach hover logic
  ctx.canvas._chartData = rects;
  if (!ctx.canvas._hasHover) {
    ctx.canvas._hasHover = true;
    ctx.canvas.addEventListener('mousemove', function(e) {
      var rect = ctx.canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var hovered = null;
      if (ctx.canvas._chartData) {
        for (var i=0; i<ctx.canvas._chartData.length; i++) {
          var pt = ctx.canvas._chartData[i];
          if (mx >= pt.x - pt.w/2 && mx <= pt.x + pt.w/2 && my >= pt.y - pt.h/2 && my <= pt.y + pt.h/2) {
            hovered = pt;
            break;
          }
        }
      }
      var tt = document.getElementById('chart-tooltip');
      if (!tt) {
        tt = document.createElement('div');
        tt.id = 'chart-tooltip';
        tt.style.position = 'absolute';
        tt.style.background = 'rgba(0,0,0,0.85)';
        tt.style.color = '#fff';
        tt.style.padding = '6px 10px';
        tt.style.borderRadius = '4px';
        tt.style.fontSize = '12px';
        tt.style.pointerEvents = 'none';
        tt.style.zIndex = '1000';
        tt.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        tt.style.border = '1px solid rgba(255,255,255,0.1)';
        document.body.appendChild(tt);
      }
      if (hovered) {
        tt.style.display = 'block';
        tt.innerHTML = hovered.label + '<br/><span style="color:var(--gold);font-weight:bold;font-size:14px">' + formatNumber(hovered.value) + ' items</span>';
        tt.style.left = (e.pageX + 15) + 'px';
        tt.style.top = (e.pageY + 15) + 'px';
        ctx.canvas.style.cursor = 'pointer';
      } else {
        tt.style.display = 'none';
        ctx.canvas.style.cursor = 'default';
      }
    });
    ctx.canvas.addEventListener('mouseleave', function() {
      var tt = document.getElementById('chart-tooltip');
      if (tt) tt.style.display = 'none';
    });
  }
}

function drawCurvedLineChart(ctx, w, h, labels, values) {
  ctx.clearRect(0, 0, w, h);
  if (!values.length) return;
  var max = Math.max.apply(null, values.concat([1])) * 1.15;
  var pad = { top:20, right:16, bottom:36, left:58 };
  var chartW = w - pad.left - pad.right;
  var chartH = h - pad.top - pad.bottom;
  var gap = chartW / (labels.length - 1 || 1);
  
  ctx.strokeStyle = 'rgba(201,151,28,0.1)'; ctx.lineWidth = 1;
  for (var i = 0; i <= 4; i++) {
    var y = pad.top + chartH - (i/4)*chartH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w-pad.right, y); ctx.stroke();
    ctx.fillStyle = 'rgba(107,101,96,0.65)';
    ctx.font = '10px Jost,sans-serif'; ctx.textAlign = 'right';
    var val = (i/4)*max;
    ctx.fillText(val >= 1000 ? '₱'+(val/1000).toFixed(1)+'k' : '₱'+val.toFixed(0), pad.left-5, y+4);
  }
  
  var pts = [];
  labels.forEach(function(label, i) {
    var x = pad.left + (labels.length === 1 ? chartW/2 : i*gap);
    var y = pad.top + chartH - ((values[i]/max)*chartH);
    pts.push({x:x, y:y});
  });
  
  if(pts.length > 0) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 0; i < pts.length - 1; i++) {
      var xc = (pts[i].x + pts[i + 1].x) / 2;
      ctx.bezierCurveTo(xc, pts[i].y, xc, pts[i+1].y, pts[i+1].x, pts[i+1].y);
    }
    ctx.lineTo(pts[pts.length-1].x, pad.top + chartH);
    ctx.lineTo(pts[0].x, pad.top + chartH);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0,pad.top,0,pad.top+chartH);
    grad.addColorStop(0, 'rgba(201,151,28,0.4)');
    grad.addColorStop(1, 'rgba(201,151,28,0.0)');
    ctx.fillStyle = grad;
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 0; i < pts.length - 1; i++) {
      var xc = (pts[i].x + pts[i + 1].x) / 2;
      ctx.bezierCurveTo(xc, pts[i].y, xc, pts[i+1].y, pts[i+1].x, pts[i+1].y);
    }
    ctx.strokeStyle = '#c9971c';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    pts.forEach(function(p, i) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#c9971c';
      ctx.stroke();
    });
  }

  ctx.fillStyle = 'rgba(107,101,96,0.8)';
  ctx.textAlign = 'center';
  labels.forEach(function(label, i) {
    var x = pad.left + (labels.length === 1 ? chartW/2 : i*gap);
    ctx.fillText(label, x, h - pad.bottom/2 + 6);
  });
  
  // Attach hover logic
  ctx.canvas._chartData = pts.map(function(p, i) { return { x: p.x, y: p.y, label: labels[i], value: values[i] }; });
  if (!ctx.canvas._hasHover) {
    ctx.canvas._hasHover = true;
    ctx.canvas.addEventListener('mousemove', function(e) {
      var rect = ctx.canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var hovered = null;
      if (ctx.canvas._chartData) {
        for (var i=0; i<ctx.canvas._chartData.length; i++) {
          var pt = ctx.canvas._chartData[i];
          if (Math.abs(mx - pt.x) < 20 && Math.abs(my - pt.y) < 20) {
            hovered = pt;
            break;
          }
        }
      }
      var tt = document.getElementById('chart-tooltip');
      if (!tt) {
        tt = document.createElement('div');
        tt.id = 'chart-tooltip';
        tt.style.position = 'absolute';
        tt.style.background = 'rgba(0,0,0,0.85)';
        tt.style.color = '#fff';
        tt.style.padding = '6px 10px';
        tt.style.borderRadius = '4px';
        tt.style.fontSize = '12px';
        tt.style.pointerEvents = 'none';
        tt.style.zIndex = '1000';
        tt.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        tt.style.border = '1px solid rgba(255,255,255,0.1)';
        document.body.appendChild(tt);
      }
      if (hovered) {
        tt.style.display = 'block';
        tt.innerHTML = hovered.label + '<br/><span style="color:var(--gold);font-weight:bold;font-size:14px">₱' + formatNumber(hovered.value) + '</span>';
        tt.style.left = (e.pageX + 15) + 'px';
        tt.style.top = (e.pageY + 15) + 'px';
        ctx.canvas.style.cursor = 'pointer';
      } else {
        tt.style.display = 'none';
        ctx.canvas.style.cursor = 'default';
      }
    });
    ctx.canvas.addEventListener('mouseleave', function() {
      var tt = document.getElementById('chart-tooltip');
      if (tt) tt.style.display = 'none';
    });
  }
}

// ============================================================
// INVENTORY
// ============================================================
var allProducts = [];
var editingProductId = null;

async function loadInventory() {
  document.getElementById('inventory-tbody').innerHTML = loadingRow(8);
  var res = await dbQuery(function(db) { return db.from('products').select('*').eq('is_active', true).order('name'); });
  if (res.error && !_isConnected) { renderDemoInventory(); return; }
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
    return '<tr><td><div style="font-weight:600;font-size:0.83rem">' + p.name + '</div></td>'
      + '<td><span class="badge badge-gold">' + p.category + '</span></td>'
      + '<td><div class="stock-bar"><div class="stock-bar-track"><div class="stock-bar-fill ' + barC + '" style="width:' + pct + '%"></div></div><span class="stock-count">' + p.quantity + ' ' + (p.unit||'pcs') + '</span></div></td>'
      + '<td class="td-muted">' + p.min_stock + '</td>'
      + '<td>₱' + formatNumber(p.cost_price) + '</td>'
      + '<td>' + (p.selling_price > 0 ? '₱' + formatNumber(p.selling_price) : '<span class="td-muted">—</span>') + '</td>'
      + '<td><span class="badge ' + bdg + '">' + lbl + '</span></td>'
      + '<td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-outline btn-sm" onclick="openStockModal(\'' + p.id + '\',\'' + esc(p.name) + '\',\'in\')" style="color:var(--green);border-color:rgba(76,175,80,0.3)">+ In</button><button class="btn btn-outline btn-sm" onclick="openStockModal(\'' + p.id + '\',\'' + esc(p.name) + '\',\'out\')" style="color:var(--red);border-color:rgba(211,47,47,0.3)">- Out</button><button class="btn btn-outline btn-sm" onclick="editProduct(\'' + p.id + '\')">Edit</button><button class="btn btn-danger btn-sm" onclick="deleteProduct(\'' + p.id + '\')">Delete</button></div></td></tr>';
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
  populateSupplierDropdown('');
  openModal('product-modal');
}

function editProduct(id) {
  var p = allProducts.find(function(x) { return x.id === id; });
  if (!p) return;
  editingProductId = id;
  setText('product-modal-title', 'Edit Product');
  setVal('pf-name', p.name); setVal('pf-category', p.category); 
  setVal('pf-unit', p.unit||'pcs'); setVal('pf-quantity', p.quantity); setVal('pf-min-stock', p.min_stock);
  setVal('pf-cost', p.cost_price); setVal('pf-price', p.selling_price); setVal('pf-description', p.description||'');
  populateSupplierDropdown(p.supplier || '');
  openModal('product-modal');
}

function populateSupplierDropdown(selectedSupplier) {
  var sel = document.getElementById('pf-supplier');
  if(!sel) return;
  sel.innerHTML = '<option value="">None / Unassigned</option>' + 
    allSuppliers.map(function(s) { 
      return '<option value="' + esc(s.name) + '"' + (s.name===selectedSupplier ? ' selected' : '') + '>' + s.name + '</option>'; 
    }).join('');
}

async function saveProduct() {
  var data = { name:getVal('pf-name').trim(), category:getVal('pf-category'), unit:getVal('pf-unit'), quantity:parseInt(getVal('pf-quantity'))||0, min_stock:parseInt(getVal('pf-min-stock'))||5, cost_price:parseFloat(getVal('pf-cost'))||0, selling_price:parseFloat(getVal('pf-price'))||0, supplier:getVal('pf-supplier')||null, description:getVal('pf-description').trim()||null, updated_at:new Date().toISOString() };
  if (!data.name || !data.category) { showToast('Name and category are required', 'error'); return; }
  if (!_isConnected) {
    if (editingProductId) { var i=allProducts.findIndex(function(p){return p.id===editingProductId;}); if(i>-1) allProducts[i]={...allProducts[i],...data}; }
    else allProducts.unshift({id:'d'+Date.now(),...data,is_active:true,created_at:new Date().toISOString()});
    renderInventoryTable(allProducts); closeModal('product-modal'); showToast(editingProductId?'Product updated':'Product added','success'); return;
  }
  var res = editingProductId
    ? await dbQuery(function(db){return db.from('products').update(data).eq('id',editingProductId).select().single();})
    : await dbQuery(function(db){return db.from('products').insert({...data,is_active:true}).select().single();});
  if (res.error) { showToast('Error: '+res.error.message,'error'); return; }
  closeModal('product-modal'); showToast(editingProductId?'Updated ✓':'Added ✓','success'); loadInventory();
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  if (!_isConnected) { allProducts=allProducts.filter(function(p){return p.id!==id;}); renderInventoryTable(allProducts); showToast('Deleted','success'); return; }
  var res = await dbQuery(function(db){return db.from('products').update({is_active:false}).eq('id',id);});
  if (res.error) { showToast('Error: '+res.error.message,'error'); return; }
  showToast('Deleted','success'); loadInventory();
}

// ---- STOCK ADJUSTMENT ----
var adjustingProductId = null;
function openStockModal(productId, productName, defaultType) {
  adjustingProductId = productId;
  setText('stock-product-name', productName);
  setVal('stock-qty', 1); setVal('stock-type', defaultType || 'out'); setVal('stock-notes', '');
  updateStockPreview();
  openModal('stock-modal');
}

function updateStockPreview() {
  var product = allProducts.find(function(p){return p.id===adjustingProductId;});
  if(!product) return;
  var type = getVal('stock-type'), qty = parseInt(getVal('stock-qty'))||0;
  var isOut = type === 'out';
  var newQty = product.quantity + (isOut ? -qty : qty);
  var html = 'Current Stock: <strong>' + product.quantity + '</strong>';
  if (qty > 0) {
    html += ' &nbsp;→&nbsp; <span style="color:' + (newQty < product.min_stock ? 'var(--red)' : 'var(--green)') + '">New Stock: <strong>' + newQty + '</strong></span>';
  }
  var el = document.getElementById('stock-current-info');
  if(el) el.innerHTML = html;
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
// REPORTS
// ============================================================
async function loadReports() {
  if (!_isConnected) { renderDemoReports(); return; }
  var startOfMonth=new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
  
  var [pRes,txnRes,allProdRes]=await Promise.all([
    dbQuery(function(db){return db.from('products').select('id',{count:'exact',head:true}).eq('is_active',true);}),
    dbQuery(function(db){return db.from('stock_transactions').select('*, products(name, cost_price, selling_price, supplier)');}),
    dbQuery(function(db){return db.from('products').select('*').eq('is_active',true);})
  ]);
  var txns=txnRes.data||[], products=allProdRes.data||[];
  
  setText('rpt-products',pRes.count||0);
  setText('rpt-out', products.filter(function(p){return p.quantity <= 0;}).length);
  setText('rpt-low', products.filter(function(p){return p.quantity > 0 && p.quantity < p.min_stock;}).length);
  setText('rpt-well', products.filter(function(p){return p.quantity >= p.min_stock;}).length);
  
  renderStockChart(txns); 
  
  var outs = txns.filter(function(t){return t.type==='out';});
  var totalOutQty = outs.reduce(function(s,t){return s+(t.quantity||0);},0);
  
  // Forecast: Expected stock usage next month based on average
  var projectedUsage = Math.round((totalOutQty / (outs.length || 1)) * 30);
  setText('rpt-forecast', projectedUsage + ' items');
  setText('rpt-forecast-trend', 'Projected stock out next month');
  
  // Turnover Velocity
  var avgInvCost = products.reduce(function(s,p){return s+((p.quantity||0)*(p.cost_price||0));},0);
  var cogs = outs.reduce(function(s,t){ var p=t.products; return s+((t.quantity||0)*(p?p.cost_price||0:0)); },0);
  var velocity = avgInvCost > 0 ? (cogs / avgInvCost).toFixed(2) : '0.00';
  setText('rpt-turnover', velocity + 'x');
  
  var totalRev = outs.reduce(function(s,t){ var p=t.products; return s+((t.quantity||0)*(p?p.selling_price||0:0)); },0);
  setText('rpt-revenue-total', formatNumber(totalRev));
  
  renderTopInventory(products);
  
  var supplierRevenue = {};
  outs.forEach(function(t) {
    var supp = t.products && t.products.supplier ? t.products.supplier : 'Unknown/Unassigned';
    var rev = (t.quantity || 0) * (t.products && t.products.selling_price ? t.products.selling_price : 0);
    supplierRevenue[supp] = (supplierRevenue[supp] || 0) + rev;
  });
  var topSuppliers = Object.keys(supplierRevenue).map(function(s) {
    return { name: s, revenue: supplierRevenue[s] };
  }).filter(function(s) { return s.revenue > 0; }).sort(function(a, b) { return b.revenue - a.revenue; }).slice(0, 3);
  
  var suppEl = document.getElementById('top-suppliers-list');
  if(suppEl) {
    suppEl.innerHTML = topSuppliers.length ? topSuppliers.map(function(s, i) {
      return '<div class="report-metric"><span class="report-metric-label"><span style="color:var(--gold);margin-right:8px">#'+(i+1)+'</span>'+s.name+'</span><span class="badge badge-green">₱'+formatNumber(s.revenue)+'</span></div>';
    }).join('') : '<div class="td-muted" style="padding:20px;text-align:center">No supplier sales data</div>';
  }
}

function renderTopInventory(products) {
  var sorted = [...products].sort(function(a,b){return ((b.quantity||0)*(b.cost_price||0)) - ((a.quantity||0)*(a.cost_price||0));}).slice(0,5);
  var el = document.getElementById('top-inventory-list');
  if(!el) return;
  el.innerHTML = sorted.length ? sorted.map(function(p){return '<div class="report-metric"><span class="report-metric-label">'+p.name+'</span><span class="badge badge-gold">₱'+formatNumber((p.quantity||0)*(p.cost_price||0))+'</span></div>';}).join('') : '<div class="td-muted" style="padding:20px;text-align:center">No inventory value</div>';
}

function renderDemoReports() {
  setText('rpt-products',47);
  setText('rpt-well', 35); setText('rpt-low', 9); setText('rpt-out', 3);
  setText('rpt-revenue-total', '124,500');
  setText('rpt-forecast', '125 items'); setText('rpt-forecast-trend', 'Projected stock out next month');
  setText('rpt-turnover', '2.8x');
  var dCanvas = document.getElementById('rpt-daily-revenue-chart');
  var wCanvas = document.getElementById('rpt-weekly-revenue-chart');
  if (dCanvas) {
    dCanvas.width = dCanvas.offsetWidth || 300;
    drawBarChart(dCanvas.getContext('2d'), dCanvas.width, 200, ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], [5, 12, 19, 8, 25, 14, 22]);
  }
  if (wCanvas) {
    wCanvas.width = wCanvas.offsetWidth || 300;
    drawBarChart(wCanvas.getContext('2d'), wCanvas.width, 200, ['Week 1', 'Week 2', 'Week 3', 'Week 4'], [45, 60, 30, 85]);
  }
  
  var dCurve = document.getElementById('rpt-daily-revenue-curve-chart');
  var wCurve = document.getElementById('rpt-weekly-revenue-curve-chart');
  if (dCurve) {
    dCurve.width = dCurve.offsetWidth || 300;
    drawCurvedLineChart(dCurve.getContext('2d'), dCurve.width, 200, ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], [800, 1500, 2800, 1200, 3500, 2100, 4200]);
  }
  if (wCurve) {
    wCurve.width = wCurve.offsetWidth || 300;
    drawCurvedLineChart(wCurve.getContext('2d'), wCurve.width, 200, ['Week 1', 'Week 2', 'Week 3', 'Week 4'], [10500, 14200, 8900, 18500]);
  }
  
  var el = document.getElementById('top-inventory-list');
  if(el) el.innerHTML = '<div class="report-metric"><span class="report-metric-label">Premium Facial Cleanser</span><span class="badge badge-gold">₱15,000</span></div><div class="report-metric"><span class="report-metric-label">Massage Oil Gallon</span><span class="badge badge-gold">₱12,500</span></div><div class="report-metric"><span class="report-metric-label">Cotton Pads Bulk</span><span class="badge badge-teal">₱8,000</span></div>';
  
  var suppEl = document.getElementById('top-suppliers-list');
  if(suppEl) suppEl.innerHTML = '<div class="report-metric"><span class="report-metric-label"><span style="color:var(--gold);margin-right:8px">#1</span>Beauty Supplies Co.</span><span class="badge badge-green">₱65,200</span></div><div class="report-metric"><span class="report-metric-label"><span style="color:var(--gold);margin-right:8px">#2</span>Glow Essentials</span><span class="badge badge-green">₱42,000</span></div><div class="report-metric"><span class="report-metric-label"><span style="color:var(--gold);margin-right:8px">#3</span>Nail World PH</span><span class="badge badge-green">₱17,300</span></div>';
}

function renderStockChart(txns) {
  var dCanvas=document.getElementById('rpt-daily-revenue-chart');
  var wCanvas=document.getElementById('rpt-weekly-revenue-chart');
  var dCurve=document.getElementById('rpt-daily-revenue-curve-chart');
  var wCurve=document.getElementById('rpt-weekly-revenue-curve-chart');
  
  if(!dCanvas || !wCanvas || !dCurve || !wCurve) return;
  
  dCanvas.width=dCanvas.offsetWidth||300;
  wCanvas.width=wCanvas.offsetWidth||300;
  dCurve.width=dCurve.offsetWidth||300;
  wCurve.width=wCurve.offsetWidth||300;
  
  var dCtx = dCanvas.getContext('2d');
  var wCtx = wCanvas.getContext('2d');
  var dcCtx = dCurve.getContext('2d');
  var wcCtx = wCurve.getContext('2d');
  
  if(!txns.length) { 
    if(!_isConnected) { renderDemoReports(); return; }
    drawBarChart(dCtx, dCanvas.width, 200, ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], [0,0,0,0,0,0,0]);
    drawBarChart(wCtx, wCanvas.width, 200, ['Week 1','Week 2','Week 3','Week 4'], [0,0,0,0]);
    drawCurvedLineChart(dcCtx, dCurve.width, 200, ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], [0,0,0,0,0,0,0]);
    drawCurvedLineChart(wcCtx, wCurve.width, 200, ['Week 1','Week 2','Week 3','Week 4'], [0,0,0,0]);
    return;
  }

  var outs = txns.filter(function(t){return t.type==='out';});
  
  // Daily Logic
  var fixedDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var dGroups = { 'Sun':0, 'Mon':0, 'Tue':0, 'Wed':0, 'Thu':0, 'Fri':0, 'Sat':0 };
  var dRevGroups = { 'Sun':0, 'Mon':0, 'Tue':0, 'Wed':0, 'Thu':0, 'Fri':0, 'Sat':0 };
  var now = new Date();
  var sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  
  outs.forEach(function(t){
    var dt = new Date(t.created_at);
    if (dt >= sevenDaysAgo) {
      var dayStr = dt.toLocaleDateString('en-US', {weekday: 'short'});
      if (dGroups[dayStr] !== undefined) {
        dGroups[dayStr] += (t.quantity || 0);
        dRevGroups[dayStr] += ((t.quantity || 0) * (t.products?t.products.selling_price||0:0));
      }
    }
  });

  drawBarChart(dCtx, dCanvas.width, 200, fixedDays, fixedDays.map(function(d){return dGroups[d];}));
  drawCurvedLineChart(dcCtx, dCurve.width, 200, fixedDays, fixedDays.map(function(d){return dRevGroups[d];}));

  // Weekly Logic
  var fixedWeeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
  var wGroups = { 'Week 1':0, 'Week 2':0, 'Week 3':0, 'Week 4':0 };
  var wRevGroups = { 'Week 1':0, 'Week 2':0, 'Week 3':0, 'Week 4':0 };
  var currentMonth = now.getMonth();
  var currentYear = now.getFullYear();

  outs.forEach(function(t){
    var dt = new Date(t.created_at);
    if (dt.getMonth() === currentMonth && dt.getFullYear() === currentYear) {
      var weekNum = Math.ceil(dt.getDate() / 7);
      if (weekNum > 4) weekNum = 4;
      var wStr = "Week " + weekNum;
      wGroups[wStr] = (wGroups[wStr] || 0) + (t.quantity || 0);
      wRevGroups[wStr] = (wRevGroups[wStr] || 0) + ((t.quantity || 0) * (t.products?t.products.selling_price||0:0));
    }
  });

  drawBarChart(wCtx, wCanvas.width, 200, fixedWeeks, fixedWeeks.map(function(w){return wGroups[w];}));
  drawCurvedLineChart(wcCtx, wCurve.width, 200, fixedWeeks, fixedWeeks.map(function(w){return wRevGroups[w];}));
}

async function clearRevenue() {
  if (!confirm("⚠️ WARNING: Are you sure you want to clear all revenue data?\nThis will permanently delete all stock movement history and reset your charts to zero. This cannot be undone.")) return;
  if (!_isConnected) {
    showToast("Cannot clear revenue in demo mode.", "error");
    return;
  }
  var res = await dbQuery(function(db) { return db.from('stock_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000'); });
  if (res.error) { showToast("Error: " + res.error.message, "error"); return; }
  showToast("Revenue and stock history cleared.", "success");
  loadReports();
  loadDashboardChart();
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
async function saveSupplier(){var data={name:getVal('supf-name').trim(),contact_person:getVal('supf-contact').trim()||null,phone:getVal('supf-phone').trim()||null,email:getVal('supf-email').trim()||null,address:getVal('supf-address').trim()||null};if(!data.name){showToast('Name required','error');return;}if(!_isConnected){if(editingSuppId){var i=allSuppliers.findIndex(function(s){return s.id===editingSuppId;});if(i>-1)allSuppliers[i]={...allSuppliers[i],...data};}else allSuppliers.push({id:'sup'+Date.now(),...data,is_active:true});renderSuppliersTable(allSuppliers);closeModal('supplier-modal');showToast('Saved','success');return;}var res=editingSuppId?await dbQuery(function(db){return db.from('suppliers').update(data).eq('id',editingSuppId);}):await dbQuery(function(db){return db.from('suppliers').insert({...data,is_active:true});});if(res.error){showToast('Error: '+res.error.message,'error');return;}closeModal('supplier-modal');showToast('Saved ✓','success');loadSuppliers();}



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
// AUTH & REALTIME
// ============================================================
function checkAuth() {
  // Simple client-side mock auth check or use Supabase auth
  var loggedIn = sessionStorage.getItem('mp_auth') === 'true';
  var role = sessionStorage.getItem('mp_user_role') || 'admin';
  
  if (loggedIn) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-wrapper').style.display = 'block';
    
    // RBAC
    var repNav = document.querySelector('[data-page="reports"]');
    var supNav = document.querySelector('[data-page="suppliers"]');
    if (role === 'staff') {
      if (repNav) repNav.style.display = 'none';
      if (supNav) supNav.style.display = 'none';
    } else {
      if (repNav) repNav.style.display = 'flex';
      if (supNav) supNav.style.display = 'flex';
    }
    
    var nameEl = document.querySelector('.user-name');
    var roleEl = document.querySelector('.user-role');
    var avatarEl = document.querySelector('.user-avatar');
    if (nameEl && roleEl && avatarEl) {
      if (role === 'admin') { nameEl.textContent = "Meera's Admin"; roleEl.textContent = "Owner"; avatarEl.textContent = "A"; }
      else if (role === 'manager') { nameEl.textContent = "Store Manager"; roleEl.textContent = "Manager"; avatarEl.textContent = "M"; }
      else { nameEl.textContent = "Staff Member"; roleEl.textContent = "Staff"; avatarEl.textContent = "S"; }
    }

    setupRealtime();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-wrapper').style.display = 'none';
  }
}
function handleLogin() {
  var email = getVal('login-email');
  var pass = getVal('login-pass');
  
  var users = {
    'admin@meeras.com': { pass: 'admin041908', role: 'admin' },
    'manager@meeras.com': { pass: 'manager041908', role: 'manager' },
    'staff@meeras.com': { pass: 'staff041908', role: 'staff' }
  };

  if (!email || !pass) {
    showToast('Please enter credentials', 'error');
    return;
  }
  
  var user = users[email];
  if (user && user.pass === pass) {
    sessionStorage.setItem('mp_auth', 'true');
    sessionStorage.setItem('mp_user_email', email);
    sessionStorage.setItem('mp_user_role', user.role);
    
    setVal('login-email', '');
    setVal('login-pass', '');
    
    checkAuth();
    
    // If staff logged in and somehow on a blocked page, redirect to dashboard
    var currentPage = document.querySelector('.page-content:not(.hidden)');
    if (user.role === 'staff' && currentPage && (currentPage.id === 'page-reports' || currentPage.id === 'page-suppliers')) {
      navigateTo('dashboard');
    }
    
    showToast('Logged in successfully', 'success');
  } else {
    showToast('Invalid email or password', 'error');
  }
}
function handleLogout() {
  sessionStorage.removeItem('mp_auth');
  checkAuth();
  showToast('Logged out', 'info');
}

function setupRealtime() {
  if (!_isConnected || !_db) return;
  try {
    _db.channel('public-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, payload => {
        console.log('Realtime product update:', payload);
        showToast('Real-time: Inventory updated by another user', 'info', 2000);
        if (!document.getElementById('page-inventory').classList.contains('hidden')) loadInventory();
        loadDashboard();
      })
      
      .subscribe();
  } catch(e) { console.error('Realtime setup error:', e); }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  var hardcodedUrl = 'https://uacomiyljswtsjzznlxp.supabase.co';
  var hardcodedKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhY29taXlsanN3dHNqenpubHhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTA0NjQsImV4cCI6MjA4ODk4NjQ2NH0.ylcfPFEncznnbtqmNWxO_PJGcvsN2APNuimyXS6jy5s';
  
  localStorage.setItem('mp_supabase_url', hardcodedUrl);
  localStorage.setItem('mp_supabase_key', hardcodedKey);
  
  initSupabase(hardcodedUrl, hardcodedKey);
  
  document.querySelectorAll('.nav-item[data-page]').forEach(function(item){
    item.addEventListener('click', function(){ navigateTo(item.dataset.page); });
  });
  checkAuth();
  navigateTo('dashboard');
  
});

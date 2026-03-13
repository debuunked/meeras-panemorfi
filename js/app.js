// ============================================================
// MEERAS PANEMORFI - INVENTORY MANAGEMENT SYSTEM
// Main Application Logic
// ============================================================

// ---- SUPABASE CLIENT INIT ----
let supabase = null;
let appConfig = {};

function initSupabase(url, key) {
  if (!url || !key || url === 'YOUR_SUPABASE_URL') return null;
  try {
    supabase = window.supabase.createClient(url, key);
    return supabase;
  } catch (e) {
    console.error('Supabase init error:', e);
    return null;
  }
}

// ---- TOAST NOTIFICATIONS ----
function showToast(msg, type = 'info', duration = 3500) {
  const icons = { success: '✓', error: '✕', warning: '⚠', info: '◆' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ---- NAVIGATION ----
function navigateTo(page) {
  document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  const targetPage = document.getElementById(`page-${page}`);
  if (targetPage) targetPage.classList.remove('hidden');
  
  const navItem = document.querySelector(`[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');

  const titles = {
    dashboard: ['Dashboard', 'Welcome back, Owner'],
    inventory: ['Inventory', 'Manage products & supplies'],
    services: ['Services', 'Beauty & wellness services'],
    appointments: ['Appointments', 'Schedule & bookings'],
    sales: ['Sales & POS', 'Point of sale & transactions'],
    reports: ['Reports & Analytics', 'Data insights & performance'],
    suppliers: ['Suppliers', 'Vendor management'],
    staff: ['Staff', 'Team members'],
    settings: ['Settings', 'System configuration']
  };
  
  const [title, sub] = titles[page] || ['', ''];
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-sub').textContent = sub;

  // Load data for the page
  if (page === 'dashboard') loadDashboard();
  else if (page === 'inventory') loadInventory();
  else if (page === 'services') loadServices();
  else if (page === 'appointments') loadAppointments();
  else if (page === 'sales') loadSales();
  else if (page === 'reports') loadReports();
  else if (page === 'suppliers') loadSuppliers();
  else if (page === 'staff') loadStaff();
}

// ---- DASHBOARD ----
async function loadDashboard() {
  if (!supabase) { renderDemoDashboard(); return; }
  
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const [{ count: totalProducts }, { count: lowStock }, { data: todaySales }, { count: todayAppts }] = await Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('products').select('*', { count: 'exact', head: true }).lt('quantity', 5).eq('is_active', true),
      supabase.from('sales').select('total').gte('created_at', today),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('appointment_date', today)
    ]);
    
    const todayRevenue = (todaySales || []).reduce((s, r) => s + (r.total || 0), 0);
    updateDashboardStats(totalProducts || 0, lowStock || 0, todayRevenue, todayAppts || 0);
    loadRecentActivity();
    loadLowStockAlerts();
  } catch(e) {
    console.error(e);
    renderDemoDashboard();
  }
}

function renderDemoDashboard() {
  updateDashboardStats(47, 3, 8500, 6);
  renderDemoActivity();
  renderDemoLowStock();
}

function updateDashboardStats(products, lowStock, revenue, appts) {
  document.getElementById('stat-products').textContent = products;
  document.getElementById('stat-low-stock').textContent = lowStock;
  document.getElementById('stat-revenue').textContent = formatCurrency(revenue);
  document.getElementById('stat-appts').textContent = appts;
  if (lowStock > 0) {
    const badge = document.getElementById('low-stock-badge');
    if (badge) { badge.textContent = lowStock; badge.style.display = 'inline-block'; }
  }
}

async function loadRecentActivity() {
  if (!supabase) { renderDemoActivity(); return; }
  try {
    const { data } = await supabase.from('stock_transactions')
      .select('*, products(name)').order('created_at', { ascending: false }).limit(6);
    renderActivity(data || []);
  } catch(e) { renderDemoActivity(); }
}

function renderActivity(items) {
  const list = document.getElementById('activity-list');
  if (!items.length) { list.innerHTML = '<p class="td-muted" style="text-align:center;padding:20px">No recent activity</p>'; return; }
  list.innerHTML = items.map(item => `
    <div class="activity-item">
      <div class="activity-dot" style="background:${item.type==='in'?'var(--green)':item.type==='out'?'var(--red)':'var(--orange)'}"></div>
      <div class="activity-text">
        <span>${item.products?.name || 'Product'}</span> — 
        ${item.type === 'in' ? 'Stock added' : item.type === 'out' ? 'Stock removed' : 'Adjusted'}: 
        ${Math.abs(item.quantity)} units ${item.notes ? `<em class="td-muted">(${item.notes})</em>` : ''}
      </div>
      <div class="activity-time">${timeAgo(item.created_at)}</div>
    </div>
  `).join('');
}

function renderDemoActivity() {
  const demos = [
    { color: 'var(--green)', text: '<span>Facial Serum</span> — Stock added: 10 units', time: '2m ago' },
    { color: 'var(--red)', text: '<span>Wax Strips</span> — Used for service: 5 units', time: '1h ago' },
    { color: 'var(--orange)', text: '<span>Nail Polish Set</span> — Inventory adjusted: -2 units', time: '3h ago' },
    { color: 'var(--green)', text: '<span>Facial Cleanser</span> — Stock added: 24 units', time: '5h ago' },
    { color: 'var(--red)', text: '<span>Eyebrow Tint</span> — Used for service: 1 unit', time: 'Yesterday' },
  ];
  document.getElementById('activity-list').innerHTML = demos.map(d => `
    <div class="activity-item">
      <div class="activity-dot" style="background:${d.color}"></div>
      <div class="activity-text">${d.text}</div>
      <div class="activity-time">${d.time}</div>
    </div>
  `).join('');
}

async function loadLowStockAlerts() {
  if (!supabase) { renderDemoLowStock(); return; }
  try {
    const { data } = await supabase.from('products')
      .select('name, quantity, min_stock').lt('quantity', 5).eq('is_active', true).limit(5);
    renderLowStock(data || []);
  } catch(e) { renderDemoLowStock(); }
}

function renderLowStock(items) {
  const list = document.getElementById('low-stock-list');
  if (!items.length) {
    list.innerHTML = '<div class="empty-state" style="padding:20px"><p>All products are well-stocked ✓</p></div>';
    return;
  }
  list.innerHTML = items.map(i => `
    <div class="low-stock-item">
      <span class="low-stock-name">${i.name}</span>
      <span class="low-stock-count">${i.quantity} left</span>
    </div>
  `).join('');
}

function renderDemoLowStock() {
  const demos = [
    { name: 'Wax Strips (Roll)', quantity: 2 },
    { name: 'Exfoliating Scrub', quantity: 1 },
    { name: 'Threading Thread', quantity: 4 },
  ];
  renderLowStock(demos);
}

// ---- INVENTORY ----
let allProducts = [];
let editingProductId = null;

async function loadInventory() {
  const tbody = document.getElementById('inventory-tbody');
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px"><div class="loading-spinner"></div></td></tr>`;
  
  if (!supabase) { renderDemoInventory(); return; }
  
  try {
    const { data, error } = await supabase.from('products')
      .select('*').order('name');
    if (error) throw error;
    allProducts = data || [];
    renderInventoryTable(allProducts);
  } catch(e) {
    console.error(e);
    renderDemoInventory();
  }
}

function renderDemoInventory() {
  allProducts = [
    { id: 'demo-1', name: 'Facial Cleanser', category: 'Skincare', sku: 'SK001', quantity: 18, min_stock: 5, unit: 'bottle', cost_price: 250, selling_price: 450, supplier: 'Beauty Supplies Co.', is_active: true },
    { id: 'demo-2', name: 'Wax Strips (Roll)', category: 'Waxing', sku: 'WX001', quantity: 2, min_stock: 10, unit: 'roll', cost_price: 180, selling_price: 0, supplier: 'Hair Removal PH', is_active: true },
    { id: 'demo-3', name: 'Threading Thread', category: 'Threading', sku: 'TH001', quantity: 4, min_stock: 15, unit: 'spool', cost_price: 45, selling_price: 0, supplier: 'Beauty Supplies Co.', is_active: true },
    { id: 'demo-4', name: 'Exfoliating Scrub', category: 'Skincare', sku: 'SK002', quantity: 1, min_stock: 5, unit: 'tube', cost_price: 320, selling_price: 550, supplier: 'Glow Essentials', is_active: true },
    { id: 'demo-5', name: 'Nail Polish Set (Gel)', category: 'Nails', sku: 'NL001', quantity: 12, min_stock: 5, unit: 'set', cost_price: 1200, selling_price: 2000, supplier: 'Nail World PH', is_active: true },
    { id: 'demo-6', name: 'Eyebrow Tint', category: 'Tinting', sku: 'TN001', quantity: 8, min_stock: 5, unit: 'tube', cost_price: 350, selling_price: 0, supplier: 'Beauty Supplies Co.', is_active: true },
    { id: 'demo-7', name: 'Disposable Spatulas', category: 'Waxing', sku: 'WX002', quantity: 200, min_stock: 50, unit: 'pcs', cost_price: 3, selling_price: 0, supplier: 'Hair Removal PH', is_active: true },
    { id: 'demo-8', name: 'Vitamin C Serum', category: 'Skincare', sku: 'SK003', quantity: 7, min_stock: 5, unit: 'bottle', cost_price: 420, selling_price: 750, supplier: 'Glow Essentials', is_active: true },
  ];
  renderInventoryTable(allProducts);
}

function renderInventoryTable(products) {
  const tbody = document.getElementById('inventory-tbody');
  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📦</div><h3>No products yet</h3><p>Add your first product to get started</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = products.map(p => {
    const stockPct = Math.min(100, (p.quantity / Math.max(p.min_stock * 3, 1)) * 100);
    const stockClass = p.quantity <= 0 ? 'critical' : p.quantity < p.min_stock ? 'low' : 'ok';
    const stockBadge = p.quantity <= 0 ? 'badge-red' : p.quantity < p.min_stock ? 'badge-orange' : 'badge-green';
    const stockLabel = p.quantity <= 0 ? 'Out' : p.quantity < p.min_stock ? 'Low' : 'OK';
    return `
      <tr>
        <td>
          <div style="font-weight:600;font-size:0.83rem">${p.name}</div>
          <div class="td-muted">${p.sku || '-'}</div>
        </td>
        <td><span class="badge badge-gold">${p.category}</span></td>
        <td>
          <div class="stock-bar">
            <div class="stock-bar-track"><div class="stock-bar-fill ${stockClass}" style="width:${stockPct}%"></div></div>
            <span class="stock-count">${p.quantity} ${p.unit}</span>
          </div>
        </td>
        <td class="td-muted">${p.min_stock}</td>
        <td>₱${formatNumber(p.cost_price)}</td>
        <td>${p.selling_price > 0 ? '₱' + formatNumber(p.selling_price) : '<span class="td-muted">—</span>'}</td>
        <td><span class="badge ${stockBadge}">${stockLabel}</span></td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-outline btn-sm btn-icon" onclick="openStockModal('${p.id}','${escHtml(p.name)}')" title="Adjust Stock">±</button>
            <button class="btn btn-outline btn-sm" onclick="editProduct('${p.id}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">Del</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterInventory() {
  const search = document.getElementById('inv-search').value.toLowerCase();
  const cat = document.getElementById('inv-cat-filter').value;
  const stock = document.getElementById('inv-stock-filter').value;
  
  const filtered = allProducts.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search) || (p.sku || '').toLowerCase().includes(search);
    const matchCat = !cat || p.category === cat;
    const matchStock = !stock || 
      (stock === 'ok' && p.quantity >= p.min_stock) ||
      (stock === 'low' && p.quantity > 0 && p.quantity < p.min_stock) ||
      (stock === 'out' && p.quantity <= 0);
    return matchSearch && matchCat && matchStock;
  });
  renderInventoryTable(filtered);
}

function openAddProductModal() {
  editingProductId = null;
  document.getElementById('product-modal-title').textContent = 'Add New Product';
  document.getElementById('product-form').reset();
  openModal('product-modal');
}

function editProduct(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  editingProductId = id;
  document.getElementById('product-modal-title').textContent = 'Edit Product';
  document.getElementById('pf-name').value = p.name;
  document.getElementById('pf-category').value = p.category;
  document.getElementById('pf-sku').value = p.sku || '';
  document.getElementById('pf-unit').value = p.unit || 'pcs';
  document.getElementById('pf-quantity').value = p.quantity;
  document.getElementById('pf-min-stock').value = p.min_stock;
  document.getElementById('pf-cost').value = p.cost_price;
  document.getElementById('pf-price').value = p.selling_price;
  document.getElementById('pf-supplier').value = p.supplier || '';
  document.getElementById('pf-description').value = p.description || '';
  openModal('product-modal');
}

async function saveProduct() {
  const data = {
    name: document.getElementById('pf-name').value.trim(),
    category: document.getElementById('pf-category').value,
    sku: document.getElementById('pf-sku').value.trim() || null,
    unit: document.getElementById('pf-unit').value,
    quantity: parseInt(document.getElementById('pf-quantity').value) || 0,
    min_stock: parseInt(document.getElementById('pf-min-stock').value) || 5,
    cost_price: parseFloat(document.getElementById('pf-cost').value) || 0,
    selling_price: parseFloat(document.getElementById('pf-price').value) || 0,
    supplier: document.getElementById('pf-supplier').value.trim() || null,
    description: document.getElementById('pf-description').value.trim() || null,
    updated_at: new Date().toISOString()
  };
  
  if (!data.name || !data.category) { showToast('Name and category are required', 'error'); return; }
  
  if (!supabase) {
    if (editingProductId) {
      const idx = allProducts.findIndex(p => p.id === editingProductId);
      if (idx > -1) allProducts[idx] = { ...allProducts[idx], ...data };
    } else {
      allProducts.push({ id: 'demo-' + Date.now(), ...data, is_active: true, created_at: new Date().toISOString() });
    }
    renderInventoryTable(allProducts);
    closeModal('product-modal');
    showToast(editingProductId ? 'Product updated' : 'Product added', 'success');
    return;
  }
  
  try {
    let result;
    if (editingProductId) {
      result = await supabase.from('products').update(data).eq('id', editingProductId).select().single();
    } else {
      result = await supabase.from('products').insert({ ...data, is_active: true }).select().single();
    }
    if (result.error) throw result.error;
    closeModal('product-modal');
    showToast(editingProductId ? 'Product updated successfully' : 'Product added successfully', 'success');
    loadInventory();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function deleteProduct(id) {
  if (!confirm('Are you sure you want to delete this product?')) return;
  
  if (!supabase) {
    allProducts = allProducts.filter(p => p.id !== id);
    renderInventoryTable(allProducts);
    showToast('Product deleted', 'success');
    return;
  }
  
  try {
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id);
    if (error) throw error;
    showToast('Product deleted', 'success');
    loadInventory();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ---- STOCK ADJUSTMENT ----
let adjustingProductId = null;

function openStockModal(productId, productName) {
  adjustingProductId = productId;
  document.getElementById('stock-product-name').textContent = productName;
  document.getElementById('stock-qty').value = 1;
  document.getElementById('stock-type').value = 'in';
  document.getElementById('stock-notes').value = '';
  openModal('stock-modal');
}

async function saveStockAdjustment() {
  const type = document.getElementById('stock-type').value;
  const qty = parseInt(document.getElementById('stock-qty').value) || 0;
  const notes = document.getElementById('stock-notes').value.trim();
  
  if (!qty || qty <= 0) { showToast('Enter a valid quantity', 'error'); return; }
  
  const product = allProducts.find(p => p.id === adjustingProductId);
  if (!product) return;
  
  const delta = type === 'in' ? qty : type === 'out' ? -qty : qty;
  const newQty = Math.max(0, product.quantity + delta);
  
  if (!supabase) {
    product.quantity = newQty;
    renderInventoryTable(allProducts);
    closeModal('stock-modal');
    showToast(`Stock ${type === 'in' ? 'added' : type === 'out' ? 'removed' : 'adjusted'}`, 'success');
    return;
  }
  
  try {
    await supabase.from('products').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', adjustingProductId);
    await supabase.from('stock_transactions').insert({ product_id: adjustingProductId, type, quantity: qty, notes });
    closeModal('stock-modal');
    showToast('Stock updated', 'success');
    loadInventory();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ---- SERVICES ----
let allServices = [];
let editingServiceId = null;

async function loadServices() {
  if (!supabase) { renderDemoServices(); return; }
  
  try {
    const { data, error } = await supabase.from('services').select('*').order('category').order('name');
    if (error) throw error;
    allServices = data || [];
    renderServicesTable(allServices);
  } catch(e) {
    renderDemoServices();
  }
}

function renderDemoServices() {
  allServices = [
    { id: 's1', name: 'Basic Facial', category: 'Facial', price: 400, duration_minutes: 60, is_active: true },
    { id: 's2', name: 'Diamond Peel', category: 'Facial', price: 500, duration_minutes: 60, is_active: true },
    { id: 's3', name: 'Korean Black Pearl', category: 'Facial', price: 1800, duration_minutes: 90, is_active: true },
    { id: 's4', name: 'Underarm Waxing', category: 'Waxing', price: 250, duration_minutes: 20, is_active: true },
    { id: 's5', name: 'Brazilian Waxing', category: 'Waxing', price: 800, duration_minutes: 45, is_active: true },
    { id: 's6', name: 'Eyebrow Threading', category: 'Threading', price: 150, duration_minutes: 15, is_active: true },
    { id: 's7', name: 'Meso Acne', category: 'Meso Treatments', price: 1500, duration_minutes: 60, is_active: true },
    { id: 's8', name: 'Exilis Tummy', category: 'Exilis Treatments', price: 2000, duration_minutes: 90, is_active: true },
  ];
  renderServicesTable(allServices);
}

function renderServicesTable(services) {
  const tbody = document.getElementById('services-tbody');
  if (!services.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">✨</div><h3>No services yet</h3></div></td></tr>`;
    return;
  }
  tbody.innerHTML = services.map(s => `
    <tr>
      <td><div style="font-weight:600;font-size:0.83rem">${s.name}</div></td>
      <td><span class="badge badge-teal">${s.category}</span></td>
      <td style="font-weight:600;color:var(--gold-dark)">₱${formatNumber(s.price)}</td>
      <td class="td-muted">${s.duration_minutes} min</td>
      <td><span class="badge ${s.is_active ? 'badge-green' : 'badge-gray'}">${s.is_active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-outline btn-sm" onclick="editService('${s.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="toggleService('${s.id}',${!s.is_active})">${s.is_active ? 'Deactivate' : 'Activate'}</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openAddServiceModal() {
  editingServiceId = null;
  document.getElementById('service-modal-title').textContent = 'Add New Service';
  document.getElementById('service-form').reset();
  openModal('service-modal');
}

function editService(id) {
  const s = allServices.find(x => x.id === id);
  if (!s) return;
  editingServiceId = id;
  document.getElementById('service-modal-title').textContent = 'Edit Service';
  document.getElementById('sf-name').value = s.name;
  document.getElementById('sf-category').value = s.category;
  document.getElementById('sf-price').value = s.price;
  document.getElementById('sf-duration').value = s.duration_minutes;
  document.getElementById('sf-description').value = s.description || '';
  openModal('service-modal');
}

async function saveService() {
  const data = {
    name: document.getElementById('sf-name').value.trim(),
    category: document.getElementById('sf-category').value.trim(),
    price: parseFloat(document.getElementById('sf-price').value) || 0,
    duration_minutes: parseInt(document.getElementById('sf-duration').value) || 60,
    description: document.getElementById('sf-description').value.trim() || null,
  };
  
  if (!data.name || !data.category || !data.price) { showToast('Fill in all required fields', 'error'); return; }
  
  if (!supabase) {
    if (editingServiceId) {
      const idx = allServices.findIndex(s => s.id === editingServiceId);
      if (idx > -1) allServices[idx] = { ...allServices[idx], ...data };
    } else {
      allServices.push({ id: 'demo-s-' + Date.now(), ...data, is_active: true });
    }
    renderServicesTable(allServices);
    closeModal('service-modal');
    showToast('Service saved', 'success');
    return;
  }
  
  try {
    if (editingServiceId) {
      const { error } = await supabase.from('services').update(data).eq('id', editingServiceId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('services').insert({ ...data, is_active: true });
      if (error) throw error;
    }
    closeModal('service-modal');
    showToast('Service saved successfully', 'success');
    loadServices();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function toggleService(id, active) {
  if (!supabase) {
    const s = allServices.find(x => x.id === id);
    if (s) s.is_active = active;
    renderServicesTable(allServices);
    return;
  }
  try {
    await supabase.from('services').update({ is_active: active }).eq('id', id);
    loadServices();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ---- APPOINTMENTS ----
let allAppointments = [];
let selectedDate = new Date();

async function loadAppointments() {
  renderDateStrip();
  await fetchAppointmentsForDate(selectedDate);
}

function renderDateStrip() {
  const strip = document.getElementById('date-strip');
  const today = new Date();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html = '';
  for (let i = -3; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const isActive = d.toDateString() === selectedDate.toDateString();
    html += `
      <div class="date-chip ${isActive ? 'active' : ''}" onclick="selectDate(${d.getTime()})">
        <span class="day">${days[d.getDay()]}</span>
        <span class="num">${d.getDate()}</span>
      </div>
    `;
  }
  strip.innerHTML = html;
}

function selectDate(ts) {
  selectedDate = new Date(ts);
  renderDateStrip();
  fetchAppointmentsForDate(selectedDate);
}

async function fetchAppointmentsForDate(date) {
  const dateStr = date.toISOString().split('T')[0];
  document.getElementById('appt-date-label').textContent = date.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  if (!supabase) { renderDemoAppointments(); return; }
  
  try {
    const { data, error } = await supabase.from('appointments')
      .select('*').eq('appointment_date', dateStr).order('appointment_time');
    if (error) throw error;
    allAppointments = data || [];
    renderAppointments(allAppointments);
  } catch(e) {
    renderDemoAppointments();
  }
}

function renderDemoAppointments() {
  allAppointments = [
    { id: 'a1', client_name: 'Maria Santos', client_phone: '0917-123-4567', service_name: 'Korean Black Pearl', appointment_time: '13:00', status: 'confirmed', amount: 1800 },
    { id: 'a2', client_name: 'Ana Reyes', client_phone: '0918-987-6543', service_name: 'Brazilian Waxing', appointment_time: '14:30', status: 'pending', amount: 800 },
    { id: 'a3', client_name: 'Carla Dela Cruz', client_phone: '0919-555-1234', service_name: 'Meso Acne', appointment_time: '16:00', status: 'confirmed', amount: 1500 },
    { id: 'a4', client_name: 'Lisa Flores', client_phone: '0920-111-2222', service_name: 'Diamond Peel', appointment_time: '18:00', status: 'completed', amount: 500 },
  ];
  renderAppointments(allAppointments);
}

function renderAppointments(appts) {
  const list = document.getElementById('appointments-list');
  if (!appts.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><h3>No appointments</h3><p>No bookings for this day</p></div>';
    return;
  }
  list.innerHTML = appts.map(a => `
    <div class="appt-card ${a.status}">
      <div class="appt-time">${formatTime(a.appointment_time)}</div>
      <div class="appt-info">
        <div class="appt-client">${a.client_name}</div>
        <div class="appt-service">${a.service_name} • ${a.client_phone || 'No phone'}</div>
      </div>
      <span class="badge ${a.status === 'confirmed' ? 'badge-green' : a.status === 'completed' ? 'badge-gray' : a.status === 'cancelled' ? 'badge-red' : 'badge-orange'}">${capitalize(a.status)}</span>
      <div class="appt-amount">₱${formatNumber(a.amount || 0)}</div>
      <div style="display:flex;gap:6px">
        ${a.status !== 'completed' && a.status !== 'cancelled' ? `
          <button class="btn btn-outline btn-sm" onclick="updateApptStatus('${a.id}','confirmed')">✓</button>
          <button class="btn btn-danger btn-sm" onclick="updateApptStatus('${a.id}','cancelled')">✕</button>
        ` : ''}
        <button class="btn btn-ghost btn-sm" onclick="editAppointment('${a.id}')">Edit</button>
      </div>
    </div>
  `).join('');
}

async function updateApptStatus(id, status) {
  if (!supabase) {
    const a = allAppointments.find(x => x.id === id);
    if (a) a.status = status;
    renderAppointments(allAppointments);
    showToast(`Appointment ${status}`, 'success');
    return;
  }
  try {
    await supabase.from('appointments').update({ status }).eq('id', id);
    showToast(`Appointment ${status}`, 'success');
    fetchAppointmentsForDate(selectedDate);
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

function openAddAppointmentModal() {
  editingApptId = null;
  document.getElementById('appt-modal-title').textContent = 'New Appointment';
  document.getElementById('appt-form').reset();
  document.getElementById('af-date').value = selectedDate.toISOString().split('T')[0];
  populateServiceSelect();
  openModal('appt-modal');
}

let editingApptId = null;
function editAppointment(id) {
  const a = allAppointments.find(x => x.id === id);
  if (!a) return;
  editingApptId = id;
  document.getElementById('appt-modal-title').textContent = 'Edit Appointment';
  document.getElementById('af-client').value = a.client_name;
  document.getElementById('af-phone').value = a.client_phone || '';
  document.getElementById('af-date').value = a.appointment_date || selectedDate.toISOString().split('T')[0];
  document.getElementById('af-time').value = a.appointment_time;
  document.getElementById('af-amount').value = a.amount || '';
  document.getElementById('af-status').value = a.status;
  document.getElementById('af-notes').value = a.notes || '';
  populateServiceSelect(a.service_id);
  openModal('appt-modal');
}

function populateServiceSelect(selectedId = null) {
  const sel = document.getElementById('af-service');
  sel.innerHTML = '<option value="">Select service...</option>' +
    allServices.filter(s => s.is_active).map(s =>
      `<option value="${s.id}" data-price="${s.price}" ${s.id === selectedId ? 'selected' : ''}>${s.name} — ₱${formatNumber(s.price)}</option>`
    ).join('');
  sel.onchange = () => {
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.dataset.price) document.getElementById('af-amount').value = opt.dataset.price;
  };
}

async function saveAppointment() {
  const serviceEl = document.getElementById('af-service');
  const serviceOpt = serviceEl.options[serviceEl.selectedIndex];
  
  const data = {
    client_name: document.getElementById('af-client').value.trim(),
    client_phone: document.getElementById('af-phone').value.trim() || null,
    service_id: serviceEl.value || null,
    service_name: serviceOpt && serviceOpt.value ? serviceOpt.text.split(' — ')[0] : null,
    appointment_date: document.getElementById('af-date').value,
    appointment_time: document.getElementById('af-time').value,
    amount: parseFloat(document.getElementById('af-amount').value) || 0,
    status: document.getElementById('af-status').value,
    notes: document.getElementById('af-notes').value.trim() || null
  };
  
  if (!data.client_name || !data.appointment_date || !data.appointment_time) {
    showToast('Client name, date, and time are required', 'error'); return;
  }
  
  if (!supabase) {
    if (editingApptId) {
      const idx = allAppointments.findIndex(a => a.id === editingApptId);
      if (idx > -1) allAppointments[idx] = { ...allAppointments[idx], ...data };
    } else {
      allAppointments.push({ id: 'a-' + Date.now(), ...data });
    }
    renderAppointments(allAppointments);
    closeModal('appt-modal');
    showToast('Appointment saved', 'success');
    return;
  }
  
  try {
    if (editingApptId) {
      const { error } = await supabase.from('appointments').update(data).eq('id', editingApptId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('appointments').insert(data);
      if (error) throw error;
    }
    closeModal('appt-modal');
    showToast('Appointment saved', 'success');
    fetchAppointmentsForDate(selectedDate);
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ---- SALES / POS ----
let posCart = [];
let allSales = [];

async function loadSales() {
  populatePOSServiceList();
  loadSalesHistory();
}

function populatePOSServiceList() {
  const list = document.getElementById('pos-services');
  list.innerHTML = allServices.filter(s => s.is_active).map(s => `
    <div class="pos-service-item" onclick="addToCart('${s.id}','${escHtml(s.name)}',${s.price})">
      <div style="font-weight:600;font-size:0.82rem">${s.name}</div>
      <div style="color:var(--gold-dark);font-weight:600;margin-top:2px">₱${formatNumber(s.price)}</div>
      <div style="font-size:0.7rem;color:var(--gray)">${s.category}</div>
    </div>
  `).join('');
}

function addToCart(id, name, price) {
  const existing = posCart.find(c => c.id === id);
  if (existing) {
    existing.qty++;
  } else {
    posCart.push({ id, name, price, qty: 1 });
  }
  renderCart();
}

function renderCart() {
  const cartList = document.getElementById('cart-list');
  const total = posCart.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = parseFloat(document.getElementById('pos-discount').value) || 0;
  const finalTotal = Math.max(0, total - discount);
  
  if (!posCart.length) {
    cartList.innerHTML = '<div class="empty-state" style="padding:30px"><div class="empty-icon">🛒</div><p>Select services above</p></div>';
  } else {
    cartList.innerHTML = posCart.map((item, idx) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(201,151,28,0.08)">
        <div style="flex:1">
          <div style="font-size:0.82rem;font-weight:500">${item.name}</div>
          <div style="font-size:0.72rem;color:var(--gray)">₱${formatNumber(item.price)} × ${item.qty}</div>
        </div>
        <div style="font-weight:600;color:var(--dark);font-size:0.82rem">₱${formatNumber(item.price * item.qty)}</div>
        <button onclick="removeFromCart(${idx})" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:1rem">×</button>
      </div>
    `).join('');
  }
  
  document.getElementById('cart-subtotal').textContent = '₱' + formatNumber(total);
  document.getElementById('cart-discount').textContent = '₱' + formatNumber(discount);
  document.getElementById('cart-total').textContent = '₱' + formatNumber(finalTotal);
}

function removeFromCart(idx) {
  posCart.splice(idx, 1);
  renderCart();
}

function clearCart() {
  posCart = [];
  document.getElementById('pos-client').value = '';
  document.getElementById('pos-discount').value = '';
  renderCart();
}

async function processSale() {
  const clientName = document.getElementById('pos-client').value.trim() || 'Walk-in Client';
  const discount = parseFloat(document.getElementById('pos-discount').value) || 0;
  const payMethod = document.getElementById('pos-payment').value;
  
  if (!posCart.length) { showToast('Add services to cart first', 'error'); return; }
  
  const subtotal = posCart.reduce((s, i) => s + i.price * i.qty, 0);
  const total = Math.max(0, subtotal - discount);
  
  const saleData = {
    client_name: clientName,
    items: posCart,
    subtotal,
    discount,
    total,
    payment_method: payMethod,
    status: 'completed'
  };
  
  if (!supabase) {
    allSales.unshift({ id: 'sale-' + Date.now(), ...saleData, created_at: new Date().toISOString() });
    showToast(`Sale of ₱${formatNumber(total)} processed for ${clientName}!`, 'success');
    clearCart();
    document.getElementById('sales-tab-2').click();
    loadSalesHistory();
    return;
  }
  
  try {
    const { error } = await supabase.from('sales').insert(saleData);
    if (error) throw error;
    showToast(`Sale processed — ₱${formatNumber(total)}`, 'success');
    clearCart();
    loadSalesHistory();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function loadSalesHistory() {
  const tbody = document.getElementById('sales-tbody');
  
  if (!supabase) {
    renderSalesTable(allSales.length ? allSales : getDemoSales());
    return;
  }
  
  try {
    const { data } = await supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(50);
    allSales = data || [];
    renderSalesTable(allSales);
  } catch(e) {
    renderSalesTable(getDemoSales());
  }
}

function getDemoSales() {
  return [
    { id: 'ds1', client_name: 'Maria Santos', items: [{name:'Korean Black Pearl',qty:1,price:1800}], total: 1800, discount: 0, payment_method: 'gcash', created_at: new Date().toISOString() },
    { id: 'ds2', client_name: 'Ana Reyes', items: [{name:'Brazilian Waxing',qty:1,price:800}], total: 750, discount: 50, payment_method: 'cash', created_at: new Date(Date.now() - 86400000).toISOString() },
    { id: 'ds3', client_name: 'Carla Dela Cruz', items: [{name:'Meso Acne',qty:1,price:1500},{name:'Diamond Peel',qty:1,price:500}], total: 2000, discount: 0, payment_method: 'card', created_at: new Date(Date.now() - 172800000).toISOString() },
  ];
}

function renderSalesTable(sales) {
  const tbody = document.getElementById('sales-tbody');
  if (!sales.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">💰</div><h3>No sales yet</h3></div></td></tr>`;
    return;
  }
  tbody.innerHTML = sales.map(s => `
    <tr>
      <td class="td-muted">${formatDate(s.created_at)}</td>
      <td style="font-weight:500">${s.client_name}</td>
      <td class="td-muted">${Array.isArray(s.items) ? s.items.map(i => i.name).join(', ') : JSON.stringify(s.items)}</td>
      <td style="font-weight:600;color:var(--gold-dark)">₱${formatNumber(s.total)}</td>
      <td><span class="badge badge-teal">${capitalize(s.payment_method || 'cash')}</span></td>
      <td><span class="badge badge-green">Completed</span></td>
    </tr>
  `).join('');
}

// ---- REPORTS ----
async function loadReports() {
  if (!supabase) { renderDemoReports(); return; }
  
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const [{ data: sales }, { data: appts }, { count: totalProd }] = await Promise.all([
      supabase.from('sales').select('total, created_at').gte('created_at', startOfMonth.toISOString()),
      supabase.from('appointments').select('status, amount').gte('appointment_date', startOfMonth.toISOString().split('T')[0]),
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true)
    ]);
    
    const monthRevenue = (sales || []).reduce((s, r) => s + (r.total || 0), 0);
    const completedAppts = (appts || []).filter(a => a.status === 'completed').length;
    const totalAppts = (appts || []).length;
    
    updateReportMetrics(monthRevenue, completedAppts, totalAppts, totalProd || 0);
    renderRevenueChart(sales || []);
    renderTopServices(appts || []);
  } catch(e) {
    renderDemoReports();
  }
}

function renderDemoReports() {
  updateReportMetrics(52500, 38, 45, 47);
  renderDemoChart();
}

function updateReportMetrics(revenue, completed, total, products) {
  document.getElementById('rpt-revenue').textContent = '₱' + formatNumber(revenue);
  document.getElementById('rpt-completed').textContent = completed;
  document.getElementById('rpt-total-appts').textContent = total;
  document.getElementById('rpt-products').textContent = products;
}

function renderDemoChart() {
  const canvas = document.getElementById('revenue-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const days = Array.from({length: 7}, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('en', { weekday: 'short' });
  });
  const values = [3200, 4500, 2800, 6700, 5100, 8900, 7200];
  drawBarChart(ctx, canvas.width, canvas.height, days, values);
}

function drawBarChart(ctx, w, h, labels, values) {
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(...values) * 1.1;
  const pad = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const barW = (chartW / labels.length) * 0.6;
  const gap = chartW / labels.length;
  
  ctx.strokeStyle = 'rgba(201,151,28,0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + chartH - (i / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    ctx.fillStyle = 'rgba(107,101,96,0.6)';
    ctx.font = '11px Jost, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('₱' + formatNumber((i / 4) * max / 1000, 0) + 'k', pad.left - 6, y + 4);
  }
  
  labels.forEach((label, i) => {
    const x = pad.left + i * gap + gap / 2;
    const barH = (values[i] / max) * chartH;
    const y = pad.top + chartH - barH;
    
    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, '#E8B94F');
    grad.addColorStop(1, '#9A7213');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x - barW / 2, y, barW, barH, 4);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(44,36,22,0.7)';
    ctx.font = '11px Jost, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, h - pad.bottom / 2 + 4);
  });
}

// ---- SUPPLIERS ----
let allSuppliers = [];

async function loadSuppliers() {
  if (!supabase) { renderDemoSuppliers(); return; }
  try {
    const { data } = await supabase.from('suppliers').select('*').order('name');
    allSuppliers = data || [];
    renderSuppliersTable(allSuppliers);
  } catch(e) { renderDemoSuppliers(); }
}

function renderDemoSuppliers() {
  allSuppliers = [
    { id: 'sup1', name: 'Beauty Supplies Co.', contact_person: 'Ms. Rivera', phone: '02-8123-4567', email: 'orders@beautysupplies.ph', is_active: true },
    { id: 'sup2', name: 'Hair Removal PH', contact_person: 'Mr. Santos', phone: '0917-456-7890', email: 'sales@hairremoval.ph', is_active: true },
    { id: 'sup3', name: 'Glow Essentials', contact_person: 'Ms. Dela Cruz', phone: '0918-111-2222', email: 'glow@essentials.ph', is_active: true },
    { id: 'sup4', name: 'Nail World PH', contact_person: 'Ms. Flores', phone: '0919-333-4444', email: 'nailworld@ph.com', is_active: true },
  ];
  renderSuppliersTable(allSuppliers);
}

function renderSuppliersTable(suppliers) {
  const tbody = document.getElementById('suppliers-tbody');
  tbody.innerHTML = suppliers.map(s => `
    <tr>
      <td style="font-weight:600">${s.name}</td>
      <td class="td-muted">${s.contact_person || '—'}</td>
      <td class="td-muted">${s.phone || '—'}</td>
      <td class="td-muted">${s.email || '—'}</td>
      <td><span class="badge ${s.is_active ? 'badge-green' : 'badge-gray'}">${s.is_active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-outline btn-sm" onclick="editSupplier('${s.id}')">Edit</button>
        </div>
      </td>
    </tr>
  `).join('');
}

let editingSupplierId = null;
function openAddSupplierModal() {
  editingSupplierId = null;
  document.getElementById('supplier-modal-title').textContent = 'Add Supplier';
  document.getElementById('supplier-form').reset();
  openModal('supplier-modal');
}

function editSupplier(id) {
  const s = allSuppliers.find(x => x.id === id);
  if (!s) return;
  editingSupplierId = id;
  document.getElementById('supplier-modal-title').textContent = 'Edit Supplier';
  document.getElementById('supf-name').value = s.name;
  document.getElementById('supf-contact').value = s.contact_person || '';
  document.getElementById('supf-phone').value = s.phone || '';
  document.getElementById('supf-email').value = s.email || '';
  document.getElementById('supf-address').value = s.address || '';
  openModal('supplier-modal');
}

async function saveSupplier() {
  const data = {
    name: document.getElementById('supf-name').value.trim(),
    contact_person: document.getElementById('supf-contact').value.trim() || null,
    phone: document.getElementById('supf-phone').value.trim() || null,
    email: document.getElementById('supf-email').value.trim() || null,
    address: document.getElementById('supf-address').value.trim() || null,
  };
  if (!data.name) { showToast('Supplier name is required', 'error'); return; }
  
  if (!supabase) {
    if (editingSupplierId) {
      const idx = allSuppliers.findIndex(s => s.id === editingSupplierId);
      if (idx > -1) allSuppliers[idx] = { ...allSuppliers[idx], ...data };
    } else {
      allSuppliers.push({ id: 'sup-' + Date.now(), ...data, is_active: true });
    }
    renderSuppliersTable(allSuppliers);
    closeModal('supplier-modal');
    showToast('Supplier saved', 'success');
    return;
  }
  
  try {
    if (editingSupplierId) {
      await supabase.from('suppliers').update(data).eq('id', editingSupplierId);
    } else {
      await supabase.from('suppliers').insert({ ...data, is_active: true });
    }
    closeModal('supplier-modal');
    showToast('Supplier saved', 'success');
    loadSuppliers();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ---- STAFF ----
let allStaff = [];

async function loadStaff() {
  if (!supabase) { renderDemoStaff(); return; }
  try {
    const { data } = await supabase.from('staff').select('*').order('name');
    allStaff = data || [];
    renderStaffTable(allStaff);
  } catch(e) { renderDemoStaff(); }
}

function renderDemoStaff() {
  allStaff = [
    { id: 'st1', name: 'Meera', role: 'Owner / Aesthetician', phone: '09993962841', email: 'meera@panemorfi.ph', is_active: true },
    { id: 'st2', name: 'Ana Cruz', role: 'Nail Technician', phone: '0918-111-2222', email: '', is_active: true },
    { id: 'st3', name: 'Rica Santos', role: 'Skin Therapist', phone: '0919-333-4444', email: '', is_active: true },
  ];
  renderStaffTable(allStaff);
}

function renderStaffTable(staff) {
  const tbody = document.getElementById('staff-tbody');
  tbody.innerHTML = staff.map(s => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="user-avatar" style="width:32px;height:32px;font-size:0.75rem">${s.name.charAt(0)}</div>
          <span style="font-weight:600">${s.name}</span>
        </div>
      </td>
      <td><span class="badge badge-gold">${s.role || 'Staff'}</span></td>
      <td class="td-muted">${s.phone || '—'}</td>
      <td class="td-muted">${s.email || '—'}</td>
      <td><span class="badge ${s.is_active ? 'badge-green' : 'badge-gray'}">${s.is_active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="editStaff('${s.id}')">Edit</button>
      </td>
    </tr>
  `).join('');
}

let editingStaffId = null;
function openAddStaffModal() {
  editingStaffId = null;
  document.getElementById('staff-modal-title').textContent = 'Add Staff Member';
  document.getElementById('staff-form').reset();
  openModal('staff-modal');
}

function editStaff(id) {
  const s = allStaff.find(x => x.id === id);
  if (!s) return;
  editingStaffId = id;
  document.getElementById('staff-modal-title').textContent = 'Edit Staff Member';
  document.getElementById('stf-name').value = s.name;
  document.getElementById('stf-role').value = s.role || '';
  document.getElementById('stf-phone').value = s.phone || '';
  document.getElementById('stf-email').value = s.email || '';
  openModal('staff-modal');
}

async function saveStaff() {
  const data = {
    name: document.getElementById('stf-name').value.trim(),
    role: document.getElementById('stf-role').value.trim() || null,
    phone: document.getElementById('stf-phone').value.trim() || null,
    email: document.getElementById('stf-email').value.trim() || null,
  };
  if (!data.name) { showToast('Name is required', 'error'); return; }
  
  if (!supabase) {
    if (editingStaffId) {
      const idx = allStaff.findIndex(s => s.id === editingStaffId);
      if (idx > -1) allStaff[idx] = { ...allStaff[idx], ...data };
    } else {
      allStaff.push({ id: 'st-' + Date.now(), ...data, is_active: true });
    }
    renderStaffTable(allStaff);
    closeModal('staff-modal');
    showToast('Staff member saved', 'success');
    return;
  }
  
  try {
    if (editingStaffId) {
      await supabase.from('staff').update(data).eq('id', editingStaffId);
    } else {
      await supabase.from('staff').insert({ ...data, is_active: true });
    }
    closeModal('staff-modal');
    showToast('Staff member saved', 'success');
    loadStaff();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ---- SETTINGS ----
function saveSupabaseConfig() {
  const url = document.getElementById('cfg-url').value.trim();
  const key = document.getElementById('cfg-key').value.trim();
  
  if (!url || !key) { showToast('Enter both URL and API key', 'error'); return; }
  
  localStorage.setItem('mp_supabase_url', url);
  localStorage.setItem('mp_supabase_key', key);
  
  const client = initSupabase(url, key);
  if (client) {
    document.getElementById('connection-status').innerHTML = '<span class="badge badge-green">✓ Connected</span>';
    showToast('Supabase connected successfully!', 'success');
    loadDashboard();
  } else {
    document.getElementById('connection-status').innerHTML = '<span class="badge badge-red">✕ Failed</span>';
    showToast('Connection failed. Check your credentials.', 'error');
  }
}

// ---- MODAL UTILITIES ----
function openModal(id) {
  document.getElementById(id).classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  document.body.style.overflow = '';
}

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
    document.body.style.overflow = '';
  }
});

// ---- TAB SYSTEM ----
function switchTab(groupId, tabId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  group.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
  document.getElementById(tabId)?.classList.add('active');
}

// ---- UTILITIES ----
function formatCurrency(n) { return '₱' + formatNumber(n); }
function formatNumber(n, decimals = 2) {
  const num = parseFloat(n) || 0;
  if (decimals === 0) return num.toLocaleString('en-PH');
  return num.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hNum = parseInt(h);
  const ampm = hNum >= 12 ? 'PM' : 'AM';
  return `${hNum > 12 ? hNum - 12 : hNum || 12}:${m} ${ampm}`;
}
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function escHtml(s) { return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  // Load saved Supabase credentials
  const savedUrl = localStorage.getItem('mp_supabase_url');
  const savedKey = localStorage.getItem('mp_supabase_key');
  if (savedUrl && savedKey) {
    document.getElementById('cfg-url').value = savedUrl;
    document.getElementById('cfg-key').value = savedKey;
    initSupabase(savedUrl, savedKey);
    if (supabase) {
      document.getElementById('connection-status').innerHTML = '<span class="badge badge-green">✓ Connected</span>';
    }
  }
  
  // Load initial page
  navigateTo('dashboard');
  
  // Sidebar nav items
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });
  
  // Initialize POS cart
  renderCart();
});

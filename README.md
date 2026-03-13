# Meeras Panemorfi — Inventory Management System
## Setup Guide

---

### 🚀 Quick Start

1. **Extract** this ZIP file to a folder on your computer
2. **Open** `index.html` in any modern browser (Chrome, Edge, Firefox)
3. The app runs in **Demo Mode** immediately — no setup needed to explore!

---

### 🔌 Connecting to Supabase (Live Database)

To save real data that persists across sessions:

#### Step 1: Create a Supabase Account
1. Go to [https://supabase.com](https://supabase.com)
2. Sign up for a free account
3. Create a new project (choose a region close to Philippines)

#### Step 2: Set Up the Database
1. In your Supabase dashboard, go to **SQL Editor**
2. Copy the SQL from `js/supabase-config.js` (the big comment block at the top)
   — OR use the copy button in **Settings → Database Schema** in the app
3. Paste and click **Run**

#### Step 3: Get Your API Credentials
1. In Supabase, go to **Settings → API**
2. Copy your **Project URL** (looks like `https://xxxx.supabase.co`)
3. Copy your **anon public key** (starts with `eyJ...`)

#### Step 4: Connect in the App
1. Open the app → click **Settings** in the sidebar
2. Paste your Project URL and API Key
3. Click **Save & Connect**
4. The status should show **✓ Connected**

---

### 📱 Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | Overview of revenue, stock alerts, appointments |
| **Inventory** | Add/edit products, track stock levels, adjust quantities |
| **Services** | Manage all beauty services with pricing |
| **Appointments** | Calendar-based booking system |
| **Sales & POS** | Point of sale with cart, discounts, payment methods |
| **Reports** | Revenue charts, top services, analytics |
| **Suppliers** | Vendor management |
| **Staff** | Team member management |
| **Settings** | Supabase config, business info |

---

### 💳 Accepted Payments (configured in POS)
- Cash
- GCash
- Credit/Debit Card
- Bank Transfer

---

### 📞 Support
For any issues, contact your web developer or refer to the Supabase documentation at [https://docs.supabase.com](https://docs.supabase.com)

---

### 🏪 Business Info
**Meeras Panemorfi — Beauty and Wellness**
- Schedule: Monday–Sunday, 12:00 PM – 10:00 PM
- Contact: 09993962841 | 0951-186-2406 | 461-36-26

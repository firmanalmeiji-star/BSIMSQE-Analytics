# BSIM S+ GE — Weekly Report Dashboard

Auto-fetch dashboard yang menggantikan PPT manual mingguan. Langsung tarik data dari Google Sheets, proses semua metrik, dan tampilkan grafik interaktif.

## Features

### 📞 In-App Call Traffic (replaces Slide 6-11)
- Total/Unique calls, Guest vs Login breakdown
- Daily call volume (stacked bar chart)
- Conversation Status (pie chart)
- Response Time breakdown
- Audio Issues summary & identification
- Top 15 Topics (horizontal bar chart)
- User Feedback table (Positive / Negative App / Negative Service)

### 🪪 Manual KYC (replaces Slide 2-4)
- Total/Unique calls, Conversion Rate
- Completed / Failed / Pending KYC
- Daily KYC volume
- Rejection Reasons chart
- Assignment Time & Response Time
- Topic breakdown

### 🔍 Issue Identification (new!)
- Auto-identifies issues from Topic, Summary, dan Feedback
- Severity-coded cards

## Setup

### Prerequisites
- Kedua Google Sheet harus di-share: **"Anyone with the link can view"**
- Node.js 18+

### Deploy ke Netlify

1. **Connect repo ini ke Netlify:**
   - Login ke [Netlify](https://app.netlify.com)
   - New Site → Import from Git → GitHub → Pilih repo `BSIM-Analytics`
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Click Deploy

2. **Selesai!** Dashboard akan auto-deploy setiap push ke `main`.

### Local Development
```bash
npm install
npm run dev
```

## Data Sources

| Source | Sheet ID | GID |
|--------|----------|-----|
| Manual KYC | `11fyn43YY8ROzIjLrN3m8p1fpRdBfYzsU8SqnZs0Ktyo` | `136609703` |
| In-App Call | `1_mj9wpWFsLAr-mEAsS4ULWL2PuWHM_jKdcB9VcAzgP0` | `0` |

Sheet ID bisa diganti via tombol ⚙️ Config di dashboard.

## How It Works

1. User pilih tanggal → klik **"Fetch from Google Sheets"**
2. Dashboard download CSV dari Google Sheet public export URL
3. PapaParse mem-parse CSV
4. JavaScript memproses & aggregate semua metrik
5. Recharts menampilkan grafik

**Tidak perlu API key, serverless function, atau backend apapun.**

## Tech Stack
- React 18 + Vite
- Recharts (charts)
- PapaParse (CSV parsing)
- Netlify (hosting)

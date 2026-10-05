# Shamba Watch Secure API Proxy (Cloudflare Worker)

Universal serverless API gateway providing authenticated, rate-limited proxying to upstream intelligence models without exposing credentials to the client.

---

## 1. Prerequisites
- Node.js 18+ installed.
- A Cloudflare account (Free tier includes 100,000 requests/day).

---

## 2. Setup & Deployment (2 Minutes)

### Step 1: Install Wrangler CLI
```bash
npm install -g wrangler
```
*(Or use `npx wrangler` directly)*

### Step 2: Login to Cloudflare
```bash
wrangler login
```

### Step 3: Set Your Upstream Secret API Key
In the `cloudflare-worker/` directory, run:
```bash
wrangler secret put INFERENCE_API_KEY
```
When prompted, paste your API key. This is encrypted and stored in Cloudflare's secure secrets vault.

*(Optional)* If you wish to customize the upstream URL:
```bash
wrangler secret put INFERENCE_UPSTREAM_URL
```
*(Defaults automatically to the standard completion endpoint)*

### Step 4: Deploy the Worker
```bash
wrangler deploy
```

Wrangler will output your live worker URL, for example:
```
Published shamba-watch-proxy (0.24 sec)
  https://shamba-watch-proxy.<your-subdomain>.workers.dev
```

---

## 3. Connect to Shamba Watch Dashboard

1. Open [`public/js/config/app-config.js`](../public/js/config/app-config.js).
2. Set `AI_GATEWAY.WORKER_ENDPOINT` to your live worker endpoint:
   ```javascript
   AI_GATEWAY: {
     WORKER_ENDPOINT: 'https://shamba-watch-proxy.<your-subdomain>.workers.dev/api/inference',
   }
   ```
3. Restart or refresh your dashboard!

---

## 4. Live Diagnostic Logs
To view real-time incoming requests, upstream latencies, and error logs directly from Cloudflare edge servers:
```bash
wrangler tail
```

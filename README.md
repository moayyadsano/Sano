# Sano — Deployment Guide
## How to get Sano live as a website in 15 minutes

---

## STEP 1 — Get your Anthropic API Key

1. Go to https://console.anthropic.com
2. Sign in (or create a free account)
3. Click "API Keys" in the left sidebar
4. Click "Create Key"
5. Copy the key — it starts with `sk-ant-...`
6. Save it somewhere safe (you only see it once)

---

## STEP 2 — Upload to GitHub

1. Go to https://github.com and sign in
2. Click the "+" button (top right) → "New repository"
3. Name it: `sano`
4. Leave it as **Private**
5. Click "Create repository"
6. On the next page, click "uploading an existing file"
7. Drag and drop the entire `sano` folder contents into the upload area
   (all files and folders: src/, api/, public/, index.html, package.json, vite.config.js, vercel.json)
8. Click "Commit changes"

---

## STEP 3 — Deploy on Vercel

1. Go to https://vercel.com and sign in with GitHub
2. Click "Add New Project"
3. Find your `sano` repository and click "Import"
4. Vercel will auto-detect the settings — don't change anything
5. Click "Deploy"
6. Wait ~60 seconds — your site is live!

---

## STEP 4 — Add your API Key (IMPORTANT)

Without this step the tool will not generate reports.

1. In Vercel, go to your project dashboard
2. Click "Settings" (top menu)
3. Click "Environment Variables" (left sidebar)
4. Click "Add New"
5. Name: `ANTHROPIC_API_KEY`
6. Value: paste your key (`sk-ant-...`)
7. Click "Save"
8. Go back to "Deployments" and click "Redeploy" on your latest deployment

---

## STEP 5 — Your site is live!

Vercel gives you a free URL like:
`https://sano-yourname.vercel.app`

Share this with anyone — it works on desktop and mobile.

---

## Optional: Add a custom domain (e.g. sano-health.com)

1. Buy a domain at https://namecheap.com (~$10/year)
2. In Vercel → Settings → Domains
3. Type your domain and click "Add"
4. Vercel shows you DNS settings — copy them into Namecheap
5. Wait 10–30 minutes — done

---

## Need help?

If anything goes wrong, take a screenshot of the error and share it.

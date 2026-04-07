# Vercel Deployment Setup & Troubleshooting

## ⚠️ Still Getting 404? Use This Comprehensive Checklist

### Troubleshooting Steps (in order)

#### 1. Check Vercel Build Logs
1. Go to **[Vercel Dashboard](https://vercel.com/dashboard)**
2. Select **jobrocket** project
3. Click **Deployments** tab
4. Click on the latest deployment
5. Scroll down to see **Build & Deployments Logs**
   - Look for errors like `ESLint`, `TypeScript`, `Build failed`, etc.
   - **Screenshot the error** if present - it tells you what's wrong

#### 2. Force a Fresh Rebuild
If environment variables were just added:
1. Go to **Deployments**
2. Find the latest deployment
3. Click the **⋮** (three dots) menu
4. Select **Redeploy**
5. Choose **Use existing commit** (not "Use latest commit")
6. Click **Redeploy**
7. Wait 2-3 minutes for new deployment

#### 3. Clear Vercel Cache
1. Go to **Settings** → **Git**
2. Scroll to **Ignored Build Step**
3. Leave blank (or set to default)
4. Go back to **Deployments**
5. Click **⋮** on latest deployment → **Promote to Production**

#### 4. Test Locally First
Run these commands locally to catch build errors:

```bash
cd /home/ridha/freelance/auto_application_bot/frontend

# Install dependencies
npm install

# Check for TypeScript/ESLint errors
npm run lint

# Try building locally
npm run build

# If build succeeds, start it
npm run start
```

If `npm run build` fails, fix the errors shown before deploying to Vercel.

#### 5. Check Environment Variables in Vercel
1. **Settings** → **Environment Variables**
2. Verify:
   - Variable name: `NEXT_PUBLIC_API_URL`
   - Variable value: `https://api.jobrocket.aiviora.online`
   - Environments: Check both **Production** and **Preview** are selected
3. If changed, redeploy again

#### 6. Review Vercel.json Config

Your `vercel.json`:
```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm install"
}
```
✅ This is correct.

#### 7. Check for Git Sync Issues
1. Have you pushed the latest code changes to git?
   ```bash
   git status
   git add .
   git commit -m "fix: environment variables and API configuration"
   git push
   ```
2. Vercel auto-deploys on push - wait 2-3 minutes

#### 8. Run Build Locally to Find Errors
```bash
cd /home/ridha/freelance/auto_application_bot/frontend
rm -rf node_modules .next
npm install
npm run build
```
If this shows errors, fix them before Vercel will work.

---

## Common 404 Causes & Solutions

| Issue | Solution |
|-------|----------|
| **Build failed silently** | Check Vercel build logs in Deployments |
| **Env vars not set** | Settings → Environment Variables → add `NEXT_PUBLIC_API_URL` |
| **Old code cached** | Redeploy or push new code to git |
| **TypeScript errors** | Run `npm run build` locally first |
| **Missing files** | Check git - all files need to be committed |

---

**For Production (jobrocket.aiviora.online):**
```
NEXT_PUBLIC_API_URL = https://api.jobrocket.aiviora.online
```

**For Local Development (http://localhost:3000):**
```
NEXT_PUBLIC_API_URL = http://localhost:8000
```
*(Already set in `.env.local`)*

---

## What This Variable Does

- Tells the frontend where your backend API is located
- Used for: login, register, profile, billing checkout, bot operations
- Must be accessible from the browser (HTTPS for production)

---

## If Backend URL is Different

If your API is hosted at a different URL (e.g., `https://api.example.com`), update the value above accordingly.

**Important:** Make sure your backend is deployed and accessible at that URL before setting it!

---

## Already Fixed Locally

✅ `.env.local` - for local dev
✅ `.env.production` - exists, but Vercel uses dashboard settings
✅ All pages updated to use `NEXT_PUBLIC_API_URL`

Now just need to set it in Vercel Dashboard!

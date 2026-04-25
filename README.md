# MyApp — PWA Starter Kit

A mobile-first Progressive Web App with Google Apps Script backend.

## File Structure

```
pwa-starter/
├── index.html        ← Main HTML shell + all CSS
├── app.js            ← Frontend logic: routing, auth, API calls
├── sw.js             ← Service worker (offline caching)
├── manifest.json     ← PWA manifest (home screen install)
├── gas-backend.js    ← Paste this into Google Apps Script
└── icons/            ← App icons (see step 3 below)
```

---

## Setup Steps

### 1. Google Sheet (Database)
1. Create a new Google Sheet at sheets.google.com
2. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/THIS_PART_HERE/edit`
3. Paste it into `gas-backend.js` → `const SHEET_ID = '...'`
4. Add your admin email(s) to `ADMIN_EMAILS`
5. The script auto-creates all sheet tabs on first run

### 2. Google Apps Script (Backend)
1. Go to script.google.com → New Project
2. Paste the contents of `gas-backend.js` into the editor
3. Deploy → New deployment → Web App
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the deployment URL
5. Paste it into `app.js` → `GAS_URL: '...'`

### 3. App Icons
Generate icons at https://realfavicongenerator.net or https://pwa-image-generator.firebaseapp.com
- `icons/icon-192.png` — 192×192px
- `icons/icon-512.png` — 512×512px
- `icons/icon-180.png` — 180×180px (iOS)

### 4. Deploy Frontend (Free)

**Option A: GitHub Pages**
1. Push this folder to a GitHub repo
2. Settings → Pages → Deploy from main branch
3. Your app is live at `https://yourusername.github.io/reponame`

**Option B: Cloudflare Pages** (recommended — faster, better)
1. Push to GitHub
2. Go to pages.cloudflare.com → Connect to Git
3. Select your repo, no build command needed (it's plain HTML)
4. Live at `https://yourapp.pages.dev`

**Option C: Local testing**
```bash
npx serve .
# or
python3 -m http.server 8080
```
⚠️ Service workers require HTTPS. For local dev, use localhost (it's exempt).

---

## Customizing the Form

Edit the `renderSubmit()` function in `app.js` to add/remove fields.
Then update `handleSubmitForm()` in `gas-backend.js` to save the right columns.

## Customizing Reward Math

Edit `calculateReward()` in `gas-backend.js`. 
Currently: `reward = amount × category_multiplier`

---

## Adding "Add to Home Screen"

**Android (Chrome):** The browser auto-prompts after a few visits. Users can also tap ⋮ → "Add to Home screen"

**iOS (Safari):** Users tap the Share button → "Add to Home Screen"
iOS does NOT auto-prompt — consider adding an in-app banner that says:
"Tap Share → Add to Home Screen to install this app"

---

## Auth Notes

The current auth flow uses a simplified token system. For production:
- Use Google Identity Services (GIS) JS library on the frontend to get an ID token
- Send that token to GAS and verify it using `OAuth2` library or `UrlFetchApp`
- Or use Firebase Auth (drop-in, much easier) if you switch backends

Face ID / fingerprint: Implemented via WebAuthn API. Works on:
- iOS Safari 16+ (Face ID, Touch ID)
- Android Chrome (fingerprint)
- Prompts user after first Google login

---

## Costs

| Service         | Cost    |
|----------------|---------|
| Google Sheets   | Free    |
| Apps Script     | Free    |
| GitHub Pages    | Free    |
| Cloudflare Pages| Free    |
| **Total**       | **$0**  |

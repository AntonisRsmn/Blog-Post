# Rusman Blog Platform (Current Documentation)

This repository contains a full-stack blog platform with public content, user accounts, comments, and admin/staff management tools.

## What the website does

### Public visitors
- Browse published posts on the home page
- Search and filter by category
- Open full post pages with rich Editor.js content (text, images, embeds, quotes)
- View release calendar events
- Click **Generate Summary** on a post page to get an AI/fallback Greek summary in a visible summary box

### Logged-in users
- Access profile page
- Update profile fields and avatar URL
- Change password
- Add comments
- Delete their own comments

### Staff/Admin users
- Access admin pages (`dashboard`, `posts`, `events`, `categories`, `staff`, `profile`)
- Create/edit/delete posts (staff ownership rules apply for post edit/delete)
- Upload images for content
- Manage release calendar events
- Manage categories:
  - create: admin + staff
  - delete: admin + staff
  - edit/rename: disabled
- Manage staff access list (current backend permission allows both admin and staff)

---

## Tech stack
- Frontend: static HTML/CSS/vanilla JS
- Backend: Node.js + Express
- Database: MongoDB (Mongoose)
- Auth: JWT in `httpOnly` cookie
- Uploads: Multer + Cloudinary
- AI Summary provider: Groq free-tier by default (optional OpenAI fallback)

---

## Key behavior notes
- Category names are normalized to uppercase.
- Category deletion removes matching category values from posts case-insensitively.
- Post page summary button is one-time per post per browser (stored in `localStorage`).
- Summary endpoint is rate-limited (`/api/posts/summarize`, 5 requests/hour per IP).
- AI summaries are requested in Greek.

---

## Required environment variables

Minimum:
- `PORT`
- `MONGO_URI`
- `JWT_SECRET` (must be at least 32 characters)
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `STAFF_EMAILS`

Optional AI configuration:
- `AI_PROVIDER=groq|openai|auto`
- `GROQ_API_KEY`
- `GROQ_MODEL` (default: `llama-3.1-8b-instant`)
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4o-mini`)

If no AI key is configured, the app returns a local fallback summary.

---

## Local run
1. `npm install`
2. Configure `.env`
3. `npm start`
4. Open `http://localhost:3000`

Expected startup logs:
- `Server running on port ...`
- `MongoDB connected`

---

## Google AdSense setup (ads)

This project now includes AdSense placeholders on:
- `frontend/index.html` (home page ad)
- `frontend/post.html` (single post ad)

AdSense config is centralized in:
- `frontend/js/adsense.js`

### 1) Create and verify your AdSense account
1. Sign in to AdSense with your Google account: `https://www.google.com/adsense/start/`
2. Add your site domain (example: `rusman.gr`)
3. Complete identity + payment profile details
4. Verify ownership of your domain when requested (usually via DNS or AdSense snippet)
5. Wait for site review/approval (can take from hours to several days)

### 2) Create ad units in AdSense
After approval:
1. Go to **Ads → By ad unit**
2. Create at least 2 display ad units (one for home, one for post page)
3. Copy each generated **ad slot ID**

### 3) Update this code with your real IDs
Edit `frontend/js/adsense.js`:
- Replace `clientId` with your real publisher ID (format: `ca-pub-...`)
- Replace `homeSlot`, `postSlot`, and `genericSlot` with real slot IDs from AdSense

Default placeholders are intentionally non-working:
- `clientId: ca-pub-XXXXXXXXXXXXXXXX`
- `homeSlot: 0000000000`
- `postSlot: 0000000001`
- `genericSlot: 0000000002`

### 4) Go live requirements
- Use a real domain in production (AdSense generally does not serve on localhost)
- Ensure `privacy.html` discloses ads/cookies usage and links to your cookie policy/consent flow
- If you target EEA/UK users, implement a CMP/cookie consent solution compatible with Google requirements

### 5) Validate ads are loading
1. Deploy your site
2. Open the home and post pages
3. Check browser console for AdSense errors
4. In AdSense, monitor **Sites** and **Ads** status

If no ads appear immediately, this is normal while account/site/ad-unit propagation completes.

---

## Routes overview

### Public API
- `GET /api/posts?list=1`
- `GET /api/posts/by-id/:id`
- `GET /api/posts/by-slug?slug=...`
- `POST /api/posts/summarize` (rate-limited)
- `GET /api/categories`
- `GET /api/releases`
- `GET /api/comments/:postId`

### Auth/Profile API
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/profile`
- `PUT /api/auth/profile`
- `PUT /api/auth/password`

### Staff/Admin API
- Posts: `POST/PUT/DELETE /api/posts/...`
- Categories: `POST /api/categories`, `DELETE /api/categories/:name`, `PUT /api/categories/:name` returns disabled (405)
- Staff list: `/api/staff` routes
- Upload: `POST /api/upload`

---

## Security notes
- Never commit `.env`.
- Rotate secrets immediately if exposed (`JWT_SECRET`, DB credentials, Cloudinary secrets, AI API keys).
- On stale behavior in dev, ensure only one Node server process is running, then hard-refresh browser (`Ctrl+F5`).

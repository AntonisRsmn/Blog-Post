# Rusman Blog Platform (Current Documentation)

This repository contains a full-stack blog platform with public content, user accounts, comments, and admin/staff management tools.

## What the website does

### Public visitors
- Browse published posts on the home page
- Search and filter by category
- Use filter search inputs on home and author pages to quickly narrow category options
- Open full post pages with rich Editor.js content (text, images, embeds, quotes)
- View release calendar events
- Search release events from the calendar jump input and jump directly to matching month/day
- Click any calendar day to filter the release list to that specific date
- Use themed custom event suggestions in the calendar jump input (instead of browser-native gray selector)
- View a rotating release/event strip below the navbar on home and author pages (today first, then upcoming)
- View featured post rotator on home page (manual admin picks, up to 6)
- Open dedicated author pages with author hero/profile links and author-only post listings
- Click **Generate Summary** on a post page to get an AI/fallback Greek summary in a visible summary box

### Logged-in users
- Access profile page
- Update profile fields and avatar URL
- Update profile social links (website, GitHub, LinkedIn, Instagram, Twitter/X, TikTok)
- Change password
- Add comments
- Delete their own comments

### Staff/Admin users
- Access admin pages (`dashboard`, `posts`, `events`, `categories`, `staff`, `profile`)
- Access Core Web Vitals page (`/admin/vitals.html`) directly (nav link may be hidden by current UI configuration)
- Create/edit/delete posts (staff ownership rules apply for post edit/delete)
- Upload images for content
- Manage release calendar events
- Use Broken-link Checker page (`/admin/analytics-links.html`) to scan internal/outbound links
- Manage featured posts from admin dashboard (admin only, max 6 with automatic rollover)
- Manage categories:
  - create: admin + staff
  - delete: admin can delete any, staff can delete only categories created by their own account
  - edit/rename: disabled
- Manage newsletter subscribers from admin page (`/admin/newsletter.html`):
  - view total/loaded subscribers
  - search by email
  - remove subscriber with shared delete confirmation popup
  - copy/export current filtered list
- Manage staff access list (current backend permission allows both admin and staff)
- Use a shared confirmation modal before destructive delete actions
- See admin status messages auto-dismiss after 5 seconds
- Use analytics dashboard with Top 10 lists (posts/categories/authors) + dedicated searchable “Show all” pages with fixed rank numbers

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
- Admin sessions use short access-token TTL (`JWT_ACCESS_TTL`, default 15m) to force periodic re-authentication.
- Login lockout is enabled (`LOGIN_MAX_ATTEMPTS`, `LOCK_MINUTES`) after repeated invalid credentials.
- Access protections block self-admin removal/demotion and block env-managed admin changes (`STAFF_EMAILS`).
- Cookie consent supports Essential/Analytics/Ads preferences and includes a dedicated cookie policy page (`/cookies.html`).
- Author links and display names now prioritize first + last name.
- Author page lookup supports full-name links and preserves profile avatar resolution.
- Home and author filters include category search plus calendar event jump with custom themed suggestions.
- Calendar day selection applies a day-specific release filter in the event list.
- Category names are normalized to uppercase.
- Category deletion removes matching category values from posts case-insensitively.
- Category ownership is stored (`createdBy`) for delete permission checks in staff flows.
- Post page summary button is one-time per post per browser (stored in `localStorage`).
- Summary endpoint is rate-limited (`/api/posts/summarize`, 5 requests/hour per IP).
- AI summaries are requested in Greek.
- Posts without image use a default fallback image (`frontend/assets/default-post.svg`).
- Admin dashboard calendar panel shows latest 10 events.
- In dashboard event creation, posts that already have calendar assignment are hidden from the dropdown (except when editing that event).
- Unknown non-API routes return the custom frontend 404 page, while unknown API routes return JSON 404.
- Operational health endpoint is available at `/health`.
- Newsletter subscriptions are captured from footer form on home/post flows and upserted by email (no duplicates).
- Mobile footer places newsletter above the rest of footer content; desktop keeps balanced three-column layout.
- Profile page “Profile Links” section uses a 3x2 desktop grid (3 links on first row, 3 on second) and stacks to one column on mobile.
- Staff/admin navbar now exposes a Vitals link across admin and public/shared pages where staff links appear.
- Vitals page includes quick improvement guide + metric glossary + standard footer.
- Comment timestamps on post pages include hour and minute (not only date).
- YouTube embeds use `youtube-nocookie` mode and AdSense is skipped on localhost/dev to reduce non-actionable console warnings.
- Analytics endpoints for link checker/search misses support both hyphen and underscore path variants.

---

## Required environment variables

Minimum:
- `PORT`
- `PORT_FALLBACK_TRIES`
- `MONGO_URI`
- `JWT_SECRET` (must be at least 32 characters)
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `STAFF_EMAILS`

Auth/security tuning:
- `JWT_ACCESS_TTL` (example: `15m`)
- `JWT_REFRESH_TTL` (reserved)
- `BCRYPT_ROUNDS`
- `COOKIE_SECURE`
- `COOKIE_SAMESITE`
- `LOGIN_MAX_ATTEMPTS`
- `LOCK_MINUTES`

Smoke test env vars:
- `SMOKE_BASE_URL`
- `SMOKE_ADMIN_EMAIL`
- `SMOKE_ADMIN_PASSWORD`

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
- `Server running on fallback port ...` (when base port is busy)
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
- `GET /health`
- `GET /api/posts?list=1`
- `GET /api/posts/by-id/:id`
- `GET /api/posts/by-slug?slug=...`
- `GET /api/posts/by-author?author=...`
- `POST /api/posts/track-view`
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
- `GET /api/auth/author?name=...`

### Staff/Admin API
- Posts: `POST/PUT/DELETE /api/posts/...`
- Manage own/all posts list: `GET /api/posts/manage?list=1`
- Manage post by id (admin/staff safe path): `GET /api/posts/manage/by-id/:id`
- Analytics:
  - `GET /api/posts/manage/analytics` (Top 10 on dashboard)
  - `GET /api/posts/manage/analytics/posts` (full ranked posts)
  - `GET /api/posts/manage/analytics/categories` (full ranked categories)
  - `GET /api/posts/manage/analytics/authors` (full ranked authors)
  - `GET /api/posts/manage/analytics/search-misses` and `GET /api/posts/manage/analytics/search_misses`
  - `GET /api/posts/manage/analytics/link-health` and `GET /api/posts/manage/analytics/link_health`
- Metrics:
  - `POST /api/metrics/web-vitals`
  - `GET /api/metrics/web-vitals` (staff/admin)
- Newsletter:
  - `POST /api/newsletter/subscribe`
  - `GET /api/newsletter/subscribers` (staff/admin)
  - `DELETE /api/newsletter/subscribers` (staff/admin, body: `email`)
- Featured management (admin only):
  - `GET /api/posts/manage/featured`
  - `POST /api/posts/manage/featured` (body: `postId`)
  - `DELETE /api/posts/manage/featured/:id`
- Categories:
  - `GET /api/categories/manage` (category metadata + delete permission for current user)
  - `POST /api/categories`
  - `DELETE /api/categories/:name`
  - `PUT /api/categories/:name` returns disabled (405)
- Staff list: `/api/staff` routes
- Upload: `POST /api/upload`

---

## Security notes
- Never commit `.env`.
- Rotate secrets immediately if exposed (`JWT_SECRET`, DB credentials, Cloudinary secrets, AI API keys).
- On stale behavior in dev, ensure only one Node server process is running, then hard-refresh browser (`Ctrl+F5`).

---

## Maintenance scripts
- `npm run smoke:test` → auth/staff smoke tests (login, lockout, self-remove blocked, env-admin blocked)
- `npm run migrate:authors-fullname` → one-time/repeatable post-author display migration to full names

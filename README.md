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

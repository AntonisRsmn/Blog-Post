# Rusman Blog Platform — Full Documentation (English)

This repository contains a full-stack blog platform with:
- Public blog browsing and reading
- Search, category filtering, and release calendar
- User authentication and profile management
- Comment system with moderation rules
- Staff-only admin dashboard for post and calendar-event management

## 1) What the website does

### Public visitors can:
- Open the home page and browse published posts
- Search posts by title, excerpt, author, slug, and category
- Filter posts by category
- Open single-post pages
- View a release calendar of marked posts (`Game` / `Tech`)
- Switch theme (light/dark)

### Logged-in users can:
- Access profile page
- Update first name, last name, username, and avatar URL
- Upload avatar image
- Change password
- Post comments on articles
- Delete their own comments

### Staff users can additionally:
- Access `/admin/*` management pages (`dashboard.html`, `posts.html`, `events.html`)
- Create, edit, and delete posts
- Assign and manage categories
- Upload images in Editor.js content
- Publish/unpublish calendar events (release date + include in calendar)
- Edit/remove calendar events
- Delete any comment (through role permissions in comment routes)

---

## 2) Architecture

### Frontend
- Static HTML/CSS/JS pages in `frontend/`
- No frontend framework; logic is vanilla JavaScript
- Theme and auth link behavior managed via `frontend/js/theme.js`
- Home/search/calendar logic in `frontend/js/blog.js`
- Admin dashboard logic is mostly inline in `frontend/admin/dashboard.html`

### Backend
- Node.js + Express (API + static file serving)
- MongoDB via Mongoose
- JWT authentication stored in `httpOnly` cookie
- Password hashing via bcrypt
- Image uploads via Multer memory storage + Cloudinary

Core entry point:
- `server/server.js`

---

## 3) Repository structure

- `frontend/`
  - Public pages: `index.html`, `post.html`, `no-access.html`, `tos.html`, `privacy.html`
  - Admin pages: `admin/dashboard.html`, `admin/posts.html`, `admin/events.html`, `admin/login.html`, `admin/signup.html`, `admin/profile.html`
  - Styles: `css/*.css`
  - Scripts: `js/theme.js`, `js/blog.js`, `js/api.js`, `js/admin.js`
- `server/`
  - `server.js` (Express app bootstrap)
  - `models/` (`User`, `Post`, `Comment`, `Category`, `Admin`)
  - `routes/` (`auth`, `posts`, `comments`, `categories`, `releases`, `upload`)
  - `middleware/` (`auth`, `requireStaff`)

---

## 4) Data model and storage

## `User`
Fields:
- `email` (unique, required)
- `passwordHash` (required)
- `firstName` (optional string)
- `lastName` (optional string)
- `username` (optional string)
- `avatarUrl` (optional string)
- `role` (`commenter` or `staff`)
- timestamps

## `Post`
Fields:
- `title` (required)
- `author`, `authorId`
- `categories` (string array)
- `releaseDate` (optional date)
- `releaseType` (`Game`, `Tech`, or empty)
- `includeInCalendar` (boolean)
- `slug` (unique, required)
- `excerpt`
- `content` (Editor.js blocks array)
- `published` (boolean)
- timestamps

## `Comment`
Fields:
- `postId`, `userId`
- `authorName`, `authorAvatar`
- `text`
- timestamps

## `Category`
Fields:
- `name` (unique, required)
- timestamps

> Notes:
- `Admin` model exists but the active auth/authorization flow is based on `User.role`.
- Default categories are auto-seeded when category collection is empty.

---

## 5) Authentication and authorization

## Session/auth method
- Signup/login create JWT token signed with `JWT_SECRET`
- Token is set in cookie `token` with:
  - `httpOnly: true`
  - `sameSite: "strict"`
  - `secure: true` only in production
- `auth` middleware verifies the token and attaches `req.user`

## Role model
- Role resolved by `STAFF_EMAILS` env variable
- If user email belongs to `STAFF_EMAILS`, role is `staff`; otherwise `commenter`
- `requireStaff` middleware gates staff-only endpoints

## Protected areas
- All `/admin/*` pages are guarded server-side in `server.js`
- Exceptions: `/admin/login.html` and `/admin/signup.html` remain public
- Non-staff users are redirected to `/no-access.html`

---

## 6) API documentation

Base path: `/api`

## Auth routes (`/api/auth`)
- `POST /signup`
  - Body: `{ firstName, lastName, email, password }`
  - Validates strong password (>=8 chars, letter, number, symbol)
  - Creates user, sets auth cookie
- `POST /login`
  - Body: `{ email, password }`
  - Validates credentials, refreshes role from `STAFF_EMAILS`, sets auth cookie
- `GET /profile` (auth required)
  - Returns `_id`, `email`, `firstName`, `lastName`, `username`, `avatarUrl`, `role`
- `PUT /profile` (auth required)
  - Body supports `firstName`, `lastName`, `username`, `avatarUrl`
- `PUT /password` (auth required)
  - Body: `{ currentPassword, newPassword }`
- `POST /logout`
  - Clears auth cookie

## Posts routes (`/api/posts`)
- `GET /`
  - Returns all published posts
- `GET /:slug`
  - Returns one post by slug
- `POST /` (auth + staff)
  - Creates post
- `PUT /:id` (auth + staff)
  - Updates post
- `DELETE /:id` (auth + staff)
  - Deletes post

## Categories routes (`/api/categories`)
- `GET /`
  - Returns merged category list from category collection + post categories
- `POST /` (auth + staff)
  - Body: `{ name }`
  - Upserts category
- `DELETE /:name` (auth + staff)
  - Removes category and pulls it from posts

## Comments routes (`/api/comments`)
- `GET /:postId`
  - Returns post comments (latest first)
- `POST /:postId` (auth required)
  - Body: `{ text }`
  - Creates comment using account identity
- `DELETE /:commentId` (auth required)
  - Allowed for comment owner or staff

## Releases routes (`/api/releases`)
- `GET /`
  - Builds release feed from posts with `includeInCalendar: true`
  - Uses explicit `releaseDate` or inferred date from post text/content
  - Returns up to 120 upcoming/recent items (oldest cutoff: current date minus 2 months)

## Upload route (`/api/upload`)
- `POST /` (auth + staff)
  - Multipart form-data with `image`
  - Max file size: 5MB
  - Uploads to Cloudinary folder `blog`
  - Returns `{ url }`

---

## 7) Frontend pages and behavior

## `frontend/index.html`
- Home page with:
  - Search bar with keyboard shortcuts (`/`, `Ctrl/Cmd+K`, `Esc`)
  - Category filter panel
  - Release calendar panel
  - Paginated post sections (latest + per-category)

## `frontend/post.html`
- Single article rendering from Editor.js blocks:
  - Paragraphs
  - Images
  - YouTube embeds
- Comment section with login-gated posting

## `frontend/admin/login.html`
- Email/password login
- Redirects staff to dashboard, others to profile

## `frontend/admin/signup.html`
- Signup with password-strength validation

## `frontend/admin/profile.html`
- View/update first name, last name, username, and avatar URL
- Avatar upload via `/api/upload`
- Password change
- Logout

## `frontend/admin/dashboard.html`
- Staff-only content management panel
- Latest posts and latest calendar events overview
- Modal create/edit workflow for posts and events
- Category selection chips
- Quick access to full management pages (`posts.html`, `events.html`)

## `frontend/admin/posts.html`
- Full posts management page
- Search, create, edit, and delete posts
- Editor.js modal editing flow

## `frontend/admin/events.html`
- Full calendar events management page
- Filters by search/date/month/year
- Create, edit, and delete calendar events

## `frontend/no-access.html`
- Access denied page for unauthorized admin access

## `frontend/tos.html` and `frontend/privacy.html`
- Legal documentation pages linked from all footers

---

## 8) Calendar system (how it is managed)

The calendar is driven from post data.

To include a post in calendar:
1. Open dashboard
2. In “Calendar Events”, select a post
3. Set `Release Date`
4. Publish event

Stored fields on post:
- `includeInCalendar: true`
- `releaseDate`
- `releaseType` (`Game`/`Tech` or inferred)

Public calendar (`/api/releases`) then:
- Reads eligible posts
- Normalizes event dates
- Infers missing dates from text patterns when possible
- Sorts and returns event list consumed by home-page calendar UI

---

## 9) Theme and UI state

- Theme mode (`light`/`dark`) is stored in `localStorage`
- `theme.js` updates header and mobile toggles
- Auth-aware links are updated client-side (`Login` ↔ `Profile`, staff-only links visibility)

---

## 10) Security and protection mechanisms

Implemented:
- Password hashing (`bcrypt`)
- Signed JWT cookies (`httpOnly`, `sameSite: strict`)
- Staff role checks in middleware
- Server-side `/admin/*` access guard (with login/signup exceptions)
- Upload endpoint restricted to authenticated staff
- Upload size limit (5MB)

Operational recommendations:
- Use HTTPS in production
- Set strong `JWT_SECRET`
- Restrict Cloudinary credentials
- Regularly review `STAFF_EMAILS`
- Add rate limiting and CSRF protection for higher hardening

---

## 11) Environment variables

Create a `.env` file in project root:

```env
PORT=3000
MONGO_URI=mongodb+srv://.../blog
JWT_SECRET=replace_with_long_random_secret
NODE_ENV=development
STAFF_EMAILS=staff1@example.com,staff2@example.com

CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

---

## 12) Installation and local run

Requirements:
- Node.js 18+
- MongoDB database
- Cloudinary account for uploads

Install dependencies:
```bash
npm install
```

Run server:
```bash
npm start
```

Open in browser:
- `http://localhost:3000/`

---

## 13) Operational workflows

## Create first staff account
1. Set `STAFF_EMAILS` in `.env`
2. Sign up using one of those emails
3. Log in
4. You will be redirected to admin dashboard

## Publish a post
1. Go to dashboard
2. Fill title/slug/categories/content
3. Save post
4. Post appears on home page if `published` is true

## Publish a calendar event
1. In dashboard “Calendar Events”, pick post
2. Choose date
3. Publish event
4. Event appears in home release calendar

---

## 14) Known implementation notes

- `frontend/js/api.js` currently only defines `API_BASE` and is not the main source for requests.
- `frontend/js/admin.js` appears legacy/minimal; active dashboard logic is inline in `admin/dashboard.html`.
- Build script in `package.json` is currently `npm install` (not a compile/build pipeline).

---

## 15) Troubleshooting

## Login works but dashboard blocked
- Verify the user email is listed in `STAFF_EMAILS`
- Re-login so role gets refreshed

## Upload fails
- Verify Cloudinary env vars
- Check image size <= 5MB
- Confirm account is staff

## No posts visible on home
- Ensure posts are created with `published: true`
- Check API response from `GET /api/posts`

## Comments cannot be posted
- Ensure user is logged in
- Verify `/api/auth/profile` returns 200

---

## 16) License and ownership

No explicit open-source license file is included in this repository. Add a license file if you want to define usage rights publicly.

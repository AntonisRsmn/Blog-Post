# Πλατφόρμα Blog Rusman (Τρέχουσα Τεκμηρίωση)

Αυτό το repository περιέχει full-stack πλατφόρμα blog με δημόσιο περιεχόμενο, λογαριασμούς χρηστών, σχόλια και εργαλεία διαχείρισης για admin/staff.

## Τι κάνει το website

### Δημόσιοι επισκέπτες
- Προβολή δημοσιευμένων άρθρων στην αρχική
- Αναζήτηση και φίλτρα κατηγοριών
- Ανάγνωση πλήρους άρθρου (Editor.js περιεχόμενο: κείμενο, εικόνες, embeds, quotes)
- Προβολή release calendar
- Προβολή μπάρας release/event κάτω από το navbar στην αρχική (πρώτα σημερινά, μετά upcoming)
- Προβολή featured posts rotator στην αρχική (χειροκίνητη επιλογή admin, έως 6)
- Κλικ στο **Generate Summary** στη σελίδα άρθρου για δημιουργία ελληνικής σύνοψης μέσα σε εμφανές box

### Συνδεδεμένοι χρήστες
- Πρόσβαση στη σελίδα προφίλ
- Ενημέρωση στοιχείων προφίλ και avatar URL
- Αλλαγή κωδικού
- Προσθήκη σχολίων
- Διαγραφή δικών τους σχολίων

### Staff/Admin χρήστες
- Πρόσβαση στις admin σελίδες (`dashboard`, `posts`, `events`, `categories`, `staff`, `profile`)
- Δημιουργία/επεξεργασία/διαγραφή άρθρων (ισχύουν ownership rules για staff σε edit/delete)
- Upload εικόνων για περιεχόμενο
- Διαχείριση release calendar events
- Διαχείριση featured posts από το admin dashboard (μόνο admin, έως 6 με αυτόματο rollover)
- Διαχείριση κατηγοριών:
  - δημιουργία: admin + staff
  - διαγραφή: admin + staff
  - επεξεργασία/μετονομασία: απενεργοποιημένη
- Διαχείριση λίστας staff access (με τα τρέχοντα permissions επιτρέπεται σε admin και staff)
- Κοινό confirmation modal πριν από destructive διαγραφές
- Τα admin status μηνύματα κρύβονται αυτόματα σε 5 δευτερόλεπτα

---

## Τεχνολογίες
- Frontend: static HTML/CSS/vanilla JS
- Backend: Node.js + Express
- Βάση: MongoDB (Mongoose)
- Auth: JWT σε `httpOnly` cookie
- Uploads: Multer + Cloudinary
- AI σύνοψη: Groq free-tier ως προεπιλογή (προαιρετικά OpenAI fallback)

---

## Σημαντικές συμπεριφορές
- Οι κατηγορίες κανονικοποιούνται σε UPPERCASE.
- Η διαγραφή κατηγορίας αφαιρεί την κατηγορία case-insensitively και από τα posts.
- Το κουμπί σύνοψης στη σελίδα άρθρου είναι one-time ανά post ανά browser (`localStorage`).
- Το endpoint σύνοψης έχει rate limit (`/api/posts/summarize`, 5 αιτήματα/ώρα ανά IP).
- Οι AI περιλήψεις ζητούνται στα Ελληνικά.
- Posts χωρίς εικόνα χρησιμοποιούν default fallback image (`frontend/assets/default-post.svg`).
- Άγνωστα non-API routes οδηγούν στην custom frontend 404 σελίδα, ενώ άγνωστα API routes επιστρέφουν JSON 404.

---

## Απαραίτητα env variables

Ελάχιστα:
- `PORT`
- `MONGO_URI`
- `JWT_SECRET` (τουλάχιστον 32 χαρακτήρες)
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `STAFF_EMAILS`

Προαιρετικά για AI:
- `AI_PROVIDER=groq|openai|auto`
- `GROQ_API_KEY`
- `GROQ_MODEL` (default: `llama-3.1-8b-instant`)
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4o-mini`)

Αν δεν υπάρχει AI key, γίνεται local fallback σύνοψη.

---

## Εκτέλεση τοπικά
1. `npm install`
2. Ρύθμιση `.env`
3. `npm start`
4. Άνοιγμα `http://localhost:3000`

Αναμενόμενα logs:
- `Server running on port ...`
- `MongoDB connected`

---

## Σύνοψη routes

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
- Manage list για admin/staff: `GET /api/posts/manage?list=1`
- Manage by id (ασφαλές path): `GET /api/posts/manage/by-id/:id`
- Featured management (μόνο admin):
  - `GET /api/posts/manage/featured`
  - `POST /api/posts/manage/featured` (body: `postId`)
  - `DELETE /api/posts/manage/featured/:id`
- Categories: `POST /api/categories`, `DELETE /api/categories/:name`, `PUT /api/categories/:name` επιστρέφει disabled (405)
- Staff list: routes στο `/api/staff`
- Upload: `POST /api/upload`

---

## Security notes
- Μην ανεβάζεις το `.env` σε git.
- Κάνε άμεσα rotate τα secrets αν εκτεθούν (`JWT_SECRET`, DB credentials, Cloudinary secrets, AI API keys).
- Αν βλέπεις παλιά συμπεριφορά, βεβαιώσου ότι τρέχει μόνο ένα Node process και κάνε hard refresh (`Ctrl+F5`).

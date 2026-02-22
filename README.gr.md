# Πλατφόρμα Blog Rusman (Τρέχουσα Τεκμηρίωση)

Αυτό το repository περιέχει full-stack πλατφόρμα blog με δημόσιο περιεχόμενο, λογαριασμούς χρηστών, σχόλια και εργαλεία διαχείρισης για admin/staff.

## Τι κάνει το website

### Δημόσιοι επισκέπτες
- Προβολή δημοσιευμένων άρθρων στην αρχική
- Αναζήτηση και φίλτρα κατηγοριών
- Ανάγνωση πλήρους άρθρου (Editor.js περιεχόμενο: κείμενο, εικόνες, embeds, quotes)
- Προβολή release calendar
- Προβολή μπάρας release/event κάτω από το navbar σε αρχική και author page (πρώτα σημερινά, μετά upcoming)
- Προβολή featured posts rotator στην αρχική (χειροκίνητη επιλογή admin, έως 6)
- Πρόσβαση σε author page με author hero/profile links και λίστα άρθρων μόνο του συγκεκριμένου author
- Κλικ στο **Generate Summary** στη σελίδα άρθρου για δημιουργία ελληνικής σύνοψης μέσα σε εμφανές box

### Συνδεδεμένοι χρήστες
- Πρόσβαση στη σελίδα προφίλ
- Ενημέρωση στοιχείων προφίλ και avatar URL
- Ενημέρωση profile social links (website, GitHub, LinkedIn, Instagram, Twitter/X, TikTok)
- Αλλαγή κωδικού
- Προσθήκη σχολίων
- Διαγραφή δικών τους σχολίων

### Staff/Admin χρήστες
- Πρόσβαση στις admin σελίδες (`dashboard`, `posts`, `events`, `categories`, `staff`, `profile`)
- Πρόσβαση στη σελίδα Core Web Vitals (`/admin/vitals.html`) από το navbar (visibility για staff/admin)
- Δημιουργία/επεξεργασία/διαγραφή άρθρων (ισχύουν ownership rules για staff σε edit/delete)
- Upload εικόνων για περιεχόμενο
- Διαχείριση release calendar events
- Χρήση Broken-link Checker σελίδας (`/admin/analytics-links.html`) για έλεγχο internal/outbound links
- Διαχείριση featured posts από το admin dashboard (μόνο admin, έως 6 με αυτόματο rollover)
- Διαχείριση κατηγοριών:
  - δημιουργία: admin + staff
  - διαγραφή: admin διαγράφει όλες, staff διαγράφει μόνο όσες δημιούργησε ο ίδιος
  - επεξεργασία/μετονομασία: απενεργοποιημένη
- Διαχείριση newsletter subscribers από το admin page (`/admin/newsletter.html`):
  - προβολή total/loaded subscribers
  - αναζήτηση με email
  - αφαίρεση subscriber με κοινό delete confirmation popup
  - copy/export της τρέχουσας φιλτραρισμένης λίστας
- Διαχείριση λίστας staff access (με τα τρέχοντα permissions επιτρέπεται σε admin και staff)
- Κοινό confirmation modal πριν από destructive διαγραφές
- Τα admin status μηνύματα κρύβονται αυτόματα σε 5 δευτερόλεπτα
- Analytics dashboard με Top 10 λίστες (posts/categories/authors) + ξεχωριστές searchable “Show all” σελίδες με σταθερό rank

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
- Υπάρχει ownership πεδίο κατηγορίας (`createdBy`) για έλεγχο δικαιωμάτων διαγραφής staff.
- Το κουμπί σύνοψης στη σελίδα άρθρου είναι one-time ανά post ανά browser (`localStorage`).
- Το endpoint σύνοψης έχει rate limit (`/api/posts/summarize`, 5 αιτήματα/ώρα ανά IP).
- Οι AI περιλήψεις ζητούνται στα Ελληνικά.
- Posts χωρίς εικόνα χρησιμοποιούν default fallback image (`frontend/assets/default-post.svg`).
- Στο admin dashboard, το calendar panel δείχνει τα 10 πιο πρόσφατα events.
- Στο create event modal, posts που έχουν ήδη event δεν εμφανίζονται στο dropdown (εκτός από το event που επεξεργάζεσαι).
- Άγνωστα non-API routes οδηγούν στην custom frontend 404 σελίδα, ενώ άγνωστα API routes επιστρέφουν JSON 404.
- Τα newsletter subscriptions καταγράφονται από τη footer φόρμα (home/post ροές) και γίνονται upsert ανά email (χωρίς διπλότυπα).
- Στο mobile footer το newsletter εμφανίζεται πάνω από το υπόλοιπο footer περιεχόμενο, ενώ στο desktop διατηρείται ισορροπημένο 3-column layout.
- Στη σελίδα προφίλ, το τμήμα “Profile Links” εμφανίζεται σε desktop ως 3+3 πεδία (3 links επάνω, 3 κάτω) και σε mobile γίνεται μονή στήλη.
- Το staff/admin navbar εμφανίζει πλέον link για Vitals σε admin και δημόσιες/κοινές σελίδες όπου υπάρχουν staff links.
- Η σελίδα Vitals περιλαμβάνει quick improvement guide + glossary με ορισμούς metrics + footer.
- Τα timestamps στα σχόλια των post pages δείχνουν και ώρα/λεπτά (όχι μόνο ημερομηνία).
- Τα YouTube embeds χρησιμοποιούν `youtube-nocookie` mode και το AdSense παραλείπεται σε localhost/dev για λιγότερα μη-χρήσιμα console warnings.
- Τα analytics endpoints για link checker/search misses υποστηρίζουν και hyphen και underscore path variants.

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
- Manage list για admin/staff: `GET /api/posts/manage?list=1`
- Manage by id (ασφαλές path): `GET /api/posts/manage/by-id/:id`
- Analytics:
  - `GET /api/posts/manage/analytics` (Top 10 στο dashboard)
  - `GET /api/posts/manage/analytics/posts` (πλήρες ranked posts)
  - `GET /api/posts/manage/analytics/categories` (πλήρες ranked categories)
  - `GET /api/posts/manage/analytics/authors` (πλήρες ranked authors)
  - `GET /api/posts/manage/analytics/search-misses` και `GET /api/posts/manage/analytics/search_misses`
  - `GET /api/posts/manage/analytics/link-health` και `GET /api/posts/manage/analytics/link_health`
- Metrics:
  - `POST /api/metrics/web-vitals`
  - `GET /api/metrics/web-vitals` (staff/admin)
- Newsletter:
  - `POST /api/newsletter/subscribe`
  - `GET /api/newsletter/subscribers` (staff/admin)
  - `DELETE /api/newsletter/subscribers` (staff/admin, body: `email`)
- Featured management (μόνο admin):
  - `GET /api/posts/manage/featured`
  - `POST /api/posts/manage/featured` (body: `postId`)
  - `DELETE /api/posts/manage/featured/:id`
- Categories:
  - `GET /api/categories/manage` (metadata + delete permission για τον τρέχοντα χρήστη)
  - `POST /api/categories`
  - `DELETE /api/categories/:name`
  - `PUT /api/categories/:name` επιστρέφει disabled (405)
- Staff list: routes στο `/api/staff`
- Upload: `POST /api/upload`

---

## Security notes
- Μην ανεβάζεις το `.env` σε git.
- Κάνε άμεσα rotate τα secrets αν εκτεθούν (`JWT_SECRET`, DB credentials, Cloudinary secrets, AI API keys).
- Αν βλέπεις παλιά συμπεριφορά, βεβαιώσου ότι τρέχει μόνο ένα Node process και κάνε hard refresh (`Ctrl+F5`).

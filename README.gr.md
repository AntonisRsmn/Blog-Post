# Πλατφόρμα Blog Rusman — Πλήρης Τεκμηρίωση (Ελληνικά)

Αυτό το repository περιέχει μια full-stack πλατφόρμα blog με:
- Δημόσια προβολή άρθρων
- Αναζήτηση, φίλτρα κατηγοριών και ημερολόγιο κυκλοφοριών
- Authentication χρηστών και διαχείριση προφίλ
- Σύστημα σχολίων με κανόνες moderation
- Staff-only admin dashboard για διαχείριση άρθρων και calendar events

## 1) Τι κάνει το website

### Επισκέπτες μπορούν να:
- Ανοίξουν την αρχική σελίδα και να δουν δημοσιευμένα άρθρα
- Κάνουν αναζήτηση με τίτλο, excerpt, author, slug και κατηγορία
- Φιλτράρουν άρθρα ανά κατηγορία
- Ανοίξουν τη σελίδα ενός άρθρου
- Δουν ημερολόγιο κυκλοφοριών (`Game` / `Tech`)
- Αλλάξουν theme (light/dark)

### Συνδεδεμένοι χρήστες μπορούν να:
- Ανοίξουν τη σελίδα προφίλ
- Αλλάξουν username και avatar URL
- Ανεβάσουν avatar εικόνα
- Αλλάξουν κωδικό
- Δημοσιεύσουν σχόλια
- Διαγράψουν τα δικά τους σχόλια

### Staff χρήστες επιπλέον μπορούν να:
- Μπουν στο `/admin/dashboard.html`
- Δημιουργήσουν, επεξεργαστούν και διαγράψουν άρθρα
- Ορίσουν και διαχειριστούν κατηγορίες
- Ανεβάσουν εικόνες μέσα από Editor.js
- Δημοσιεύσουν/ενημερώσουν calendar events (ημερομηνία κυκλοφορίας)
- Διαγράψουν calendar events
- Διαγράψουν οποιοδήποτε σχόλιο (μέσω role permissions)

---

## 2) Αρχιτεκτονική

### Frontend
- Στατικά HTML/CSS/JS αρχεία στο `frontend/`
- Χωρίς framework (vanilla JavaScript)
- Theme + auth-aware links στο `frontend/js/theme.js`
- Home/search/calendar λογική στο `frontend/js/blog.js`
- Το κύριο logic του dashboard είναι inline στο `frontend/admin/dashboard.html`

### Backend
- Node.js + Express (API και static serving)
- MongoDB μέσω Mongoose
- JWT authentication σε `httpOnly` cookie
- Password hashing με bcrypt
- Upload εικόνων με Multer memory storage + Cloudinary

Entry point:
- `server/server.js`

---

## 3) Δομή repository

- `frontend/`
  - Public pages: `index.html`, `post.html`, `no-access.html`, `tos.html`, `privacy.html`
  - Admin pages: `admin/dashboard.html`, `admin/login.html`, `admin/signup.html`, `admin/profile.html`
  - Styles: `css/*.css`
  - Scripts: `js/theme.js`, `js/blog.js`, `js/api.js`, `js/admin.js`
- `server/`
  - `server.js` (bootstrap του Express app)
  - `models/` (`User`, `Post`, `Comment`, `Category`, `Admin`)
  - `routes/` (`auth`, `posts`, `comments`, `categories`, `releases`, `upload`)
  - `middleware/` (`auth`, `requireStaff`)

---

## 4) Μοντέλα δεδομένων

## `User`
Πεδία:
- `email` (unique, required)
- `passwordHash` (required)
- `username` (προαιρετικό)
- `avatarUrl` (προαιρετικό)
- `role` (`commenter` ή `staff`)
- timestamps

## `Post`
Πεδία:
- `title` (required)
- `author`, `authorId`
- `categories` (array από strings)
- `releaseDate` (προαιρετικό date)
- `releaseType` (`Game`, `Tech` ή κενό)
- `includeInCalendar` (boolean)
- `slug` (unique, required)
- `excerpt`
- `content` (Editor.js blocks)
- `published` (boolean)
- timestamps

## `Comment`
Πεδία:
- `postId`, `userId`
- `authorName`, `authorAvatar`
- `text`
- timestamps

## `Category`
Πεδία:
- `name` (unique, required)
- timestamps

> Σημειώσεις:
- Υπάρχει `Admin` model, αλλά η ενεργή εξουσιοδότηση βασίζεται στο `User.role`.
- Όταν δεν υπάρχουν κατηγορίες, γίνεται auto-seed default κατηγοριών.

---

## 5) Authentication και εξουσιοδότηση

## Session/auth τρόπος
- Στο signup/login δημιουργείται JWT με `JWT_SECRET`
- Το token αποθηκεύεται σε cookie `token` με:
  - `httpOnly: true`
  - `sameSite: "strict"`
  - `secure: true` μόνο σε production
- Το middleware `auth` κάνει verify token και βάζει `req.user`

## Role model
- Το role προκύπτει από τη μεταβλητή `STAFF_EMAILS`
- Αν το email ανήκει στο `STAFF_EMAILS` => `staff`, αλλιώς `commenter`
- Το middleware `requireStaff` προστατεύει staff-only endpoints

## Protected περιοχή
- Το `/admin/dashboard.html` προστατεύεται server-side στο `server.js`
- Μη-staff χρήστες γίνονται redirect στο `/no-access.html`

---

## 6) API τεκμηρίωση

Base path: `/api`

## Auth routes (`/api/auth`)
- `POST /signup`
  - Body: `{ email, password }`
  - Έλεγχος ισχυρού password (>=8, γράμμα, αριθμός, σύμβολο)
  - Δημιουργία χρήστη, set auth cookie
- `POST /login`
  - Body: `{ email, password }`
  - Έλεγχος credentials, refresh role από `STAFF_EMAILS`, set auth cookie
- `GET /profile` (auth required)
  - Επιστρέφει `_id`, `email`, `username`, `avatarUrl`, `role`
- `PUT /profile` (auth required)
  - Body με `username`, `avatarUrl`
- `PUT /password` (auth required)
  - Body: `{ currentPassword, newPassword }`
- `POST /logout`
  - Καθαρίζει auth cookie

## Posts routes (`/api/posts`)
- `GET /`
  - Όλα τα published posts
- `GET /:slug`
  - Ένα post από slug
- `POST /` (auth + staff)
  - Δημιουργία post
- `PUT /:id` (auth + staff)
  - Ενημέρωση post
- `DELETE /:id` (auth + staff)
  - Διαγραφή post

## Categories routes (`/api/categories`)
- `GET /`
  - Συνδυάζει categories από collection + posts
- `POST /` (auth + staff)
  - Body: `{ name }`
  - Upsert category
- `DELETE /:name` (auth + staff)
  - Διαγράφει category και την αφαιρεί από posts

## Comments routes (`/api/comments`)
- `GET /:postId`
  - Επιστρέφει σχόλια post (νεότερα πρώτα)
- `POST /:postId` (auth required)
  - Body: `{ text }`
  - Δημιουργία σχολίου με identity του user
- `DELETE /:commentId` (auth required)
  - Επιτρέπεται σε owner του σχολίου ή staff

## Releases routes (`/api/releases`)
- `GET /`
  - Χτίζει release feed από posts με `includeInCalendar: true`
  - Χρησιμοποιεί `releaseDate` ή κάνει date inference από κείμενο
  - Επιστρέφει μέχρι 120 items (κόβει πολύ παλιά)

## Upload route (`/api/upload`)
- `POST /` (auth + staff)
  - Multipart form-data με `image`
  - Μέγιστο 5MB
  - Upload σε Cloudinary folder `blog`
  - Επιστρέφει `{ url }`

---

## 7) Σελίδες frontend και λειτουργία

## `frontend/index.html`
- Home page με:
  - Search bar και shortcuts (`/`, `Ctrl/Cmd+K`, `Esc`)
  - Category filter panel
  - Release calendar panel
  - Pagination για latest και ανά κατηγορία

## `frontend/post.html`
- Rendering άρθρου από Editor.js blocks:
  - Paragraphs
  - Images
  - YouTube embeds
- Section σχολίων με login requirement για posting

## `frontend/admin/login.html`
- Login με email/password
- Redirect: staff -> dashboard, άλλοι -> profile

## `frontend/admin/signup.html`
- Signup με password strength validation

## `frontend/admin/profile.html`
- Προβολή/ενημέρωση username και avatar URL
- Upload avatar μέσω `/api/upload`
- Αλλαγή κωδικού
- Logout

## `frontend/admin/dashboard.html`
- Staff-only panel διαχείρισης περιεχομένου
- Editor.js για create/edit άρθρων
- Category chips και επιλογή κατηγοριών
- Post list με search/edit/delete
- Calendar event manager (publish/update/delete)

## `frontend/no-access.html`
- Access denied σελίδα για μη εξουσιοδοτημένο dashboard access

## `frontend/tos.html` και `frontend/privacy.html`
- Νομικές σελίδες συνδεδεμένες σε όλα τα footers

---

## 8) Πώς διαχειρίζεται το ημερολόγιο

Το ημερολόγιο βασίζεται σε δεδομένα post.

Για να μπει post στο calendar:
1. Άνοιγμα dashboard
2. Στο “Calendar Events” επιλέγεις post
3. Ορίζεις `Release Date`
4. Πατάς publish event

Αποθήκευση στο post:
- `includeInCalendar: true`
- `releaseDate`
- `releaseType` (`Game`/`Tech` ή inferred)

Το public endpoint `/api/releases`:
- Παίρνει τα eligible posts
- Κάνει normalize στις ημερομηνίες
- Κάνει inference date όταν λείπει
- Επιστρέφει events για το calendar UI

---

## 9) Theme και UI state

- Το mode (`light`/`dark`) αποθηκεύεται σε `localStorage`
- Το `theme.js` ελέγχει header και mobile toggles
- Τα auth links αλλάζουν δυναμικά (`Login` ↔ `Profile`, staff visibility)

---

## 10) Security μηχανισμοί

Υλοποιημένα:
- Hashing κωδικών (`bcrypt`)
- Signed JWT cookies (`httpOnly`, `sameSite: strict`)
- Staff role checks σε middleware
- Server-side guard για dashboard route
- Upload endpoint μόνο για authenticated staff
- Upload όριο 5MB

Προτεινόμενα για πιο δυνατό hardening:
- HTTPS παντού σε production
- Ισχυρό `JWT_SECRET`
- Προστασία Cloudinary credentials
- Τακτικός έλεγχος `STAFF_EMAILS`
- Προσθήκη rate limiting και CSRF protection

---

## 11) Environment variables

Δημιούργησε `.env` στο root:

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

## 12) Εγκατάσταση και εκτέλεση

Requirements:
- Node.js 18+
- MongoDB
- Cloudinary account για uploads

Install dependencies:
```bash
npm install
```

Run server:
```bash
npm start
```

Άνοιγμα στον browser:
- `http://localhost:3000/`

---

## 13) Βασικά workflows διαχείρισης

## Δημιουργία πρώτου staff account
1. Όρισε `STAFF_EMAILS` στο `.env`
2. Κάνε signup με email που υπάρχει στο `STAFF_EMAILS`
3. Κάνε login
4. Θα γίνει redirect στο dashboard

## Δημοσίευση post
1. Πήγαινε dashboard
2. Συμπλήρωσε title/slug/categories/content
3. Save post
4. Το post εμφανίζεται στο home αν είναι `published: true`

## Δημοσίευση calendar event
1. Dashboard -> “Calendar Events”
2. Επιλογή post
3. Επιλογή ημερομηνίας
4. Publish event
5. Εμφανίζεται στο home calendar

---

## 14) Σημειώσεις υλοποίησης

- Το `frontend/js/api.js` αυτή τη στιγμή έχει μόνο `API_BASE` και δεν είναι το κεντρικό request layer.
- Το `frontend/js/admin.js` φαίνεται legacy/minimal. Η ενεργή λογική dashboard είναι inline στο `admin/dashboard.html`.
- Το `build` script στο `package.json` είναι `npm install` (όχι compile/bundle pipeline).

---

## 15) Troubleshooting

## Κάνει login αλλά δεν μπαίνει dashboard
- Έλεγξε ότι το email υπάρχει στο `STAFF_EMAILS`
- Κάνε logout/login για να γίνει refresh ο ρόλος

## Upload αποτυγχάνει
- Έλεγξε Cloudinary env vars
- Επιβεβαίωσε ότι η εικόνα είναι <= 5MB
- Επιβεβαίωσε ότι ο λογαριασμός είναι staff

## Δεν φαίνονται posts στο home
- Βεβαιώσου ότι τα posts είναι `published: true`
- Έλεγξε την απάντηση του `GET /api/posts`

## Δεν δημοσιεύονται σχόλια
- Βεβαιώσου ότι ο χρήστης είναι logged in
- Έλεγξε ότι το `/api/auth/profile` επιστρέφει 200

---

## 16) License / ιδιοκτησία

Δεν υπάρχει ξεχωριστό open-source license file στο repository. Αν θέλεις δημόσια διάθεση κώδικα, πρόσθεσε κατάλληλο license.

# RentEase – Online Rental and Property Listing Management System

**Final Year Project**  
**Tech Stack:** HTML · CSS · JavaScript · Bootstrap 5 · **Appwrite 2.x (Cloud / TablesDB)**

---

## Project Overview

RentEase is a browser-based rental platform. The demo is set in **Sierra Leone** (Freetown, Bo, Kenema, Makeni…) and all prices are shown in **Nle** (New Leone), e.g. `Nle 6,000`.

- **Landlords** list, manage and approve rental properties
- **Tenants** search, filter, view and request properties
- **Admins** oversee users and system statistics

Authentication is handled by **Appwrite Account** and all data (users, properties, bookings, reviews) is stored in an **Appwrite TablesDB** database. No Node/Python backend is required – everything runs from static files that talk directly to Appwrite from the browser.

### Key Features

- Role-based authentication (Admin / Landlord / Tenant) via Appwrite
- Property listing with a photo gallery (thumbnail strip + fullscreen lightbox; seed data uses Pexels imagery with "Sample Listing" labels; new uploads go to the Appwrite Storage bucket)
- Advanced search & filters (keyword, city, type, price, bedrooms)
- Booking / rental request workflow with approval
- Rent payments tracking: landlords **record actual receipts** (status always derived, never fabricated)
- Reviews & ratings system
- Responsive Bootstrap 5 UI
- Admin dashboard with statistics and user management
- Admin user export (CSV)
- Open Graph / SEO meta on property pages

---

## How to Run

### 1. Create the Appwrite backend (one time)

> **This project's live Cloud backend is already configured.** Database
> `6ab57cc00006dfad73ba` (project `6ab57b9a00083af710b3`) has all nine tables,
> every index and the `any` full-CRUD permissions. The demo accounts
> (`admin`, `landlord`…`landlord4`, `tenant`…`tenant4`) already exist. Loading any
> page seeds the sample data that is **missing** — see step 2. The steps below
> are for setting it up from scratch.

1. Create a free project at [https://cloud.appwrite.io](https://cloud.appwrite.io) (or self-host Appwrite and use its endpoint, e.g. `http://localhost/v1`).
2. Open your project → **Settings** → copy the **Project ID** and the **API Endpoint**.
3. Add a **Web platform**: hostname `localhost` (and your domain if deployed).
4. Create a **Database** (note its **Database ID**).
5. In that database create **nine Tables** with these IDs and attributes (types are the Appwrite **TablesDB** column types; this project's live schema already matches):

   | Table ID            | Columns (key → type)                                                                                                                                                  |
   |---------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
   | `users`             | `account_id` varchar · `username` varchar · `email` email · `phone` varchar · `full_name` varchar · `role` varchar · `is_active` boolean · `created_at` datetime |
   | `properties`        | `landlord_id` varchar · `title` varchar(500) · `description` text · `address` varchar · `city` varchar · `state` varchar · `pincode` varchar · `price` float · `property_type` varchar · `bedrooms` integer · `bathrooms` integer · `area_sqft` integer · `amenities` text · `status` varchar · `verification` varchar · `is_furnished` boolean · `images` varchar **array** · `created_at` datetime · `updated_at` datetime |
   | `bookings`          | `property_id` varchar · `tenant_id` varchar · `start_date` varchar (YYYY-MM-DD) · `end_date` varchar · `message` text · `status` varchar · `total_amount` float · `created_at` datetime · `updated_at` datetime |
   | `rentals`           | `property_id` varchar · `tenant_id` varchar · `landlord_id` varchar · `booking_id` varchar · `start_date` varchar · `end_date` varchar · `rent_amount` float · `payment_frequency` varchar · `deposit` float · `terms` text · `status` varchar · `created_at` datetime · `updated_at` datetime |
   | `payments`          | `rental_id` varchar · `amount` float · `period_start` varchar (YYYY-MM-DD) · `period_end` varchar · `reference` varchar · `recorded_by` varchar · `paid_at` datetime |
   | `saved_properties`  | `user_id` varchar · `property_id` varchar · `created_at` datetime |
   | `notifications`     | `user_id` varchar · `type` varchar · `title` varchar · `message` text · `link` varchar · `read_at` varchar (the app writes `''` when unread) · `created_at` datetime |
   | `reports`           | `reporter_id` varchar · `target_type` varchar · `target_id` varchar · `reason` varchar · `details` text · `status` varchar · `created_at` datetime |
   | `reviews`           | `property_id` varchar · `tenant_id` varchar · `rating` integer · `comment` text · `created_at` datetime |

   Recommended indexes (this project ships them): `account_id`/`role` on `users`; `landlord_id`/`status`/`verification` on `properties`; `property_id`/`tenant_id`/`status` on `bookings`; `property_id`/`tenant_id` on `reviews`; `tenant_id`/`landlord_id`/`status` on `rentals`; `user_id`/`property_id` on `saved_properties`; `user_id` on `notifications`; `rental_id` on `payments`; `status` on `reports`.

   > **Demo permissions (important for this project):** give every table **All Users (`any`)** read, create, update and delete. On Appwrite Cloud's TablesDB the `users` role is **not** honoured for table-level permissions (only `any`/`guests` scopes and per-user/label targets), and the first-load seed runs while logged **out** – so `any` full CRUD is what makes the client-side demo work. The app still gates actions and pages by the signed-in user's role in `static/js/*`; see the production caveat below.

6. Open **`static/js/config.js`** and fill in:

   ```js
   endpoint: 'https://cloud.appwrite.io/v1',
   projectId: 'YOUR_PROJECT_ID',
   databaseId: 'YOUR_DATABASE_ID',
   ```

### 2. Open the site (auto-seeds demo data)

Serve the folder with any static server:

```bash
# Python 3
python -m http.server 8000

# OR Node.js
npx serve .

# OR VS Code -> Live Server extension
```

Open **http://localhost:8000**. On load, RentEase checks the demo rows themselves and seeds **anything missing** (it never duplicates what is already there). The sample data is:

- **9 demo accounts** — 1 admin, **4 landlords** (`landlord@`, `landlord2@`, `landlord3@`, `landlord4@`), **4 tenants** (`tenant@`, `tenant2@`, `tenant3@`, `tenant4@`, all `@demo.com`)
- **30 sample properties across ten Sierra Leonean cities** — Freetown (Wilberforce, Lumley, Aberdeen, Hill Station, Wellington, Juba, Brookfields, Goderich, Kissy, Congo Town), Waterloo, **Bo, Kenema, Makeni, Port Loko, Koidu, Kabala, Lunsar, Magburaka** — each with a price in **Nle**, a description, amenities and photos. **27 are `available`** and therefore appear on the browse page (3 pages of 9); the rest demonstrate the `pending` and `rented` states.
- 6 booking requests (3 still pending, spread across the different landlords' dashboards), 2 active rentals, 2 **recorded** payments (one paid in full, one part-paid), 3 reviews, 4 saved properties and event notifications for the new accounts

Seeding is **idempotent** – re-running it never duplicates data, and it is triggered per missing **row** rather than per empty **table**, so registering your own account can never leave the browse page empty. Rent payments scheduled/statuses are **derived** from the rental + recorded payments, never fabricated.

All seeded properties are **clearly labelled demo data**: each card and detail page carries a "Sample Listing" badge and the detail page shows an explanation banner, so visitors never mistake the stock photos for a real property at that address.

If you see a yellow **"Appwrite is not configured"** notice, you forgot step 6.

---

## Demo Accounts

| Role     | Email                  | Password     |
|----------|------------------------|--------------|
| Admin    | admin@demo.com         | admin123     |
| Landlord | landlord@demo.com      | landlord123  |
| Landlord | landlord2@demo.com     | landlord123  |
| Landlord | landlord3@demo.com     | landlord123  |
| Landlord | landlord4@demo.com     | landlord123  |
| Tenant   | tenant@demo.com        | tenant123    |
| Tenant   | tenant2@demo.com       | tenant123    |
| Tenant   | tenant3@demo.com       | tenant123    |
| Tenant   | tenant4@demo.com       | tenant123    |

Each landlord sees only **their own** listings, requests and rentals in the landlord dashboard, so logging in as a different landlord shows a different portfolio.

---

## Project Structure

```
RentEase/
├── index.html               # Home page (hero + featured properties)
├── properties.html          # Browse & filter properties (paginated)
├── property.html            # Property detail (carousel, reviews, booking)
├── login.html               # Login
├── register.html            # Register (auto-logs in after success)
├── dashboard.html           # Role-based redirect
├── landlord-dashboard.html  # Landlord: pending bookings & my properties
├── property-form.html       # Add / edit property (with image upload)
├── tenant-dashboard.html    # Tenant: my bookings
├── admin-dashboard.html     # Admin: stats & recent activity
├── admin-users.html         # Admin: manage users (activate/deactivate)
├── README.md
├── docs/                    # Final year report, presentation + AUDIT_AND_PLAN.md + PROPERTY_PLATFORM_RULES.md
└── static/
    ├── css/style.css        # Custom styles (Bootstrap 5 + Bootstrap Icons via CDN)
    └── js/
        ├── config.js        # Appwrite endpoint / project / database IDs
        ├── store.js         # Data layer: Appwrite CRUD + in-memory cache + seeding
        ├── main.js          # Shared UI: navbar, footer, flashes, helpers
        ├── home.js          # Featured properties
        ├── properties.js    # Search/filter/pagination
        ├── property-detail.js  # Detail view, reviews, booking
        ├── auth.js          # Login & register via Appwrite Account
        ├── dashboard.js     # Role redirect
        ├── landlord.js      # Landlord dashboard actions
        ├── property-form.js # Add/edit property
        ├── tenant.js        # Tenant bookings
        └── admin.js         # Admin stats & user management
```

---

## How Data is Stored

- **Authentication** → Appwrite **Account** (email/password sessions). Passwords never touch the app.
- **All app data** (users, properties, bookings, rentals, payments, saved properties, notifications, reports, reviews) → Appwrite **TablesDB**.
- The user's role, username and phone are stored both in the Appwrite account **preferences** and mirrored in the `users` table (so the admin dashboard can list and deactivate users).
- **Flash messages** stay in `localStorage` (short-lived UI notices, not app data).
- **Property photos** in the seed data are hosted online (Pexels, chosen so nothing looks like a deliberate "slum" stereotype) and each sample listing is clearly badged **"Sample Listing"** in the UI. New uploads (real listings) are downscaled in the browser, uploaded to the **Appwrite Storage bucket `property_photos`**, and the property row's `images` array stores the short public `/view` URLs — needed because TablesDB array elements are capped at 1000 characters (base64 data URLs blow past that and the row is rejected). When rows contain no real photo a neutral *"Property image unavailable"* placeholder is shown (never a fake photograph).
- **Payments** are only ever written when a landlord records an actual receipt — rent schedule/status (`paid`, `due_soon`, `overdue`, …) is always derived.
- **Notifications** are generated only by real events (application submitted/approved/rejected, rental confirmed, rent due soon/overdue, report received).
- Business rules are documented and enforced in the data layer + page scripts; see **`docs/PROPERTY_PLATFORM_RULES.md`** (production caveat included).

Flow on each page: `RE.init()` loads every table into an in-memory cache and restores the signed-in user (if any), then the page renders. Mutations (add / update / delete) are async and update Appwrite + the cache.

---

## Demo Flow

1. Login as **Admin** (`admin@demo.com` / `admin123`) → view stats, verify/reject listings, resolve reports, manage users
2. Login as **Landlord**:

   1. Approve or reject the pending request(s) in *Rental Requests*
   2. Approving a request **creates the active rental**, marks the property **rented**, and auto-rejects rival requests on it
   3. Record a rent **payment** for an active rental (shifts the rent Status to *Paid*)
3. Login as **Tenant** → browse → request an available property (shows a "verified listing" badge on admins' verified properties; duplicates and occupied properties are blocked)
   1. See the approval outcome plus *Rent Status* (paid / due / overdue…) under **My Rental**
   2. View a **Payment History** table of recorded receipts (period, amount, reference, date)
   3. Withdraw a pending request, save favourite properties, and get in-app notifications (including rent-due reminders)
4. Anyone (tenant or guest) can **report** a listing; admins review and resolve reports
5. Admins can **export users to CSV** from *Manage Users*

> **Passwords:** registration enforces a minimum of 8 characters, matching Appwrite's requirement. Demo accounts are unchanged.

---

## Testing

The data layer is headless and testable without a browser. A lifecycle E2E harness loads the real
`config.js` + `store.js` under a mocked Appwrite SDK and verifies seeding, discovery privacy,
ownership guards, booking→approval→rental (incl. rival auto-rejection), payment recording/rent
status, withdrawal, reports, and idempotent re-seeding:

```bash
npm test          # or  node test/lifecycle.test.mjs
```

All page scripts also pass `node --check`. Live runtime was verified against the real
Cloud backend with the `appwrite@26` SDK (schema write/read/delete round-trips on all nine
tables, plus logged-out and logged-in client CRUD under the `any` permissions), then the
probe rows were deleted so the app's own seed runs on first load.

---

## Technologies Used

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Frontend  | HTML5, CSS3, JavaScript (ES5)           |
| UI        | Bootstrap 5 + Bootstrap Icons           |
| Backend   | Appwrite Cloud (2.x) – Account + TablesDB + Storage |
| SDK       | `appwrite@26.2.0` (Web SDK, CDN)        |
| Images    | Pexels seed photos; new uploads → Appwrite Storage bucket (`property_photos`) |

---

## Author

Final Year Project – Design and Development of an Online Rental and Property Listing Management System

---

## License

This project is developed for academic purposes.
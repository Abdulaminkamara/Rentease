# RentEase — Audit Report & Implementation Plan

**Date:** 2026-09-24
**Auditor scope:** Full repository (frontend, data layer, auth, lifecycle, security, UX).
**Status:** Baseline snapshot before Phase 2 changes.

---

## 1. Current Architecture

| Layer          | Implementation                                                                                                        |
|----------------|-----------------------------------------------------------------------------------------------------------------------|
| Frontend       | 11 static HTML pages, plain ES5 JavaScript (IIFE modules), no framework, no build step                                |
| UI             | Bootstrap 5.3.3 + Bootstrap Icons (CDN); single `static/css/style.css` (~90 lines)                                    |
| Routing        | Multi-page + query params (`property.html?id=…`, `properties.html?keyword=…&page=…`)                                  |
| Backend        | None. **Appwrite Cloud 2.x** (TablesDB + Account) is the only server; all calls are directly from the browser          |
| Data layer     | `static/js/store.js` (IIFE) → in-memory cache + async CRUD over Appwrite TablesDB; `window.RentEase` singleton          |
| Auth           | Appwrite Account (email/password sessions); roles stored in `users` table row (prefs fallback)                          |
| Config         | `static/js/config.js` → `window.REConfig` (endpoint/projectId/databaseId/tables) — placeholders unfilled                 |
| Seeding        | Idempotent demo data auto-seeded on first `RE.init()` when `users` table is empty                                      |

### Pages
`index` (hero + featured) · `properties` (search/filter/paginate) · `property` (detail, carousel, reviews, booking sidebar) ·
`login` · `register` · `dashboard` (role redirect) · `landlord-dashboard` · `property-form` (add/edit + image upload) ·
`tenant-dashboard` · `admin-dashboard` · `admin-users`.

### Data model (TablesDB)
- `users`: account_id · username · email · phone · full_name · role · is_active · created_at
- `properties`: landlord_id · title · description · address · city · state · pincode · price · property_type · bedrooms · bathrooms · area_sqft · amenities · status · is_furnished · images(JSON) · created_at · updated_at
- `bookings`: property_id · tenant_id · start_date · end_date · message · status · total_amount · created_at · updated_at
- `reviews`: property_id · tenant_id · rating · comment · created_at

### Roles
`admin`, `landlord` (owner), `tenant`. Registration offers tenant or landlord; admin only via seed.

---

## 2. Existing Features (working)

- Appwrite login/register (email/password, role redirect, deactivated-user block)
- Browse + keyword/city/type/bedroom/price filters + pagination
- Property detail (carousel, specs, amenities, reviews, listed-by)
- Tenant booking request (duplicate pending guard), landlord approve/reject, property → `rented`
- Reviews (only after approved booking, or admin), update allowed
- Landlord property CRUD with multi-image upload → compressed data URLs
- Delete property cascades its bookings + reviews
- Admin dashboard (stats, recent users/properties), admin user deactivate/activate
- Flash messages (localStorage), role-guard redirects, offline "not configured" notice
- Idempotent Sierra Leone demo seed (admin/landlord/tenant, 16 sample props, 2 bookings, 2 reviews, each sample clearly badged "Sample Listing")

---

## 3. Broken Features (confirmed by code inspection)

1. **Landlord approve/reject is dead.** `landlord.js:47` converts the booking id with `Number(...)`; ids are now strings (`book1`), so `Number('book1')` → `NaN` → `Store.findBooking(NaN)` → `null` → buttons no-op.
2. **Landlord delete property is dead.** `landlord.js:95` does the same `Number(...)` on string property ids (`prop1`).
3. **Duplicates on same property.** Approving a second pending booking for an already-`rented` property is possible (no guard); two tenants can end up "rented".
4. **Guest discovery leaks non-available listings.** `Store.publicProperties()` returns both `available` and `pending`; `properties.html`/`index.html` show `pending` listings to guests. Discovery should only expose `available`.

---

## 4. Security / Authorization Issues

- **IDOR — property edit:** `property-form.js` loads and edits any property by id with **no ownership check** (any landlord can edit another landlord's property).
- **IDOR — property delete guarded only client-side** (in `landlord.js`); table permissions are open to `any` (All Users) by design, so enforcement depends on client code.
- **All-Users table permissions:** the live Cloud schema uses `any` full CRUD (the backend rejects the `users` role at table level, and the logged-out first-load seed needs create). Anyone can read every table (emails/phones/tenant ids) and — because no server enforces rules — could write too. Acceptable only as a labelled demo/deployment tradeoff; README must advise tightening for production.
- **No server-side enforcement:** the app has no backend; role/ownership rules cannot be enforced outside the browser. Documented limitation — production requires an API layer with Appwrite permissions/backend SDK.
- **No input server validation**, only client-side checks; acceptable for demo, must be documented.
- Images are stored as data URLs inside table rows → size/quota risk; acceptable for demo.

---

## 5. UX Issues

- **No loading state** on any page (blank during `RE.init()`).
- Tenant dashboard is only a flat bookings table — does not answer "what is my current rental / what is due".
- Owner dashboard has **no metrics** (available/occupied/pending/active rentals) and no rental history.
- **Navbar is role-agnostic** — one menu for everyone; no My Properties / Saved / Applications / My Rental.
- No **saved/favourite properties**.
- Empty states exist for bookings/properties, but not for reviews or notifications.
- `showFlashes` in `main.js` contains a duplicated render branch (dead duplication).
- No notifications, messaging, or admin property/report surfaces at all.
- Hero claims "Verified Listings" but no verification process exists (misleading copy).
- No Open Graph / SEO meta for shareable property pages.

---

## 6. Database Gaps

- No `rentals` (lease) entity → approval does nothing beyond flipping flags.
- No saved-property entity.
- No notifications entity.
- No payments / rent-schedule ledger.
- No reports (property/user) entity.
- No verification state on properties or users; `status: 'pending'` on a property is conflated with "pending review" but no workflow exists.
- No audit log.

---

## 7. Recommended Implementation Plan (priority order)

**Phase 2 — Architecture/data & security fixes (`store.js`, `config.js`):**
- Add tables: `rentals`, `saved_properties`, `notifications`, `payments`, `reports`.
- Fix the two `Number()` id bugs; string-safe id handling everywhere.
- Property edit ownership guard; approve-bookings duplicate/status guards.
- `publicProperties` → only `available` for discovery.
- Rental lifecycle: approve → create real `rental`, property → `rented`, auto-reject competing pending bookings, notify all parties.
- Rent calculation helper (due date/status/amount from actual data; only real recorded payments are stored — no fabricated finances).

**Phase 3 — Role experiences & UX:**
- Role-aware navbar links; owner metrics + active rentals + rental history; tenant "My Rental" + rent status + next-due card; saved properties; notifications surface; favorites toggle on property page.

**Phase 4 — Admin/trust:**
- Property verification workflow (admin marks unverified/verified/rejected), stripping the misleading hero copy; report-property/user flow + admin moderation view (minimal).

**Phase 5 — Polish:**
- Loading spinners/skeletons, dedupe `showFlashes`, empty/error state audit, mobile pass, OG meta on property page.

**Phase 6 — Sierra Leone look & feel (demo imagery/localization):**
- Curated Pexels gallery per sample listing (verified live URLs; nothing slum-stereotyping), expanded seed to 16 properties across SL communities (community stored in `pincode`, city/state kept) with fake street addresses removed from demo data.
- Cards: lazy-loaded images, community location ("Wilberforce, Freetown"), "Sample Listing" badge; detail page: thumbnail strip + fullscreen lightbox, demo-explanation banner, low-res Og/SEO fallback image.
- Hero replaced the plain gradient with a tropical West-African home photo + overlay; featured heading/localized copy; form "Pincode" relabelled "Community / Area".
- Neutral "Property image unavailable" placeholder (no fake photographs); keyword search now also matches community (`pincode`); no Appwrite Storage bucket needed — photos live on rows.

**Phase 6 — Testing & docs:**
- Extend the Node smoke harness to the full lifecycle E2E (owner creates property → tenant applies → owner approves → rental + occupied → tenant rent status → rent recorded); run; fix regressions.
- Write `docs/PROPERTY_PLATFORM_RULES.md`; update README schema/permissions; final report.

**Explicitly out of scope (honest):** payment gateway, real-time messaging, server-side enforcement (no backend exists), legal rent regulations, document storage.

---

## 8. Key Rules Carried Into Implementation

- Only real application state drives workflows; payments are only recorded when actually received.
- Rental records are created by the system on approval — never by the frontend alone.
- A property rented to one tenant is never simultaneously rented to another (status guards + competing-request rejection).
- Ownership checks are enforced on every mutating action regardless of table permissions.
- Demo seed data remains clearly identified and idempotent.
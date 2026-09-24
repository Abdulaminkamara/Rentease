# RentEase — Property Platform Rules (authoritative)

These are the authoritative business rules. Every future feature must follow them.
Enforcement today is **client-side within a demo architecture** (see "Enforcement" at the end);
production deployment requires the same rules implemented server-side (Appwrite permissions + backend functions).

---

## 1. Roles

| Role     | Meaning                                                                |
|----------|------------------------------------------------------------------------|
| `admin`    | Platform-level management (users, verification, reports, moderation). |
| `landlord` | Property OWNER: lists and manages their own properties and rentals. |
| `tenant`   | RENTER: discovers properties, applies, holds a rental, pays/stays current. |

An account has exactly one role at a time. Role is stored in the `users` row and mirrored to
Appwrite prefs (fallback).

---

## 2. Property lifecycle

```
landlord creates property  ->  status available / pending (review) / inactive
   available  ->  tenant applies (bookings/application, status pending)
   application approved -> rental created (status active) AND property -> rented
   rented property can never be rented to another tenant simultaneously
   inactive = hidden from discovery, existing rentals unaffected
```

Valid property statuses: `available`, `pending`, `inactive`, `rented`.
- `rented` is set **only by the system** on application approval — never by form input.
- A property with an active rental or an approved application cannot be approved again.

Property verification (independent of status): `unverified`, `verified`, `rejected`; set by admins.
Guests/tenants see a "Verified listing" badge only when `verification === 'verified'`.

### Owner
- Can create, edit, publish/unpublish, archive-in-active, upload/delete images on **their own** properties.
- Cannot edit/delete another owner's property.
- Can see applications and rentals for their own properties.

### Tenant
- Cannot create or edit properties.
- Can apply to `available` properties only.
- Cannot hold two applications for the same property (one active request at a time).

---

## 3. Application (booking) workflow

Statuses: `pending` → `approved` | `rejected` | `cancelled`.

| Actor    | Allowed actions                                                      |
|----------|----------------------------------------------------------------------|
| Tenant   | Submit request for an `available` property; withdraw own `pending` request. |
| Landlord | Approve or reject requests on own properties.                        |
| System   | On approval: create the rental, set property `rented`, and auto-`reject` every other **pending** request on that property. |

Guards:
- Approval is refused if the property is already rented or has an active rental.
- Approval is refused if the request is not `pending`.

---

## 4. Rental / lease lifecycle

Statuses: `active` (created by system on approval). `ended`/`terminated` are future extensions.

A rental is created **only** by the approval action in the data layer — never by frontend state.
A rental links: property, tenant, landlord, originating application, lease dates, rent amount,
payment frequency (monthly), deposit, terms.

- One property → at most one `active` rental.
- One tenant → at most one `active` rental on a given property.

---

## 5. Rent schedule & payments (no fabricated finances)

- Periods are derived: monthly from `rentals.start_date` (30-day periods).
- No scheduled rows are fabricated at seed/approval time.
- `payments` rows are created **only when money is actually received** (landlord records the
  receipt: `paid_at`, reference). Nothing else counts as paid.
- Rent status is computed on demand: `upcoming`, `due_soon`, `due`, `paid`, `partially_paid`,
  `overdue`, `lease ended` — from recorded payments only.
- Next due date/amount and "due in N days / overdue N days" are derived from the same data.

---

## 6. Discovery & privacy

- Only `status === 'available'` properties are publicly discoverable, searchable, or shown on
  the home page. `pending`, `inactive`, `rented` are never exposed to guests or tenants.
- Private owner information (phone, email) is not rendered publicly; tenant names shown on
  reviews are the account full names within the demo UI.
- Saved properties are private to the user.

---

## 7. Notifications (real events only)

Triggered only by actual system events:
- Tenant: application submitted (owner notified) · approved · rejected · rental confirmed ·
  rent due soon / overdue (derived, deduped per period).
- Owner: new application · application withdrawn · new active rental.
- Admin: new report received.
Notifications are stored per-user (`notifications`), with read/unread.

---

## 8. Reports & moderation

- Tenants/guests may report a listing (`suspicious_listing`, `incorrect_information`,
  `duplicate_listing`, `inappropriate_content`, `suspected_scam`, `other`).
- A report is a *signal for review* — it does not auto-classify anyone as fraudulent.
- Admins review and mark reports resolved. Admins may also verify/reject property listings.
- Reviewing listings, verifying properties and resolving reports are admin-only.

---

## 9. Reviews

- Only tenants with an **approved application** on a property (or admins) may review it.
- One review per tenant per property; it can be updated, not duplicated.

---

## 10. Deactivation

- Admins may deactivate/activate users. Deactivated users cannot maintain a session
  (login and `Session.refresh()` both respect `users.is_active`).

---

## 11. Enforcement & production caveat

In this build, authorization and ownership checks run in the browser (`store.js` +
page scripts) because the app has no backend server. On the live Cloud backend the
tables ship with **`any` (All Users) full CRUD** — see "Stage 2: live backend" below for
why — so **for production this is insufficient**: the same rules must be enforced
server-side via Appwrite permissions/attributes, backend SDK roles, and API functions so
the client-side checks are never trusted as the sole control.

### Stage 2 - approved hardening

Client-side (implemented): registration password policy aligned with Appwrite (min 8);
landlords record actual rent receipts with reference (replaces any UI-only claim of
payment); tenants see a derived Payment History; admins can export users to CSV;
property pages expose Open Graph/SEO meta.

### Stage 2: live backend (provisioned + verified)

The project's Appwrite Cloud backend is now live (project `6ab57b9a00083af710b3`,
database `6ab57cc00006dfad73ba`): all nine tables with their columns, 18 FK-style
indexes, and the three demo accounts are created; the tables are left empty so the app
auto-seeds on first load. Verification (node-appwrite v29 + `appwrite@26` web SDK):
- JSON serialised query objects are required (this backend rejects raw `limit(5000)`
  strings with `Invalid query: Syntax error`); the web SDK produces them, so no app
  change was needed.
- Table-level default permissions on this Cloud TablesDB only accept `any`, `guests`,
  per-user and per-label/document targets — the `users` role is **rejected**
  (`Missing "create" permission for role "users". Only "["any","guests"]" scopes are
  allowed`). Because the first-load seed runs logged out, every table was set to
  `read("any"), create("any"), update("any"), delete("any")` full CRUD. A live probe
  confirmed reads (logged-out and logged-in) and create/update/delete for a logged-in
  client all succeed; this satisfies both seeding and the app's role-gated UI flows.
- Trade-off recorded: `any` CRUD is wider than the original "all logged-in roles"
  design. Acceptance: purely a labelled demo/deployment backend. Remaining
  server-side hardening (still future work): per-role/per-target permissions, Appwrite
  Functions as the only writers for approve/reject/role/payment/verification actions,
  `audit_log`, and email verification. See `docs/IMPLEMENTATION_REPORT_STAGE2.md`.
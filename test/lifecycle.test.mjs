/* RentEase lifecycle E2E harness (data layer only).
   Loads the real static/js/config.js + static/js/store.js in a VM with a
   mocked Appwrite SDK (in-memory), then exercises the full lifecycle:
   seed -> discovery -> booking -> approval (rental + rivalry) -> payments
   -> withdraw -> reports. Run: node test/lifecycle.test.mjs
   No network, no browser: store.js is fully headless. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
let failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('  ok  - ' + label); }
  else { failed++; console.error('  FAIL - ' + label); }
}
function section(name) { console.log('\n# ' + name); }

/* ---------------- mock Appwrite SDK ---------------- */
function makeLocalStorage() {
  const store = Object.create(null);
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
  };
}

const Appwrite = {
  ID: { unique: () => 'u' + Math.random().toString(36).slice(2) },
  Query: { limit: (n) => ({ method: 'limit', value: n }) },
  Client: class {
    setEndpoint(e) { this.endpoint = e; return this; }
    setProject(p) { this.project = p; return this; }
  },
  Account: class {
    constructor(client) { this.client = client; this.accounts = {}; this.sessionEmail = null; }
    async create({ userId, email, password, name }) {
      if (this.accounts[email]) throw { code: 409, message: 'User already exists' };
      this.accounts[email] = { $id: userId, email, password, name };
      return {};
    }
    async createEmailPasswordSession({ email, password }) {
      const a = this.accounts[email];
      if (!a || a.password !== password) throw { code: 401, message: 'Invalid credentials' };
      this.sessionEmail = email;
      return {};
    }
    async updatePrefs(prefs) { this.prefs = prefs; return {}; }
    async deleteSession() { this.sessionEmail = null; return {}; }
    async get() {
      if (!this.sessionEmail || !this.accounts[this.sessionEmail]) {
        throw { code: 401, message: 'User not found' };
      }
      const a = this.accounts[this.sessionEmail];
      return { $id: a.$id, email: a.email, name: a.name, prefs: this.prefs || {} };
    }
  },
  Storage: class {
    constructor(client) { this.client = client; }
    async createFile({ bucketId, fileId, file }) {
      if (!this.client.files) this.client.files = {};
      this.client.files[fileId] = file;
      return { $id: fileId };
    }
  },
  TablesDB: class {
    constructor() { this.data = Appwrite.tables; }
    row(table) { if (!this.data[table]) this.data[table] = {}; return this.data[table]; }
    async createRow({ tableId, rowId, data }) {
      const m = this.row(tableId);
      if (m[rowId]) throw { code: 409, message: 'Document already exists' };
      const row = Object.assign({ $id: rowId }, data);
      m[rowId] = row;
      return row;
    }
    async listRows({ tableId }) {
      return { rows: Object.values(this.row(tableId)) };
    }
    async updateRow({ tableId, rowId, data }) {
      const m = this.row(tableId);
      if (!m[rowId]) throw { code: 404, message: 'Document not found' };
      m[rowId] = Object.assign({}, m[rowId], data, { $id: rowId });
      return m[rowId];
    }
    async deleteRow({ tableId, rowId }) { delete this.row(tableId)[rowId]; }
  },
  /* Row data shared by every TablesDB instance, so tests can inspect and
     remove backend rows directly. */
  tables: {}
};

/* ---------------- load app code ---------------- */
const sandbox = {
  Appwrite,
  localStorage: makeLocalStorage(),
  console,
  setTimeout,
  clearTimeout,
  URL,
  Blob
};
sandbox.window = sandbox;
const context = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'static/js/config.js'), 'utf8'), context, { filename: 'config.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'static/js/store.js'), 'utf8'), context, { filename: 'store.js' });

const RE = sandbox.RentEase;
const Store = RE.Store;
const Session = RE.Session;

await RE.init();

section('Seed (idempotent demo data)');
ok(Store.users.length === 9, '9 demo users seeded (got ' + Store.users.length + ')');
ok(Store.users.filter((u) => u.role === 'landlord').length === 4, '4 demo landlords seeded');
ok(Store.users.filter((u) => u.role === 'tenant').length === 4, '4 demo tenants seeded');
ok(Store.properties.length === 30, '30 demo properties seeded');
ok(Store.bookings.length === 6, '6 demo bookings seeded');
ok(Store.rentals.length === 2, '2 demo rentals seeded');
ok(Store.payments.length === 2, '2 recorded demo payments seeded');
ok(RE.offline !== true, 'online mode with the real config');

section('Discovery / privacy');
const pub = Store.publicProperties();
ok(pub.length === 27, 'only 27 available properties are public (got ' + pub.length + ')');
ok(pub.every((p) => p.status === 'available'), 'public list contains no non-available status');

section('Sample data reaches the browse page');
{
  const demoLandlords = ['landlord', 'landlord2', 'landlord3', 'landlord4'];
  const listed = Store.properties.filter((p) => Store.isDemoProperty(p));
  ok(listed.length === 30, 'every sample property is badged as a Sample Listing');
  ok(pub.every((p) => Store.isDemoProperty(p)), 'no public listing escapes the Sample Listing badge');
  ok(
    demoLandlords.every((id) => Store.propertiesByLandlord(id).length > 0),
    'each demo landlord has properties of their own'
  );
  const provinces = new Set(Store.properties.map((p) => p.city));
  ok(
    ['Freetown', 'Bo', 'Kenema', 'Makeni', 'Port Loko', 'Koidu', 'Kabala', 'Lunsar', 'Magburaka', 'Waterloo'].every((c) => provinces.has(c)),
    'listings cover multiple Sierra Leonean cities'
  );
  ok(
    Store.properties.every((p) => p.title && p.description && p.price > 0 && Array.isArray(p.images) && p.images.length > 0),
    'every listing has a title, description, price and photos'
  );
  ok(
    Store.properties.filter((p) => p.status === 'available').length >= 9,
    'at least one full page of 9 available listings exists'
  );
  /* Re-seeding must not reappear as a duplicate set of rows. */
  ok(new Set(Store.properties.map((p) => p.id)).size === 30, 'property ids are unique');
}

section('Ownership guard');
const landlord = Store.findUser('landlord');
const tenant = Store.findUser('tenant');
ok(Store.canManageProperty(landlord, Store.findProperty('prop1')), 'landlord can manage own property');
ok(!Store.canManageProperty(tenant, Store.findProperty('prop1')), 'tenant cannot manage someone else\u2019s property');
ok(Store.canManageProperty(landlord, Store.findProperty('prop3')), 'landlord owns most seeded properties');
ok(
  Store.canManageProperty(Store.findUser('landlord2'), Store.findProperty('prop19')) &&
    !Store.canManageProperty(Store.findUser('landlord2'), Store.findProperty('prop1')),
  'a second landlord manages only their own properties'
);

section('Rent status (derived, recorded payments only)');
const rent1 = Store.rentals.find((r) => r.id === 'rent1');
{
  const st = RE.rentStatus(rent1);
  ok(st.status === 'paid', 'seeded rental is paid in full for current period (got ' + st.status + ')');
  ok(Store.paymentsForRentalSum('rent1') === 1800, 'paymentsForRentalSum = 1800');
}
{
  const rent2 = Store.rentals.find((r) => r.id === 'rent2');
  const st = RE.rentStatus(rent2);
  ok(st.status === 'partial', 'second seeded rental shows a part payment (got ' + st.status + ')');
  ok(Store.paymentsForRentalSum('rent2') === 2000, 'paymentsForRentalSum = 2000');
}

section('Booking -> approval -> rental -> rivalry');
const uuid = () => 'x' + Math.random().toString(36).slice(2, 10);
const t2 = await Store.addUser({
  id: uuid(),
  account_id: uuid(),
  username: 'rival-user',
  email: 'rival' + uuid() + '@demo.com',
  phone: '',
  full_name: 'Rival Tenant',
  role: 'tenant',
  is_active: true
});
const rivalBooking = await Store.addBooking({
  property_id: 'prop6',
  tenant_id: t2.id,
  start_date: RE.isoDaysFromNow(5),
  end_date: RE.isoDaysFromNow(65),
  message: 'rival request',
  status: 'pending',
  total_amount: 5500
});
const book1 = Store.findBooking('book1');
const noteCountBefore = Store.notifications.length;
const createdRental = await Store.approveBooking(book1);
ok(Store.findProperty('prop6').status === 'rented', 'approval sets property to rented');
ok(createdRental && createdRental.status === 'active', 'approval creates an active rental');
ok(Store.findBooking('book1').status === 'approved', 'approval approves the booking');
ok(Store.findBooking(rivalBooking.id).status === 'rejected', 'rival pending request auto-rejected');
ok(Store.notifications.length >= noteCountBefore + 3, 'tenant/landlord/rival all notified');

let doubleRejected = true;
try { await Store.approveBooking(book1); doubleRejected = false; } catch (e) { /* expected */ }
ok(doubleRejected, 'double-approval is rejected by guards');

section('Record payment (real receipt only)');
const prop6Rental = Store.rentals.find((r) => r.property_id === 'prop6' && r.status === 'active');
const payStart = prop6Rental.start_date;
await Store.addPayment({
  rental_id: prop6Rental.id,
  amount: 5500,
  period_start: payStart,
  period_end: RE.isoDaysFromNow(35),
  reference: 'DBB-TRANSFER-001',
  recorded_by: 'landlord',
  paid_at: RE.nowISO()
});
ok(Store.paymentsForRentalSum(prop6Rental.id) === 5500, 'payment recorded + summed');
{
  const st = RE.rentStatus(prop6Rental);
  ok(st.status === 'paid', 'rent status flips to paid after recording (got ' + st.status + ')');
}

section('Withdraw pending request');
const book2 = await Store.addBooking({
  property_id: 'prop2',
  tenant_id: tenant.id,
  start_date: RE.isoDaysFromNow(10),
  end_date: RE.isoDaysFromNow(70),
  message: 'withdraw me',
  status: 'pending',
  total_amount: 3500
});
await Store.cancelBooking(book2);
ok(Store.findBooking(book2.id).status === 'cancelled', 'pending request withdrawn by tenant');

section('Reports -> admin notification');
const notesBefore = Store.notifications.length;
await Store.addReport({
  reporter_id: 'guest',
  target_type: 'property',
  target_id: 'prop3',
  reason: 'suspicious_listing',
  details: 'looks fabricated',
  status: 'open'
});
ok(Store.reportsOpen().length >= 1, 'open report is visible to admins');
ok(Store.notifications.length >= notesBefore + 1, 'admins notified of the report');

section('Idempotent re-seed');
{
  const before = {
    users: Store.users.length,
    properties: Store.properties.length,
    bookings: Store.bookings.length,
    reviews: Store.reviews.length,
    rentals: Store.rentals.length,
    payments: Store.payments.length,
    notifications: Store.notifications.length
  };
  await RE.seedDemo();
  await Store.loadAll();
  ok(Store.users.length === before.users, 'seeding again does not duplicate users');
  ok(Store.properties.length === before.properties, 'seeding again does not duplicate properties');
  ok(Store.bookings.length === before.bookings, 'seeding again does not duplicate bookings');
  ok(Store.rentals.length === before.rentals, 'seeding again does not duplicate rentals');
  ok(Store.payments.length === before.payments, 'seeding again does not duplicate payments');
}

section('Re-seed is per-row, so one missing listing never blanks the browse page');
{
  /* The old gate only seeded when the users table was completely empty, so a
     single self-registered account left the browse page empty forever. */
  delete Appwrite.tables['properties']['prop17'];
  await RE.seedDemo();
  await Store.loadAll();
  ok(Store.findProperty('prop17') !== null, 'a missing sample listing is restored on re-seed');
  ok(Store.properties.length === 30, 'restoring one listing does not duplicate the rest (got ' + Store.properties.length + ')');
  /* 27 available, less prop6 which this harness deliberately rented above. */
  ok(Store.publicProperties().length === 26, 'browse page is fully populated again (got ' + Store.publicProperties().length + ')');
}

section('Summary');
console.log('\npassed: ' + passed);
console.log('failed: ' + failed);
process.exit(failed ? 1 : 0);
/* ============================================================
   RentEase - Data layer backed by Appwrite (2.x / TablesDB)
   ============================================================
   Authentication is handled by Appwrite's Account service and all
   app data (users, properties, bookings, reviews) lives in an
   Appwrite TablesDB database instead of localStorage.

   Behaviour:
   - RE.init() loads every table into an in-memory cache so page
     scripts can keep working largely synchronously once it has
     resolved. Every page MUST await RE.init() before reading data.
   - Mutations (add/update/delete) are async and update both the
     Appwrite tables and the in-memory cache.
   - Flash messages stay in localStorage (short-lived UI notices).
   - First load: if the users table is empty the demo data is
     seeded automatically (idempotent).
   ============================================================ */
(function () {
  'use strict';

  var KEYS = { FLASH: 'rentease_flash' };

  var client = null;
  var account = null;
  var tablesDB = null;
  var initPromise = null;
  var offline = false;
  var currentUser = null;

  /* ---------------- config helpers ---------------- */
  function configure() {
    return window.REConfig || {};
  }

  function isConfigured() {
    var c = configure();
    return !!(c.endpoint && c.projectId && c.databaseId && c.tables);
  }

  function tableId(name) {
    var t = configure().tables;
    return t && t[name] ? t[name] : name;
  }

  /* ---------------- date + misc helpers ---------------- */
  function nowISO() {
    return new Date().toISOString();
  }

  function isoDaysFromNow(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function isoDaysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }

  function eq(a, b) {
    return String(a) === String(b);
  }

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  /* Generates an inline SVG placeholder as a data URL used whenever a
     property has no photo: a neutral "Property image unavailable" card
     (never a fake photograph presented as if it were the real home). */
  function placeholderImage(title, w, h) {
    w = w || 800;
    h = h || 600;
    var cx = Math.round(w / 2);
    var cy = Math.round(h / 2);
    var house =
      '<path d="M' + (cx - 26) + ' ' + (cy + 14) + ' v-' + 11 + ' l' + 26 + ' -' + 20 + ' l' + 26 + ' ' + 20 + ' v' + 11 + ' z" ' +
      'fill="none" stroke="#b6c3d4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M' + (cx - 9) + ' ' + (cy + 14) + ' v-' + 10 + ' h' + 18 + ' v' + 10 + '" ' +
      'fill="none" stroke="#b6c3d4" stroke-width="3" stroke-linecap="round"/>';
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<rect width="' + w + '" height="' + h + '" fill="#f8fafc"/>' + house +
      '<text x="50%" y="' + Math.round(cy + 46) + '" font-family="Arial, sans-serif" font-size="' +
      Math.max(12, Math.round(Math.min(w, 420) / 30)) + '" fill="#94a3b8" text-anchor="middle">Property image unavailable</text>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ---------------- row <-> object mappers ---------------- */
  function rowToUser(r) {
    return {
      id: r.$id,
      account_id: r.account_id != null ? r.account_id : r.$id,
      username: r.username || '',
      email: r.email || '',
      phone: r.phone || '',
      full_name: r.full_name || '',
      role: r.role || 'tenant',
      is_active: r.is_active !== false,
      created_at: r.created_at || ''
    };
  }

  function userData(u) {
    return {
      account_id: u.account_id || u.id,
      username: u.username,
      email: u.email,
      phone: u.phone,
      full_name: u.full_name,
      role: u.role,
      is_active: u.is_active !== false,
      created_at: u.created_at || nowISO()
    };
  }

  function rowToProperty(r) {
    return {
      id: r.$id,
      landlord_id: r.landlord_id,
      title: r.title,
      description: r.description,
      address: r.address,
      city: r.city,
      state: r.state,
      pincode: r.pincode || '',
      price: Number(r.price) || 0,
      property_type: r.property_type,
      bedrooms: Number(r.bedrooms) || 1,
      bathrooms: Number(r.bathrooms) || 1,
      area_sqft: r.area_sqft,
      amenities: r.amenities || '',
      status: r.status,
      is_furnished: !!r.is_furnished,
      images: r.images || [],
      verification: r.verification || 'unverified',
      created_at: r.created_at || '',
      updated_at: r.updated_at || ''
    };
  }

  function propertyData(p) {
    return {
      landlord_id: p.landlord_id,
      title: p.title,
      description: p.description,
      address: p.address,
      city: p.city,
      state: p.state,
      pincode: p.pincode || '',
      price: Number(p.price) || 0,
      property_type: p.property_type,
      bedrooms: Number(p.bedrooms) || 1,
      bathrooms: Number(p.bathrooms) || 1,
      area_sqft: p.area_sqft,
      amenities: p.amenities || '',
      status: p.status,
      is_furnished: !!p.is_furnished,
      images: p.images || [],
      verification: p.verification || 'unverified',
      created_at: p.created_at || nowISO(),
      updated_at: nowISO()
    };
  }

  function rowToBooking(r) {
    return {
      id: r.$id,
      property_id: r.property_id,
      tenant_id: r.tenant_id,
      start_date: r.start_date,
      end_date: r.end_date,
      message: r.message || '',
      status: r.status,
      total_amount: Number(r.total_amount) || 0,
      created_at: r.created_at || '',
      updated_at: r.updated_at || ''
    };
  }

  function bookingData(b) {
    return {
      property_id: b.property_id,
      tenant_id: b.tenant_id,
      start_date: b.start_date,
      end_date: b.end_date,
      message: b.message || '',
      status: b.status,
      total_amount: Number(b.total_amount) || 0,
      created_at: b.created_at || nowISO(),
      updated_at: nowISO()
    };
  }

  function rowToReview(r) {
    return {
      id: r.$id,
      property_id: r.property_id,
      tenant_id: r.tenant_id,
      rating: Number(r.rating) || 0,
      comment: r.comment || '',
      created_at: r.created_at || ''
    };
  }

  function reviewData(rv) {
    return {
      property_id: rv.property_id,
      tenant_id: rv.tenant_id,
      rating: Number(rv.rating) || 0,
      comment: rv.comment || '',
      created_at: rv.created_at || nowISO()
    };
  }

  function rowToRental(r) {
    return {
      id: r.$id,
      property_id: r.property_id,
      tenant_id: r.tenant_id,
      landlord_id: r.landlord_id,
      booking_id: r.booking_id || '',
      start_date: r.start_date,
      end_date: r.end_date,
      rent_amount: Number(r.rent_amount) || 0,
      payment_frequency: r.payment_frequency || 'monthly',
      deposit: Number(r.deposit) || 0,
      terms: r.terms || '',
      status: r.status,
      created_at: r.created_at || '',
      updated_at: r.updated_at || ''
    };
  }

  function rentalData(r) {
    return {
      property_id: r.property_id,
      tenant_id: r.tenant_id,
      landlord_id: r.landlord_id,
      booking_id: r.booking_id || '',
      start_date: r.start_date,
      end_date: r.end_date,
      rent_amount: Number(r.rent_amount) || 0,
      payment_frequency: r.payment_frequency || 'monthly',
      deposit: Number(r.deposit) || 0,
      terms: r.terms || '',
      status: r.status,
      created_at: r.created_at || nowISO(),
      updated_at: nowISO()
    };
  }

  function rowToSaved(r) {
    return { id: r.$id, user_id: r.user_id, property_id: r.property_id, created_at: r.created_at || '' };
  }

  function savedData(s) {
    return { user_id: s.user_id, property_id: s.property_id, created_at: s.created_at || nowISO() };
  }

  function rowToNotification(r) {
    return {
      id: r.$id,
      user_id: r.user_id,
      type: r.type || 'info',
      title: r.title || '',
      message: r.message || '',
      link: r.link || '',
      read_at: r.read_at || '',
      created_at: r.created_at || ''
    };
  }

  function notificationData(n) {
    return {
      user_id: n.user_id,
      type: n.type || 'info',
      title: n.title || '',
      message: n.message || '',
      link: n.link || '',
      read_at: n.read_at || '',
      created_at: n.created_at || nowISO()
    };
  }

  function rowToPayment(r) {
    return {
      id: r.$id,
      rental_id: r.rental_id,
      amount: Number(r.amount) || 0,
      period_start: r.period_start,
      period_end: r.period_end,
      reference: r.reference || '',
      recorded_by: r.recorded_by || '',
      paid_at: r.paid_at || ''
    };
  }

  function paymentData(p) {
    return {
      rental_id: p.rental_id,
      amount: Number(p.amount) || 0,
      period_start: p.period_start,
      period_end: p.period_end,
      reference: p.reference || '',
      recorded_by: p.recorded_by || '',
      paid_at: p.paid_at || nowISO()
    };
  }

  function rowToReport(r) {
    return {
      id: r.$id,
      reporter_id: r.reporter_id,
      target_type: r.target_type,
      target_id: r.target_id,
      reason: r.reason,
      details: r.details || '',
      status: r.status || 'open',
      created_at: r.created_at || ''
    };
  }

  function reportData(rp) {
    return {
      reporter_id: rp.reporter_id,
      target_type: rp.target_type,
      target_id: rp.target_id,
      reason: rp.reason,
      details: rp.details || '',
      status: rp.status || 'open',
      created_at: rp.created_at || nowISO()
    };
  }

  /* Replace an object in a list (by its id) or push it. */
  function upsert(list, obj) {
    var idx = list.findIndex(function (x) { return eq(x.id, obj.id); });
    if (idx !== -1) {
      list[idx] = obj;
      return list[idx];
    }
    list.push(obj);
    return obj;
  }

  /* ---------------- notifications + promise helpers ---------------- */
  var DAY = 86400000;

  function chainOf(tasks) {
    return tasks.reduce(function (p, task) {
      return p.then(function () { return task; });
    }, Promise.resolve());
  }

  function notify(userId, type, title, message, link) {
    if (!userId) { return Promise.resolve(null); }
    return Store.addNotification({
      user_id: userId,
      type: type || 'info',
      title: title || '',
      message: message || '',
      link: link || ''
    });
  }

  /* ---------------- rent schedule calculation ----------------
     All headless/derived: no scheduled rows are fabricated. Only
     *recorded* payments (paid_at set when money was received) are
     stored. Periods are monthly (30 days) from the rental start. */
  function isoTodayUtc() {
    return new Date().toISOString().slice(0, 10);
  }

  function dayAt(startDate, addDays) {
    return new Date(Date.parse(startDate + 'T00:00:00Z') + addDays * DAY).toISOString().slice(0, 10);
  }

  function periodForDate(startDate, date) {
    var k = Math.floor((Date.parse(date + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / (30 * DAY));
    if (k < 0) { k = 0; }
    return { k: k, start: dayAt(startDate, k * 30), end: dayAt(startDate, (k + 1) * 30) };
  }

  function rentStatus(rental) {
    var today = isoTodayUtc();
    var start = rental.start_date;
    var end = rental.end_date || today;
    var amount = Number(rental.rent_amount) || 0;
    var nowK = periodForDate(start, today).k;
    var endK = periodForDate(start, end).k;
    var limitK = Math.max(nowK, endK);
    var paid = Store.paymentsForRental(rental.id);
    var periods = [];

    for (var k = 0; k <= limitK; k++) {
      var pStart = dayAt(start, k * 30);
      var recorded = paid.filter(function (p) { return eq(p.period_start, pStart); });
      var paidAmt = recorded.reduce(function (a, p) { return a + Number(p.amount); }, 0);
      var st = paidAmt >= amount ? 'paid' : (paidAmt > 0 ? 'partial' : 'unpaid');
      periods.push({ k: k, start: pStart, end: dayAt(start, (k + 1) * 30), amount: amount, paid: paidAmt, status: st });
    }

    var cur = periodForDate(start, today);
    var current = null;
    for (var i = 0; i < periods.length; i++) {
      if (periods[i].start === cur.start) { current = periods[i]; break; }
    }
    if (!current) { current = periods[periods.length - 1]; }

    var next = null;
    for (var j = 0; j < periods.length; j++) {
      if (periods[j].status !== 'paid' && periods[j].end > today) { next = periods[j]; break; }
    }

    var fromStart = Math.floor((Date.parse(today + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / DAY);
    var ended = fromStart >= Math.max(0, Math.ceil((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / DAY));
    if (end && today > end) { ended = true; }

    var status = 'upcoming';
    var label = 'Upcoming';
    var overdueDays = 0;
    var dueInDays = 0;

    if (ended) {
      status = 'ended';
      label = 'Lease ended';
    } else if (current && current.paid >= (amount || 1)) {
      status = 'paid';
      label = 'Paid in full';
    } else if (current && current.paid > 0) {
      status = 'partial';
      label = 'Partially paid';
    } else {
      var cp = current || periods[0];
      var daysUntilStart = Math.floor((Date.parse(cp.start + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / DAY);
      if (daysUntilStart > 7) {
        status = 'upcoming';
        label = 'Due in ' + daysUntilStart + ' days';
        dueInDays = daysUntilStart;
      } else if (daysUntilStart > 0) {
        status = 'due_soon';
        label = 'Due in ' + daysUntilStart + ' days';
        dueInDays = daysUntilStart;
      } else {
        overdueDays = -daysUntilStart;
        if (overdueDays >= 7) {
          status = 'overdue';
          label = 'Rent overdue by ' + overdueDays + ' days';
        } else if (overdueDays >= 1) {
          status = 'due';
          label = 'Due';
        } else {
          status = 'due_soon';
          label = 'Due soon';
        }
      }
    }

    if (!next && status !== 'ended' && cur) {
      next = { k: cur.k + 1, start: dayAt(start, (cur.k + 1) * 30), end: dayAt(start, (cur.k + 2) * 30), amount: amount, paid: 0, status: 'unpaid' };
    }

    return {
      periods: periods,
      current: current,
      next: next,
      status: status,
      label: label,
      nextDueDate: next ? next.start : null,
      nextDueAmount: amount,
      paidAmount: current ? current.paid : 0,
      overdueDays: overdueDays,
      dueInDays: dueInDays
    };
  }

  /* ---------------- demo seed data (Sierra Leone) ---------------- */
  function demoUsers() {
    return [
      {
        id: 'admin', account_id: 'admin', username: 'admin',
        email: 'admin@demo.com', password: 'admin123',
        full_name: 'System Administrator', phone: '',
        role: 'admin', created_at: isoDaysAgo(60)
      },
      {
        id: 'landlord', account_id: 'landlord', username: 'demo-landlord',
        email: 'landlord@demo.com', password: 'landlord123',
        full_name: 'Mohamed Kamara', phone: '+232 76 123 456',
        role: 'landlord', created_at: isoDaysAgo(40)
      },
      {
        id: 'tenant', account_id: 'tenant', username: 'demo-tenant',
        email: 'tenant@demo.com', password: 'tenant123',
        full_name: 'Fatmata Sesay', phone: '+232 88 234 567',
        role: 'tenant', created_at: isoDaysAgo(35)
      }
    ];
  }

  /* Builds a Pexels CDN image URL for a demo photo id. Pexels images are
     freely reusable; we use them only as illustrative placeholders for
     sample listings (labelled "Sample Listing" in the UI), never as if
     they were the actual property at the listed address. */
  function px(id, w) {
    return 'https://images.pexels.com/photos/' + id + '/pexels-photo-' + id +
      '.jpeg?auto=compress&cs=tinysrgb&w=' + (w || 1200);
  }

  function demoProperties() {
    return [
      {
        id: 'prop1', landlord_id: 'landlord',
        title: 'Spacious 2-Bedroom Apartment in Wilberforce',
        description: 'A bright and well-ventilated 2-bedroom apartment in the heart of Wilberforce, Freetown. Features a modern lounge, fitted kitchen, tiled floors and a balcony with views over the peninsula. Walking distance to the American Embassy, restaurants and the beach road.',
        address: '', city: 'Freetown', state: 'Western Area', pincode: 'Wilberforce',
        price: 6000, property_type: 'apartment', bedrooms: 2, bathrooms: 2, area_sqft: 950,
        amenities: 'WiFi, Parking, AC, Borehole Water, Generator, Security, Fitted Kitchen', status: 'available', is_furnished: true,
        verification: 'verified',
        images: [px(18153132), px(6980724), px(7712453), px(6908565), px(7534282)],
        created_at: isoDaysAgo(12), updated_at: isoDaysAgo(12)
      },
      {
        id: 'prop2', landlord_id: 'landlord',
        title: 'Cosy Studio near Lumley Beach',
        description: 'Compact self-contained studio a short stroll from Lumley Beach and Aberdeen. Comes with a workspace desk, fast WiFi and weekly housekeeping. Surrounded by popular cafes and supermarkets. Ideal for young professionals and students.',
        address: '', city: 'Freetown', state: 'Western Area', pincode: 'Lumley',
        price: 3500, property_type: 'studio', bedrooms: 1, bathrooms: 1, area_sqft: 420,
        amenities: 'WiFi, AC, Housekeeping, Borehole Water, Security', status: 'available', is_furnished: true,
        images: [px(8762759), px(29012619), px(6782479), px(18033166)],
        created_at: isoDaysAgo(9), updated_at: isoDaysAgo(9)
      },
      {
        id: 'prop3', landlord_id: 'landlord',
        title: '3-Bedroom Family House at Bo',
        description: 'A spacious family house in a quiet neighbourhood close to Bo Commercial Street. Freshly renovated with tiled floors, a large compound, borehole water and ample parking. Located near the Bo Government Hospital and schools.',
        address: '', city: 'Bo', state: 'Southern Province', pincode: 'New London',
        price: 12000, property_type: 'house', bedrooms: 3, bathrooms: 3, area_sqft: 2100,
        amenities: 'Car Parking, Garden, Security, Borehole Water, CCTV, Fenced Compound', status: 'available', is_furnished: true,
        images: [px(7061662), px(30386991), px(6934170), px(7045356), px(33753437)],
        created_at: isoDaysAgo(20), updated_at: isoDaysAgo(20)
      },
      {
        id: 'prop4', landlord_id: 'landlord',
        title: 'Premium Villa at Hill Station',
        description: 'Exclusive villa on Freetown\u2019s Hill Station with a landscaped garden, treated water supply, generator and 24-hour security. Cool climate, stunning views over the bay and close to the Hilton and good schools. Perfect for families or expatriates who value comfort and privacy.',
        address: '', city: 'Freetown', state: 'Western Area', pincode: 'Hill Station',
        price: 18000, property_type: 'villa', bedrooms: 4, bathrooms: 4, area_sqft: 3200,
        amenities: 'Private Garden, Parking, AC, Generator, Borehole Water, CCTV, 24h Security', status: 'pending', is_furnished: true,
        verification: 'verified',
        images: [px(34277690), px(34688219), px(34574606), px(6957081), px(33868434)],
        created_at: isoDaysAgo(6), updated_at: isoDaysAgo(6)
      },
      {
        id: 'prop5', landlord_id: 'landlord',
        title: 'Single Room near Congo Cross',
        description: 'Affordable self-contained room near Congo Cross Market with treated water, WiFi and occasional housekeeping. Popular with students from Fourah Bay College and young workers. Shared compound with a friendly landlord.',
        address: '', city: 'Freetown', state: 'Western Area', pincode: 'Congo Town',
        price: 1800, property_type: 'room', bedrooms: 1, bathrooms: 1, area_sqft: 220,
        amenities: 'WiFi, Borehole Water, CCTV, Housekeeping, Closed Compound', status: 'rented', is_furnished: true,
        images: [px(1974596), px(9899871), px(4221389), px(12329135)],
        created_at: isoDaysAgo(15), updated_at: isoDaysAgo(15)
      },
      {
        id: 'prop6', landlord_id: 'landlord',
        title: '2-Bedroom Flat in Wellington',
        description: 'A comfortable 2-bedroom flat near the Wellington Industrial Area with covered parking, borehole water and a fenced compound. Close to the Freetown highway, the national stadium and major supermarkets. Semi-furnished and ready to move in.',
        address: '', city: 'Freetown', state: 'Western Area', pincode: 'Wellington',
        price: 5500, property_type: 'apartment', bedrooms: 2, bathrooms: 2, area_sqft: 1050,
        amenities: 'Parking, Borehole Water, Security, CCTV, Fenced Compound', status: 'available', is_furnished: false,
        images: [px(12081268), px(27164969), px(13043955), px(6186828)],
        created_at: isoDaysAgo(3), updated_at: isoDaysAgo(3)
      },
      {
        id: 'prop7', landlord_id: 'landlord',
        title: 'Spacious 4-Bedroom Family Home in Juba',
        description: 'A large modern family home in the leafy Juba area with a landscaped garden, covered parking for two cars and a borehole water supply. Airy high-ceilinged rooms keep the house cool. Close to Juba school, supermarkets and the A.J. Momoh road.',
        address: '', city: 'Freetown', state: 'Western Area', pincode: 'Juba',
        price: 22000, property_type: 'house', bedrooms: 4, bathrooms: 3, area_sqft: 2600,
        amenities: 'Private Garden, Parking, AC, Borehole Water, Generator, CCTV, Fenced Compound', status: 'available', is_furnished: true,
        images: [px(15691650), px(38975400), px(6434592), px(6527057), px(15456260)],
        created_at: isoDaysAgo(28), updated_at: isoDaysAgo(28)
      },
      {
        id: 'prop8', landlord_id: 'landlord',
        title: 'Modern 3-Bedroom Apartment in Aberdeen',
        description: 'A contemporary 3-bedroom apartment a short drive from the Aberdeen waterfront and Lumley beach. Open-plan lounge and kitchen, tiled throughout, with a secure gated compound and standby generator. Great for families and professionals based in Freetown.',
        address: '', city: 'Freetown', state: 'Western Area', pincode: 'Aberdeen',
        price: 8500, property_type: 'apartment', bedrooms: 3, bathrooms: 2, area_sqft: 1250,
        amenities: 'WiFi, Parking, AC, Generator, Security, Fitted Kitchen', status: 'available', is_furnished: true,
        images: [px(9308434), px(7546648), px(6903157), px(7045356), px(12329135)],
        created_at: isoDaysAgo(18), updated_at: isoDaysAgo(18)
      },
      {
        id: 'prop9', landlord_id: 'landlord',
        title: 'Furnished 2-Bedroom Apartment Near Lumley',
        description: 'Fully furnished 2-bedroom apartment close to Lumley roundabout, supermarkets and the beach. Comes with kitchen appliances, living-room furniture and backup generator. Ideal for tenants who want to move in with nothing but their bags.',
        address: '', city: 'Freetown', state: 'Western Area', pincode: 'Lumley',
        price: 6500, property_type: 'apartment', bedrooms: 2, bathrooms: 2, area_sqft: 950,
        amenities: 'WiFi, Furnished, AC, Generator, Borehole Water, Security', status: 'available', is_furnished: true,
        images: [px(38865714), px(8134818), px(7712453), px(18033166), px(7031719)],
        created_at: isoDaysAgo(16), updated_at: isoDaysAgo(16)
      },
      {
        id: 'prop10', landlord_id: 'landlord',
        title: 'Family Home in Hill Station',
        description: 'A comfortable family home on Hill Station with a cool breeze, mature tropical trees and stunning views over the peninsula. Borehole water, solar backup and a walled compound. Quiet and secure, close to schools and the Hill Station market.',
        address: '', city: 'Freetown', state: 'Western Area', pincode: 'Hill Station',
        price: 16000, property_type: 'house', bedrooms: 3, bathrooms: 3, area_sqft: 2000,
        amenities: 'Private Garden, Parking, Borehole Water, Solar Backup, Security, Fenced Compound', status: 'available', is_furnished: false,
        images: [px(33868434), px(29012619), px(8135118), px(6908565), px(7534282)],
        created_at: isoDaysAgo(22), updated_at: isoDaysAgo(22)
      },
      {
        id: 'prop11', landlord_id: 'landlord',
        title: 'Modern Compound House in Brookfields',
        description: 'A well-built two-storey house in a kept compound in Brookfields, close to the national stadium and Siaka Stevens Street. Big sitting room, veranda overlooking the yard, and parking for two vehicles. Water and security included.',
        address: '', city: 'Freetown', state: 'Western Area', pincode: 'Brookfields',
        price: 9800, property_type: 'house', bedrooms: 3, bathrooms: 2, area_sqft: 1450,
        amenities: 'Veranda, Parking, Borehole Water, Security, CCTV, Fenced Compound', status: 'available', is_furnished: true,
        images: [px(12919815), px(12740950), px(6980724), px(14631824), px(4221389)],
        created_at: isoDaysAgo(11), updated_at: isoDaysAgo(11)
      },
      {
        id: 'prop12', landlord_id: 'landlord',
        title: '2-Bedroom Apartment in Goderich',
        description: 'A neat 2-bedroom apartment in Goderich with treated water, a standby generator and ample parking. Minutes from the Lumley beach road and Goderich market. A dependable choice for the working single or young couple.',
        address: '', city: 'Freetown', state: 'Western Area', pincode: 'Goderich',
        price: 5200, property_type: 'apartment', bedrooms: 2, bathrooms: 1, area_sqft: 850,
        amenities: 'WiFi, Parking, Generator, Borehole Water, Security', status: 'available', is_furnished: true,
        images: [px(11643330), px(30386991), px(6934170), px(6186828), px(15456260)],
        created_at: isoDaysAgo(14), updated_at: isoDaysAgo(14)
      },
      {
        id: 'prop13', landlord_id: 'landlord',
        title: 'Affordable Family Home in Waterloo',
        description: 'A budget-friendly 3-bedroom family house in Waterloo with a spacious compound, borehole water and garden space. Good road access to Freetown and the airport. A sensible option for families who want more room for less.',
        address: '', city: 'Waterloo', state: 'Western Area', pincode: 'Community Road',
        price: 7000, property_type: 'house', bedrooms: 3, bathrooms: 2, area_sqft: 1300,
        amenities: 'Garden, Parking, Borehole Water, Fenced Compound, Security', status: 'available', is_furnished: false,
        images: [px(27466670), px(1974596), px(27164969), px(9899871), px(6908565)],
        created_at: isoDaysAgo(26), updated_at: isoDaysAgo(26)
      },
      {
        id: 'prop14', landlord_id: 'landlord',
        title: 'Townhouse at Aberdeen Heights',
        description: 'A stylish modern townhouse in the Aberdeen Heights neighbourhood with a sunny terrace, fitted kitchen and walled private parking. Close to hotels, restaurants and the Lumley beach strip. Live in a home that feels finished and cared for.',
        address: '', city: 'Freetown', state: 'Western Area', pincode: 'Aberdeen',
        price: 11000, property_type: 'house', bedrooms: 3, bathrooms: 3, area_sqft: 1700,
        amenities: 'Terrace, Parking, AC, Solar Backup, CCTV, 24h Security, Fitted Kitchen', status: 'available', is_furnished: true,
        verification: 'verified',
        images: [px(6400270), px(12422474), px(29012619), px(34574606), px(6527057)],
        created_at: isoDaysAgo(8), updated_at: isoDaysAgo(8)
      },
      {
        id: 'prop15', landlord_id: 'landlord',
        title: '3-Bedroom Home off Kissy Road',
        description: 'A solid 3-bedroom home tucked just off Kissy Road with a fenced compound, treated water and parking. Convenient for traders and commuters using the Eastern Bypass. Plenty of space for the whole family.',
        address: '', city: 'Freetown', state: 'Western Area', pincode: 'Kissy',
        price: 6000, property_type: 'house', bedrooms: 3, bathrooms: 2, area_sqft: 1200,
        amenities: 'Parking, Borehole Water, Fenced Compound, Security', status: 'available', is_furnished: false,
        images: [px(18514152), px(27164969), px(13043955), px(7045356)],
        created_at: isoDaysAgo(30), updated_at: isoDaysAgo(30)
      },
      {
        id: 'prop16', landlord_id: 'landlord',
        title: 'Compact Studio in Congo Town',
        description: 'A tidy self-contained studio in Congo Town, minutes from Congo Cross market and easy access to the city centre. Includes a small kitchen corner, reliable water and a secure compound. A starter home for students and young workers.',
        address: '', city: 'Freetown', state: 'Western Area', pincode: 'Congo Town',
        price: 3000, property_type: 'studio', bedrooms: 1, bathrooms: 1, area_sqft: 400,
        amenities: 'WiFi, Borehole Water, Security, Fenced Compound', status: 'available', is_furnished: true,
        images: [px(12422474), px(7546648), px(6782479), px(4221389), px(12329135)],
        created_at: isoDaysAgo(5), updated_at: isoDaysAgo(5)
      }
    ];
  }

  function demoBookings() {
    return [
      {
        id: 'book1', property_id: 'prop6', tenant_id: 'tenant',
        start_date: isoDaysFromNow(7), end_date: isoDaysFromNow(67),
        message: 'Hello, I work in the Aberdeen area and would like a long term stay. Please let me know when I can view the flat.',
        status: 'pending', total_amount: 5500,
        created_at: isoDaysAgo(2), updated_at: isoDaysAgo(2)
      },
      {
        id: 'book2', property_id: 'prop5', tenant_id: 'tenant',
        start_date: isoDaysFromNow(-20), end_date: isoDaysFromNow(10),
        message: 'Please keep the room ready for the beginning of next month.',
        status: 'approved', total_amount: 1800,
        created_at: isoDaysAgo(25), updated_at: isoDaysAgo(15)
      }
    ];
  }

  function demoReviews() {
    return [
      {
        id: 'rev1', property_id: 'prop5', tenant_id: 'tenant',
        rating: 5, comment: 'Great location close to Congo Cross and clean room. The landlord is very responsive and the compound is safe.',
        created_at: isoDaysAgo(10)
      },
      {
        id: 'rev2', property_id: 'prop2', tenant_id: 'tenant',
        rating: 4, comment: 'Nice little studio with good natural light and superb WiFi. A bit small but perfect for one person.',
        created_at: isoDaysAgo(8)
      }
    ];
  }

  function demoSaved() {
    return [
      { id: 'saved1', user_id: 'tenant', property_id: 'prop2', created_at: isoDaysAgo(3) },
      { id: 'saved2', user_id: 'tenant', property_id: 'prop6', created_at: isoDaysAgo(1) }
    ];
  }

  function demoRentals() {
    return [
      {
        id: 'rent1', property_id: 'prop5', tenant_id: 'tenant', landlord_id: 'landlord',
        booking_id: 'book2', start_date: isoDaysFromNow(-20), end_date: isoDaysFromNow(10),
        rent_amount: 1800, payment_frequency: 'monthly', deposit: 1800, terms: 'Water and electricity not included.',
        status: 'active', created_at: isoDaysAgo(15), updated_at: isoDaysAgo(15)
      }
    ];
  }

  function demoPayments() {
    return [
      {
        id: 'pay1', rental_id: 'rent1', amount: 1800,
        period_start: isoDaysFromNow(-20), period_end: isoDaysFromNow(10),
        reference: 'NIGHT-DIRECT', recorded_by: 'landlord', paid_at: isoDaysAgo(18)
      }
    ];
  }

  function demoNotifications() {
    return [
      {
        id: 'notif1', user_id: 'tenant', type: 'success',
        title: 'Rental confirmed', message: 'Your request for "Single Room near Congo Cross" was approved. Your rental is now active.',
        link: 'tenant-dashboard.html', read_at: '', created_at: isoDaysAgo(15)
      },
      {
        id: 'notif2', user_id: 'landlord', type: 'info',
        title: 'New booking request', message: 'Fatmata Sesay requested to rent "2-Bedroom Flat in Wellington".',
        link: 'landlord-dashboard.html', read_at: '', created_at: isoDaysAgo(2)
      },
      {
        id: 'notif3', user_id: 'admin', type: 'info',
        title: 'Welcome', message: 'You have platform administration access for the demo.',
        link: 'admin-dashboard.html', read_at: '', created_at: isoDaysAgo(60)
      }
    ];
  }

  /* ---------------- Store: read/write helpers ---------------- */
  var Store = {
    users: [],
    properties: [],
    bookings: [],
    reviews: [],
    rentals: [],
    saved: [],
    notifications: [],
    payments: [],
    reports: [],
    initialized: false,

    /* Shared async initialiser. Safe to call multiple times. */
    init: function () {
      return init();
    },

    /* Load every table into the in-memory cache. */
    loadAll: function () {
      var c = configure();
      var db = c.databaseId;
      return Promise.all([
        tablesDB.listRows({ databaseId: db, tableId: tableId('users'), queries: [Appwrite.Query.limit(5000)] }),
        tablesDB.listRows({ databaseId: db, tableId: tableId('properties'), queries: [Appwrite.Query.limit(5000)] }),
        tablesDB.listRows({ databaseId: db, tableId: tableId('bookings'), queries: [Appwrite.Query.limit(5000)] }),
        tablesDB.listRows({ databaseId: db, tableId: tableId('reviews'), queries: [Appwrite.Query.limit(5000)] }),
        tablesDB.listRows({ databaseId: db, tableId: tableId('rentals'), queries: [Appwrite.Query.limit(5000)] }),
        tablesDB.listRows({ databaseId: db, tableId: tableId('saved_properties'), queries: [Appwrite.Query.limit(5000)] }),
        tablesDB.listRows({ databaseId: db, tableId: tableId('notifications'), queries: [Appwrite.Query.limit(5000)] }),
        tablesDB.listRows({ databaseId: db, tableId: tableId('payments'), queries: [Appwrite.Query.limit(5000)] }),
        tablesDB.listRows({ databaseId: db, tableId: tableId('reports'), queries: [Appwrite.Query.limit(5000)] })
      ]).then(function (res) {
        Store.users = res[0].rows.map(rowToUser);
        Store.properties = res[1].rows.map(rowToProperty);
        Store.bookings = res[2].rows.map(rowToBooking);
        Store.reviews = res[3].rows.map(rowToReview);
        Store.rentals = res[4].rows.map(rowToRental);
        Store.saved = res[5].rows.map(rowToSaved);
        Store.notifications = res[6].rows.map(rowToNotification);
        Store.payments = res[7].rows.map(rowToPayment);
        Store.reports = res[8].rows.map(rowToReport);
      });
    },

    /* ----- users ----- */
    findUser: function (id) {
      return this.users.find(function (u) { return eq(u.id, id) || eq(u.account_id, id); }) || null;
    },
    findUserByEmail: function (email) {
      var target = String(email).toLowerCase();
      return this.users.find(function (u) { return String(u.email).toLowerCase() === target; }) || null;
    },
    addUser: function (user) {
      var c = configure();
      return tablesDB.createRow({
        databaseId: c.databaseId,
        tableId: tableId('users'),
        rowId: user.id && String(user.id).length <= 36 ? String(user.id) : Appwrite.ID.unique(),
        data: userData(user)
      }).then(function (row) {
        var u = rowToUser(row);
        return upsert(Store.users, u);
      });
    },
    updateUser: function (user) {
      return tablesDB.updateRow({
        databaseId: configure().databaseId,
        tableId: tableId('users'),
        rowId: user.id,
        data: userData(user)
      }).then(function (row) {
        return upsert(Store.users, rowToUser(row));
      });
    },
    saveUsers: function () {
      return Promise.resolve();
    },

    /* ----- properties ----- */
    findProperty: function (id) {
      return this.properties.find(function (p) { return eq(p.id, id); }) || null;
    },
    canManageProperty: function (user, prop) {
      return !!user && !!prop && (user.role === 'admin' || eq(prop.landlord_id, user.id));
    },
    /* Demo properties are the sample listings bundled with the app (all
       owned by the "landlord" demo account). They are labelled
       "Sample Listing" so visitors never mistake them for real rentals. */
    isDemoProperty: function (prop) {
      return !!prop && eq(prop.landlord_id, 'landlord');
    },
    publicProperties: function () {
      return this.properties.filter(function (p) { return p.status === 'available'; });
    },
    propertiesByLandlord: function (landlordId) {
      return this.properties.filter(function (p) { return eq(p.landlord_id, landlordId); });
    },
    addProperty: function (prop) {
      return tablesDB.createRow({
        databaseId: configure().databaseId,
        tableId: tableId('properties'),
        rowId: prop.id && String(prop.id).length <= 36 ? String(prop.id) : Appwrite.ID.unique(),
        data: propertyData(prop)
      }).then(function (row) {
        return upsert(Store.properties, rowToProperty(row));
      });
    },
    updateProperty: function (prop) {
      return tablesDB.updateRow({
        databaseId: configure().databaseId,
        tableId: tableId('properties'),
        rowId: prop.id,
        data: propertyData(prop)
      }).then(function (row) {
        return upsert(Store.properties, rowToProperty(row));
      });
    },
    deleteProperty: function (id) {
      var c = configure();
      var relatedBookings = this.bookings.filter(function (b) { return eq(b.property_id, id); });
      var relatedReviews = this.reviews.filter(function (r) { return eq(r.property_id, id); });
      var chain = tablesDB.deleteRow({
        databaseId: c.databaseId, tableId: tableId('properties'), rowId: id
      });
      relatedBookings.forEach(function (b) {
        chain = chain.then(function () {
          return tablesDB.deleteRow({ databaseId: c.databaseId, tableId: tableId('bookings'), rowId: b.id });
        });
      });
      relatedReviews.forEach(function (r) {
        chain = chain.then(function () {
          return tablesDB.deleteRow({ databaseId: c.databaseId, tableId: tableId('reviews'), rowId: r.id });
        });
      });
      return chain.then(function () {
        Store.properties = Store.properties.filter(function (p) { return !eq(p.id, id); });
        Store.bookings = Store.bookings.filter(function (b) { return !eq(b.property_id, id); });
        Store.reviews = Store.reviews.filter(function (r) { return !eq(r.property_id, id); });
      });
    },
    saveProperties: function () {
      return Promise.resolve();
    },

    /* ----- bookings ----- */
    findBooking: function (id) {
      return this.bookings.find(function (b) { return eq(b.id, id); }) || null;
    },
    bookingsForLandlord: function (landlordId) {
      var props = this.propertiesByLandlord(landlordId).map(function (p) { return p.id; });
      return this.bookings
        .filter(function (b) { return props.some(function (pid) { return eq(pid, b.property_id); }); })
        .slice()
        .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    },
    bookingsForTenant: function (tenantId) {
      return this.bookings
        .filter(function (b) { return eq(b.tenant_id, tenantId); })
        .slice()
        .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    },
    activeBookingForTenant: function (propertyId, tenantId) {
      return this.bookings.find(function (b) {
        return eq(b.property_id, propertyId) &&
          eq(b.tenant_id, tenantId) &&
          (b.status === 'pending' || b.status === 'approved');
      }) || null;
    },
    approvedBookingForTenant: function (propertyId, tenantId) {
      return this.bookings.find(function (b) {
        return eq(b.property_id, propertyId) &&
          eq(b.tenant_id, tenantId) &&
          b.status === 'approved';
      }) || null;
    },
    addBooking: function (booking) {
      var me = this;
      return tablesDB.createRow({
        databaseId: configure().databaseId,
        tableId: tableId('bookings'),
        rowId: booking.id && String(booking.id).length <= 36 ? String(booking.id) : Appwrite.ID.unique(),
        data: bookingData(booking)
      }).then(function (row) {
        var b = upsert(me.bookings, rowToBooking(row));
        var prop = me.findProperty(booking.property_id);
        if (prop) {
          var tenant = me.findUser(booking.tenant_id);
          return notify(prop.landlord_id, 'info', 'New booking request',
            (tenant ? tenant.full_name : 'A tenant') + ' requested to rent "' + prop.title + '".',
            'landlord-dashboard.html').then(function () { return b; });
        }
        return b;
      });
    },
    updateBooking: function (booking) {
      return tablesDB.updateRow({
        databaseId: configure().databaseId,
        tableId: tableId('bookings'),
        rowId: booking.id,
        data: bookingData(booking)
      }).then(function (row) {
        return upsert(Store.bookings, rowToBooking(row));
      });
    },
    saveBookings: function () {
      return Promise.resolve();
    },

    /* ----- reviews ----- */
    reviewsForProperty: function (propertyId) {
      return this.reviews
        .filter(function (r) { return eq(r.property_id, propertyId); })
        .slice()
        .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    },
    averageRating: function (propertyId) {
      var list = this.reviewsForProperty(propertyId);
      if (!list.length) { return 0; }
      var sum = list.reduce(function (acc, r) { return acc + Number(r.rating); }, 0);
      return Math.round((sum / list.length) * 10) / 10;
    },
    reviewCount: function (propertyId) {
      return this.reviewsForProperty(propertyId).length;
    },
    reviewByTenant: function (propertyId, tenantId) {
      return this.reviews.find(function (r) {
        return eq(r.property_id, propertyId) && eq(r.tenant_id, tenantId);
      }) || null;
    },
    addReview: function (review) {
      return tablesDB.createRow({
        databaseId: configure().databaseId,
        tableId: tableId('reviews'),
        rowId: review.id && String(review.id).length <= 36 ? String(review.id) : Appwrite.ID.unique(),
        data: reviewData(review)
      }).then(function (row) {
        return upsert(Store.reviews, rowToReview(row));
      });
    },
    updateReview: function (review) {
      return tablesDB.updateRow({
        databaseId: configure().databaseId,
        tableId: tableId('reviews'),
        rowId: review.id,
        data: reviewData(review)
      }).then(function (row) {
        return upsert(Store.reviews, rowToReview(row));
      });
    },
    saveReviews: function () {
      return Promise.resolve();
    },

    /* ----- rentals (leases) ----- */
    rentalsForProperty: function (propertyId) {
      return this.rentals.filter(function (r) { return eq(r.property_id, propertyId); });
    },
    rentalsForLandlord: function (landlordId) {
      return this.rentals
        .filter(function (r) { return eq(r.landlord_id, landlordId); })
        .slice()
        .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    },
    rentalsForTenant: function (tenantId) {
      return this.rentals
        .filter(function (r) { return eq(r.tenant_id, tenantId); })
        .slice()
        .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    },
    activeRentalForTenant: function (tenantId) {
      return this.rentals.find(function (r) {
        return eq(r.tenant_id, tenantId) && r.status === 'active';
      }) || null;
    },
    activeRentalForProperty: function (propertyId) {
      return this.rentals.find(function (r) {
        return eq(r.property_id, propertyId) && r.status === 'active';
      }) || null;
    },
    addRental: function (rental) {
      return tablesDB.createRow({
        databaseId: configure().databaseId,
        tableId: tableId('rentals'),
        rowId: rental.id && String(rental.id).length <= 36 ? String(rental.id) : Appwrite.ID.unique(),
        data: rentalData(rental)
      }).then(function (row) {
        return upsert(Store.rentals, rowToRental(row));
      });
    },
    updateRental: function (rental) {
      return tablesDB.updateRow({
        databaseId: configure().databaseId,
        tableId: tableId('rentals'),
        rowId: rental.id,
        data: rentalData(rental)
      }).then(function (row) {
        return upsert(Store.rentals, rowToRental(row));
      });
    },

    /* ----- saved properties (favourites) ----- */
    isSaved: function (userId, propertyId) {
      return !!this.saved.find(function (s) {
        return eq(s.user_id, userId) && eq(s.property_id, propertyId);
      });
    },
    savedPropertiesForTenant: function (userId) {
      return this.saved
        .filter(function (s) { return eq(s.user_id, userId); })
        .map(function (s) { return Store.findProperty(s.property_id); })
        .filter(Boolean);
    },
    toggleSaved: function (userId, propertyId) {
      var existing = this.saved.find(function (s) {
        return eq(s.user_id, userId) && eq(s.property_id, propertyId);
      });
      if (existing) {
        return tablesDB.deleteRow({
          databaseId: configure().databaseId,
          tableId: tableId('saved_properties'),
          rowId: existing.id
        }).then(function () {
          Store.saved = Store.saved.filter(function (s) { return !eq(s.id, existing.id); });
          return false;
        });
      }
      return tablesDB.createRow({
        databaseId: configure().databaseId,
        tableId: tableId('saved_properties'),
        rowId: Appwrite.ID.unique(),
        data: savedData({ user_id: userId, property_id: propertyId })
      }).then(function (row) {
        Store.saved.push(rowToSaved(row));
        return true;
      });
    },

    /* ----- notifications ----- */
    notificationsForTenant: function (userId) {
      return this.notifications
        .filter(function (n) { return eq(n.user_id, userId); })
        .slice()
        .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    },
    unreadCount: function (userId) {
      return this.notifications.filter(function (n) {
        return eq(n.user_id, userId) && !n.read_at;
      }).length;
    },
    markNotificationRead: function (id) {
      var n = this.notifications.find(function (x) { return eq(x.id, id); });
      if (n && !n.read_at) {
        n.read_at = nowISO();
        return tablesDB.updateRow({
          databaseId: configure().databaseId,
          tableId: tableId('notifications'),
          rowId: n.id,
          data: notificationData(n)
        }).then(function (row) { upsert(Store.notifications, rowToNotification(row)); });
      }
      return Promise.resolve();
    },
    markAllNotificationsRead: function (userId) {
      var pending = this.notifications.filter(function (n) {
        return eq(n.user_id, userId) && !n.read_at;
      });
      var me = this;
      var chain = Promise.resolve();
      pending.forEach(function (n) {
        n.read_at = nowISO();
        chain = chain.then(function () {
          return tablesDB.updateRow({
            databaseId: configure().databaseId,
            tableId: tableId('notifications'),
            rowId: n.id,
            data: notificationData(n)
          }).then(function (row) { upsert(me.notifications, rowToNotification(row)); });
        });
      });
      return chain;
    },
    addNotification: function (n) {
      return tablesDB.createRow({
        databaseId: configure().databaseId,
        tableId: tableId('notifications'),
        rowId: Appwrite.ID.unique(),
        data: notificationData(n)
      }).then(function (row) {
        return upsert(Store.notifications, rowToNotification(row));
      });
    },
    /* Derived (never fabricated) rent reminders. Fires once per unpaid
       period by deduping against existing "Rent ..." notifications that
       mention the same due date. */
    ensureRentReminders: function (userId) {
      var me = this;
      var active = me.rentalsForTenant(userId).filter(function (r) { return r.status === 'active'; });
      var tasks = active.map(function (r) {
        var st = rentStatus(r);
        if (st.status !== 'due_soon' && st.status !== 'due' && st.status !== 'overdue') {
          return Promise.resolve();
        }
        var dueDate = st.nextDueDate || '';
        var exists = me.notifications.some(function (n) {
          return eq(n.user_id, userId) &&
            n.title && n.title.indexOf('Rent') === 0 &&
            dueDate && n.message.indexOf(dueDate) !== -1;
        });
        if (exists) { return Promise.resolve(); }
        return notify(userId, st.status === 'overdue' ? 'warning' : 'info',
          st.status === 'overdue' ? 'Rent overdue' : 'Rent due soon',
          'Your next rent of ' + (st.nextDueAmount || 0) + ' Nle is due on ' + dueDate + '.',
          'tenant-dashboard.html');
      });
      return chainOf(tasks);
    },

    /* ----- rent payments (actual records only) ----- */
    paymentsForRental: function (rentalId) {
      return this.payments
        .filter(function (p) { return eq(p.rental_id, rentalId); })
        .slice()
        .sort(function (a, b) { return new Date(a.period_start) - new Date(b.period_start); });
    },
    addPayment: function (payment) {
      var me = this;
      return tablesDB.createRow({
        databaseId: configure().databaseId,
        tableId: tableId('payments'),
        rowId: Appwrite.ID.unique(),
        data: paymentData(payment)
      }).then(function (row) {
        me.payments.push(rowToPayment(row));
        return rowToPayment(row);
      });
    },
    paymentsForRentalSum: function (rentalId) {
      return this.paymentsForRental(rentalId).reduce(function (acc, p) { return acc + Number(p.amount); }, 0);
    },

    /* ----- reports ----- */
    reportsOpen: function () {
      return this.reports.filter(function (r) { return r.status === 'open'; });
    },
    addReport: function (report) {
      var me = this;
      var prop = report.target_type === 'property' ? me.findProperty(report.target_id) : null;
      return tablesDB.createRow({
        databaseId: configure().databaseId,
        tableId: tableId('reports'),
        rowId: Appwrite.ID.unique(),
        data: reportData(report)
      }).then(function (row) {
        me.reports.push(rowToReport(row));
        var admins = me.users.filter(function (u) { return u.role === 'admin'; });
        var tasks = admins.map(function (a) {
          return notify(a.id, 'info', 'New report received',
            'A ' + report.target_type + ' was reported: "' + (prop ? prop.title : report.target_id) + '".',
            'admin-dashboard.html');
        });
        return chainOf(tasks).then(function () { return rowToReport(row); });
      });
    },
    updateReport: function (report) {
      return tablesDB.updateRow({
        databaseId: configure().databaseId,
        tableId: tableId('reports'),
        rowId: report.id,
        data: reportData(report)
      }).then(function (row) {
        return upsert(Store.reports, rowToReport(row));
      });
    },

    /* ----- lifecycle: application -> rental (single source of truth) ----- */
    /* Approves a booking: creates the rental, marks the property rented
       and rejects any competing pending requests for the same property. */
    approveBooking: function (booking) {
      var me = this;
      var prop = me.findProperty(booking.property_id);
      if (!prop) { return Promise.reject(new Error('Property not found.')); }
      if (prop.status !== 'available' || me.activeRentalForProperty(prop.id)) {
        return Promise.reject(new Error('This property is no longer available.'));
      }
      if (!eq(booking.status, 'pending')) {
        return Promise.reject(new Error('This request is no longer pending.'));
      }

      booking.status = 'approved';
      var rivals = me.bookings.filter(function (b) {
        return eq(b.property_id, prop.id) && eq(b.status, 'pending') && !eq(b.id, booking.id);
      });

      var chain = Promise.resolve();
      var createdRental = null;
      rivals.forEach(function (r) {
        r.status = 'rejected';
        chain = chain.then(function () { return me.updateBooking(r); });
      });
      chain = chain
        .then(function () { return me.updateBooking(booking); })
        .then(function () {
          prop.status = 'rented';
          return me.updateProperty(prop);
        });
      chain = chain.then(function () {
        return me.addRental({
          property_id: prop.id,
          tenant_id: booking.tenant_id,
          landlord_id: prop.landlord_id,
          booking_id: booking.id,
          start_date: booking.start_date,
          end_date: booking.end_date,
          rent_amount: booking.total_amount || prop.price,
          payment_frequency: 'monthly',
          deposit: 0,
          terms: '',
          status: 'active'
        });
      }).then(function (rental) {
        createdRental = rental;
        return chainOf([
          notify(booking.tenant_id, 'success', 'Rental confirmed',
            'Your request for "' + prop.title + '" was approved. Your rental is now active.',
            'tenant-dashboard.html'),
          notify(prop.landlord_id, 'info', 'New active rental',
            'You approved "' + prop.title + '". A rental record was created.',
            'landlord-dashboard.html')
        ]).then(function () { return rental; });
      });
      rivals.forEach(function (r) {
        chain = chain.then(function () {
          return notify(r.tenant_id, 'info', 'Request not selected',
            'Your request for "' + prop.title + '" was not approved.',
            'tenant-dashboard.html');
        });
      });
      chain = chain.then(function () { return createdRental; });
      return chain;
    },

    rejectBooking: function (booking) {
      booking.status = 'rejected';
      var me = this;
      return me.updateBooking(booking).then(function () {
        var prop = me.findProperty(booking.property_id);
        return notify(booking.tenant_id, 'warning', 'Request declined',
          'Your request for "' + (prop ? prop.title : 'this property') + '" was declined by the landlord.',
          'tenant-dashboard.html');
      });
    },

    /* Tenant withdraws their own pending request. */
    cancelBooking: function (booking) {
      booking.status = 'cancelled';
      var me = this;
      return me.updateBooking(booking).then(function () {
        var prop = me.findProperty(booking.property_id);
        return notify(prop ? prop.landlord_id : '', 'info', 'Application withdrawn',
          'A tenant withdrew their request for "' + (prop ? prop.title : 'a property') + '".',
          'landlord-dashboard.html');
      }).then(function () { return null; });
    }
  };

  /* ---------------- Session helpers (Appwrite-backed) ---------------- */
  var Session = {
    currentUser: function () {
      return currentUser;
    },
    /* Re-reads the signed-in Appwrite account and merges it with the
       matching row in the users table. */
    refresh: function () {
      if (!account) { return Promise.resolve(null); }
      return account.get().then(function (acc) {
        var prefs = acc.prefs || {};
        var row = Store.findUserByEmail(acc.email);
        currentUser = {
          id: acc.$id,
          account_id: acc.$id,
          username: prefs.username || (row ? row.username : ''),
          email: acc.email,
          full_name: acc.name,
          phone: prefs.phone || (row ? row.phone : ''),
          role: (row ? row.role : prefs.role) || 'tenant',
          is_active: row ? row.is_active !== false : true,
          created_at: row ? row.created_at : ''
        };
        return currentUser;
      });
    },
    clearRefresh: function () {
      currentUser = null;
    },
    login: function (userId) {
      var u = Store.findUser(userId);
      if (u) {
        currentUser = {
          id: u.account_id || u.id,
          account_id: u.account_id || u.id,
          username: u.username,
          email: u.email,
          full_name: u.full_name,
          phone: u.phone,
          role: u.role,
          is_active: u.is_active,
          created_at: u.created_at
        };
      }
      return Promise.resolve(currentUser);
    },
    logout: function () {
      var done = function () { currentUser = null; };
      if (account) {
        return account.deleteSession({ sessionId: 'current' }).then(done, done);
      }
      done();
      return Promise.resolve();
    },
    isAuthenticated: function () {
      return !!currentUser && currentUser.is_active !== false;
    },
    requiresRole: function (roles) {
      var u = this.currentUser();
      return !!u && roles.indexOf(u.role) !== -1;
    },
    roleRedirect: function () {
      var u = this.currentUser();
      if (!u) { return 'login.html'; }
      if (u.role === 'admin') { return 'admin-dashboard.html'; }
      if (u.role === 'landlord') { return 'landlord-dashboard.html'; }
      return 'tenant-dashboard.html';
    },
    flash: function (category, message) {
      var list = load(KEYS.FLASH, []);
      list.push({ category: category, message: message });
      save(KEYS.FLASH, list);
    },
    drainFlashes: function () {
      var list = load(KEYS.FLASH, []);
      localStorage.removeItem(KEYS.FLASH);
      return list;
    }
  };

  /* ---------------- Seeding ---------------- */
  function ensureAccount(user) {
    return account.create({
      userId: user.id,
      email: user.email,
      password: user.password,
      name: user.full_name
    })
      .then(function () {
        return account.createEmailPasswordSession({ email: user.email, password: user.password });
      })
      .then(function () {
        return account.updatePrefs({ role: user.role, username: user.username, phone: user.phone });
      })
      .then(function () {
        return account.deleteSession({ sessionId: 'current' });
      })
      .catch(function (err) {
        if (err && (err.code === 409 || /already|exists/i.test(err.message || ''))) {
          return null;
        }
        throw err;
      });
  }

  function createRowIfMissing(table, rowId, data) {
    return tablesDB.createRow({
      databaseId: configure().databaseId,
      tableId: table,
      rowId: rowId,
      data: data
    }).catch(function (err) {
      if (err && (err.code === 409 || /already|exists/i.test(err.message || ''))) {
        return null;
      }
      throw err;
    });
  }

  /* Idempotent: safe to run more than once. Creates demo accounts,
     users, properties, bookings and reviews. */
  function seedDemo() {
    var c = configure();
    var chain = Promise.resolve();

    demoUsers().forEach(function (u) {
      chain = chain
        .then(function () { return ensureAccount(u); })
        .then(function () {
          return createRowIfMissing(tableId('users'), u.id, {
            account_id: u.id,
            username: u.username,
            email: u.email,
            phone: u.phone,
            full_name: u.full_name,
            role: u.role,
            is_active: true,
            created_at: u.created_at
          });
        });
    });

    demoProperties().forEach(function (p) {
      chain = chain.then(function () {
        return createRowIfMissing(tableId('properties'), p.id, propertyData(p));
      });
    });

    demoBookings().forEach(function (b) {
      chain = chain.then(function () {
        return createRowIfMissing(tableId('bookings'), b.id, bookingData(b));
      });
    });

    demoReviews().forEach(function (r) {
      chain = chain.then(function () {
        return createRowIfMissing(tableId('reviews'), r.id, reviewData(r));
      });
    });

    demoRentals().forEach(function (r) {
      chain = chain.then(function () {
        return createRowIfMissing(tableId('rentals'), r.id, rentalData(r));
      });
    });

    demoPayments().forEach(function (p) {
      chain = chain.then(function () {
        return createRowIfMissing(tableId('payments'), p.id, paymentData(p));
      });
    });

    demoSaved().forEach(function (s) {
      chain = chain.then(function () {
        return createRowIfMissing(tableId('saved_properties'), s.id, savedData(s));
      });
    });

    demoNotifications().forEach(function (n) {
      chain = chain.then(function () {
        return createRowIfMissing(tableId('notifications'), n.id, notificationData(n));
      });
    });

    return chain;
  }

  /* ---------------- App initialisation ---------------- */
  function initClient() {
    var c = configure();
    client = new Appwrite.Client().setEndpoint(c.endpoint).setProject(c.projectId);
    account = new Appwrite.Account(client);
    tablesDB = new Appwrite.TablesDB(client);
  }

  function init() {
    if (initPromise) { return initPromise; }
    initPromise = (function () {
      if (!isConfigured()) {
        offline = true;
        Store.initialized = true;
        return Promise.resolve();
      }
      try {
        initClient();
      } catch (e) {
        offline = true;
        Store.initialized = true;
        return Promise.resolve();
      }
      return Store.loadAll()
        .then(function () { return Session.refresh(); })
        .catch(function () { currentUser = null; })
        .then(function () {
          if (!offline && !Store.users.length) {
            return seedDemo();
          }
        })
        .catch(function (err) {
          offline = true;
          console.error('RentEase init failed:', err);
        })
        .then(function () {
          return Store.loadAll();
        })
        .then(function () {
          return Session.refresh();
        })
        .catch(function () { currentUser = null; })
        .then(function () {
          Store.initialized = true;
        });
    })();
    return initPromise;
  }

  function resetDemo() {
    return init().then(function () { return seedDemo(); })
      .then(function () { return Store.loadAll(); });
  }

  window.RentEase = {
    Store: Store,
    Session: Session,
    get api() {
      return { client: client, account: account, tablesDB: tablesDB };
    },
    get offline() {
      return offline;
    },
    init: init,
    seedDemo: seedDemo,
    resetDemo: resetDemo,
    placeholderImage: placeholderImage,
    nowISO: nowISO,
    isoDaysFromNow: isoDaysFromNow,
    isoDaysAgo: isoDaysAgo,
    rentStatus: rentStatus,
    isoTodayUtc: isoTodayUtc,
    notify: notify
  };

  Store.init();
})();
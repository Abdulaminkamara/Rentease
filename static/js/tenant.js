/* RentEase - Tenant dashboard: my rental & rent status, saved properties,
   applications, notifications */
(function () {
  'use strict';
  var RE = window.RentEase;
  var Store = RE.Store;
  var Session = RE.Session;
  var UI = RE.UI;

  function statusBadge(status) {
    var map = {
      'pending': 'bg-warning text-dark',
      'approved': 'bg-success',
      'rejected': 'bg-danger',
      'cancelled': 'bg-secondary',
      'completed': 'bg-secondary'
    };
    return '<span class="badge ' + (map[status] || 'bg-secondary') + '">' +
      UI.escapeHtml(status.charAt(0).toUpperCase() + status.slice(1)) + '</span>';
  }

  function renderMyRental(user) {
    var wrap = document.getElementById('my-rental');
    if (!wrap) { return; }
    var rental = Store.activeRentalForTenant(user.id);

    if (!rental) {
      wrap.innerHTML =
        '<div class="card shadow-sm mb-4"><div class="card-body text-center py-5">' +
        '<i class="bi bi-house-x fs-1 text-muted"></i>' +
        '<h5 class="mt-3 mb-1">You don\u2019t have an active rental right now.</h5>' +
        '<p class="text-muted">Browse available properties and send a rental request to get started.</p>' +
        '<a href="properties.html" class="btn btn-primary"><i class="bi bi-search"></i> Find a Property</a>' +
        '</div></div>';
      return;
    }

    var prop = Store.findProperty(rental.property_id);
    var st = RE.rentStatus(rental);
    var img = UI.primaryImage(prop);
    var stBadge = st.status === 'overdue' ? 'bg-danger' :
      st.status === 'due' ? 'bg-danger' :
      st.status === 'due_soon' ? 'bg-warning text-dark' :
      st.status === 'paid' ? 'bg-success' : 'bg-info text-dark';

    wrap.innerHTML =
      '<div class="card shadow-sm mb-4">' +
      '<div class="card-header"><h5 class="mb-0"><i class="bi bi-house-check-fill"></i> My Rental</h5></div>' +
      '<div class="card-body">' +
      '<div class="row align-items-center g-4">' +
      '<div class="col-md-4">' +
      '<a href="property.html?id=' + prop.id + '"><img src="' + img + '" class="img-fluid rounded" alt="' + UI.escapeHtml(prop.title) + '"></a>' +
      '</div>' +
      '<div class="col-md-8">' +
      '<h4 class="fw-bold mb-1"><a class="text-decoration-none text-dark" href="property.html?id=' + prop.id + '">' + UI.escapeHtml(prop.title) + '</a></h4>' +
      '<p class="text-muted mb-2"><i class="bi bi-geo-alt"></i> ' + UI.escapeHtml(UI.locationLine(prop)) + '</p>' +
      '<div class="row g-3 text-center">' +
      '<div class="col"><div class="p-2 bg-light rounded"><strong>' + UI.formatPrice(rental.rent_amount) + '</strong><div class="small text-muted">Monthly Rent</div></div></div>' +
      '<div class="col"><div class="p-2 bg-light rounded"><strong>' + UI.formatDate(rental.start_date) + '</strong><div class="small text-muted">Lease Start</div></div></div>' +
      '<div class="col"><div class="p-2 bg-light rounded"><strong>' + UI.formatDate(rental.end_date) + '</strong><div class="small text-muted">Lease End</div></div></div>' +
      '<div class="col"><div class="p-2 bg-light rounded"><strong id="next-due">' + UI.escapeHtml(st.nextDueDate || '\u2014') + '</strong><div class="small text-muted">Next Payment</div></div></div>' +
      '</div>' +
      '<div class="mt-3"><span class="badge fs-6 ' + stBadge + '">' + UI.escapeHtml(st.label) + '</span>' +
      (st.current && st.current.paid > 0 ? ' <small class="text-muted">' + UI.formatPrice(st.current.paid) + ' paid this period</small>' : '') +
      '</div>' +
      (rental.terms ? '<p class="small text-muted mt-2 mb-0"><i class="bi bi-file-earmark-text"></i> ' + UI.escapeHtml(rental.terms) + '</p>' : '') +
      '</div>' +
      '</div></div></div>';
  }

  function renderNotifications(user) {
    var wrap = document.getElementById('tenant-notifications');
    if (!wrap) { return; }
    var notes = Store.notificationsForTenant(user.id).slice(0, 8);
    if (!notes.length) {
      wrap.innerHTML = '<div class="card shadow-sm"><div class="card-body text-center text-muted py-4">' +
        '<i class="bi bi-bell fs-2"></i><p class="mt-2 mb-0">No notifications yet.</p></div></div>';
      return;
    }
    var items = notes.map(function (n) {
      var cls = n.read_at ? 'text-muted' : 'fw-semibold';
      var icon = n.type === 'success' ? 'bi-check-circle-fill text-success' :
        n.type === 'warning' ? 'bi-exclamation-triangle-fill text-warning' : 'bi-info-circle-fill text-info';
      return '<li class="list-group-item ' + cls + '">' +
        '<i class="bi ' + icon + ' me-2"></i>' +
        '<strong>' + UI.escapeHtml(n.title) + '</strong>' +
        '<p class="mb-1 small">' + UI.escapeHtml(n.message) + '</p>' +
        '<small>' + UI.formatDate(n.created_at) + '</small>' +
        (n.link ? ' \u00B7 <a href="' + n.link + '">View</a>' : '') +
        '</li>';
    }).join('');
    wrap.innerHTML =
      '<div class="card shadow-sm mb-4">' +
      '<div class="card-header d-flex justify-content-between align-items-center">' +
      '<h5 class="mb-0"><i class="bi bi-bell"></i> Notifications</h5>' +
      (Store.unreadCount(user.id) ? '<button class="btn btn-sm btn-outline-primary" id="mark-notifications-read">Mark all read</button>' : '') +
      '</div><ul class="list-group list-group-flush">' + items + '</ul></div>';
    var btn = document.getElementById('mark-notifications-read');
    if (btn) {
      btn.addEventListener('click', function () {
        Store.markAllNotificationsRead(user.id).then(function () { window.location.reload(); });
      });
    }
  }

  function renderSaved(user) {
    var wrap = document.getElementById('saved-properties');
    if (!wrap) { return; }
    var saved = Store.savedPropertiesForTenant(user.id);
    if (!saved.length) {
      wrap.innerHTML = UI.cardPlaceholder(
        'Properties you save will appear here.',
        'properties.html',
        'Browse Properties'
      );
      return;
    }
    wrap.innerHTML = saved.map(function (p) { return UI.cardHtml(p, { showDetails: true, savedView: true }); }).join('');
  }

  function renderBookings(user) {
    var wrap = document.getElementById('bookings-wrap');
    if (!wrap) { return; }
    var bookings = Store.bookingsForTenant(user.id);

    if (!bookings.length) {
      wrap.innerHTML = '<div class="text-center text-muted py-5">' +
        '<i class="bi bi-calendar-x display-1"></i>' +
        '<p class="mt-3">You haven\'t made any rental requests yet.</p>' +
        '<a href="properties.html" class="btn btn-primary">Find a Property</a></div>';
      return;
    }

    var rows = bookings.map(function (b) {
      var prop = Store.findProperty(b.property_id) || { title: 'Unknown', city: '', id: null };
      var canCancel = b.status === 'pending';
      return '<tr>' +
        '<td><a href="property.html?id=' + prop.id + '">' + UI.escapeHtml(prop.title) + '</a></td>' +
        '<td>' + UI.escapeHtml(prop.city) + '</td>' +
        '<td>' + UI.escapeHtml(b.start_date) + ' \u2192 ' + UI.escapeHtml(b.end_date) + '</td>' +
        '<td>' + UI.formatPrice(b.total_amount || 0) + '</td>' +
        '<td>' + statusBadge(b.status) + '</td>' +
        '<td>' + UI.formatDate(b.created_at) + '</td>' +
        '<td>' + (canCancel
          ? '<button class="btn btn-sm btn-outline-secondary" data-cancel-booking="' + b.id + '">Withdraw</button>'
          : '') + '</td></tr>';
    }).join('');

    wrap.innerHTML =
      '<h4 class="mb-3">My Applications (' + bookings.length + ')</h4>' +
      '<div class="card shadow-sm"><div class="table-responsive">' +
      '<table class="table table-hover mb-0">' +
      '<thead class="table-light"><tr>' +
      '<th>Property</th><th>Location</th><th>Dates</th><th>Amount</th><th>Status</th><th>Requested On</th><th></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';

    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-cancel-booking]');
      if (!btn) { return; }
      var b = Store.findBooking(btn.getAttribute('data-cancel-booking'));
      if (!b) { return; }
      if (window.confirm('Withdraw this rental request?')) {
        Store.cancelBooking(b).then(function () {
          Session.flash('info', 'Rental request withdrawn.');
          window.location.reload();
        });
      }
    });
  }

  function renderPaymentHistory(user) {
    var wrap = document.getElementById('payment-history');
    if (!wrap) { return; }
    var rental = Store.activeRentalForTenant(user.id);
    if (!rental) {
      wrap.innerHTML = '';
      return;
    }
    var pays = Store.paymentsForRental(rental.id);
    if (!pays.length) {
      wrap.innerHTML = '<div class="card shadow-sm mb-4"><div class="card-body text-center text-muted py-4">' +
        '<i class="bi bi-receipt fs-2"></i><p class="mt-2 mb-0">No payments recorded yet. Your landlord records rent receipts here.</p></div></div>';
      return;
    }
    var rows = pays.map(function (p) {
      return '<tr>' +
        '<td>' + UI.escapeHtml(p.period_start) + ' \u2192 ' + UI.escapeHtml(p.period_end || '\u2014') + '</td>' +
        '<td>' + UI.formatPrice(p.amount) + '</td>' +
        '<td>' + UI.escapeHtml(p.reference || '\u2014') + '</td>' +
        '<td>' + UI.formatDate(p.paid_at) + '</td></tr>';
    }).join('');
    var total = Store.paymentsForRentalSum(rental.id);
    wrap.innerHTML =
      '<div class="card shadow-sm mb-4">' +
      '<div class="card-header d-flex justify-content-between align-items-center">' +
      '<h5 class="mb-0"><i class="bi bi-receipt-cutoff"></i> Payment History</h5>' +
      '<span class="badge bg-light text-dark border">Total received: ' + UI.formatPrice(total) + '</span>' +
      '</div>' +
      '<div class="table-responsive"><table class="table table-hover mb-0">' +
      '<thead class="table-light"><tr><th>Period</th><th>Amount</th><th>Reference</th><th>Recorded</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    RE.init().then(function () {
    var user = UI.requireRole(['tenant', 'admin']);
    if (!user) { return; }

    Store.ensureRentReminders(user.id).catch(function () { /* best effort */ });

    renderMyRental(user);
    renderPaymentHistory(user);
    renderNotifications(user);
    renderSaved(user);
    renderBookings(user);
    });
  });
})();
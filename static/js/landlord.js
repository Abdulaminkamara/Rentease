/* RentEase - Landlord dashboard: metrics, rental requests, active rentals,
   my properties, notifications */
(function () {
  'use strict';
  var RE = window.RentEase;
  var Store = RE.Store;
  var Session = RE.Session;
  var UI = RE.UI;

  function metricsHtml(user) {
    var myProps = Store.propertiesByLandlord(user.id);
    var pendingApps = Store.bookingsForLandlord(user.id).filter(function (b) { return b.status === 'pending'; });
    var rentals = Store.rentalsForLandlord(user.id);
    var active = rentals.filter(function (r) { return r.status === 'active'; });
    var upcomingDue = 0;
    active.forEach(function (r) {
      var st = RE.rentStatus(r);
      if (st.nextDueDate && (st.status === 'upcoming' || st.status === 'due_soon')) {
        upcomingDue += Number(st.nextDueAmount) || 0;
      }
    });
    var stats = [
      { label: 'Total Properties', value: myProps.length, icon: 'bi-house' },
      { label: 'Available', value: myProps.filter(function (p) { return p.status === 'available'; }).length, icon: 'bi-door-open' },
      { label: 'Occupied', value: myProps.filter(function (p) { return p.status === 'rented'; }).length, icon: 'bi-key' },
      { label: 'Pending Requests', value: pendingApps.length, icon: 'bi-bell' },
      { label: 'Active Rentals', value: active.length, icon: 'bi-house-check' },
      { label: 'Due Next 30 Days', value: UI.formatPrice(upcomingDue), icon: 'bi-cash-stack' }
    ];
    return stats.map(function (s) {
      return '<div class="col-md-4 col-lg-2">' +
        '<div class="card dashboard-stat h-100"><div class="card-body text-center p-3 d-flex flex-column align-items-center">' +
        '<div class="stat-icon mb-2"><i class="bi ' + s.icon + '"></i></div>' +
        '<h4 class="mb-0 fw-bold">' + s.value + '</h4>' +
        '<small class="text-muted d-block mt-1">' + s.label + '</small>' +
        '</div></div></div>';
    }).join('');
  }

  function renderPending(user) {
    var wrap = document.getElementById('pending-bookings-wrap');
    if (!wrap) { return; }
    var bookings = Store.bookingsForLandlord(user.id).filter(function (b) { return b.status === 'pending'; });

    if (!bookings.length) {
      wrap.innerHTML = '';
      return;
    }

    var rows = bookings.map(function (b) {
      var prop = Store.findProperty(b.property_id);
      var tenant = Store.findUser(b.tenant_id);
      return '<tr>' +
        '<td>' + UI.escapeHtml(prop ? prop.title : 'Unknown') + '</td>' +
        '<td>' + UI.escapeHtml(tenant ? tenant.full_name : 'Unknown') +
        '<br><small class="text-muted">' + UI.escapeHtml(tenant ? tenant.email : '') + '</small></td>' +
        '<td>' + UI.escapeHtml(b.start_date) + ' \u2192 ' + UI.escapeHtml(b.end_date) + '</td>' +
        '<td>' + UI.escapeHtml(b.message || '\u2014') + '</td>' +
        '<td>' +
        '<button class="btn btn-sm btn-success me-1" data-booking-action="approve" data-booking-id="' + b.id + '">Approve</button>' +
        '<button class="btn btn-sm btn-outline-danger" data-booking-action="reject" data-booking-id="' + b.id + '">Reject</button>' +
        '</td></tr>';
    }).join('');

    wrap.innerHTML =
      '<div class="card shadow-sm mb-4">' +
      '<div class="card-header bg-warning-subtle">' +
      '<h5 class="mb-0"><i class="bi bi-bell"></i> Rental Requests (' + bookings.length + ')</h5>' +
      '</div>' +
      '<div class="card-body p-0"><div class="table-responsive">' +
      '<table class="table table-hover mb-0"><thead><tr>' +
      '<th>Property</th><th>Tenant</th><th>Dates</th><th>Message</th><th>Action</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div></div></div>';

    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-booking-action]');
      if (!btn) { return; }
      var id = btn.getAttribute('data-booking-id');
      var action = btn.getAttribute('data-booking-action');
      var booking = Store.findBooking(id);
      if (!booking) { return; }
      if (action === 'approve') {
        Store.approveBooking(booking).then(function () {
          Session.flash('success', 'Request approved. The rental is now active.');
          window.location.reload();
        }).catch(function (err) {
          Session.flash('danger', err && err.message ? err.message : 'Could not approve this request.');
          window.location.reload();
        });
      } else if (action === 'reject') {
        Store.rejectBooking(booking).then(function () {
          Session.flash('info', 'Request rejected.');
          window.location.reload();
        });
      }
    });
  }

  function renderActiveRentals(user) {
    var wrap = document.getElementById('active-rentals-wrap');
    if (!wrap) { return; }
    var rentals = Store.rentalsForLandlord(user.id).filter(function (r) { return r.status === 'active'; });
    if (!rentals.length) {
      wrap.innerHTML = '';
      return;
    }
    var rows = rentals.map(function (r) {
      var prop = Store.findProperty(r.property_id);
      var tenant = Store.findUser(r.tenant_id);
      var st = RE.rentStatus(r);
      return '<tr>' +
        '<td>' + UI.escapeHtml(prop ? prop.title : 'Unknown') + '</td>' +
        '<td>' + UI.escapeHtml(tenant ? tenant.full_name : 'Unknown') +
        '<br><small class="text-muted">' + UI.escapeHtml(tenant ? tenant.email : '') + '</small></td>' +
        '<td>' + UI.escapeHtml(r.start_date) + ' \u2192 ' + UI.escapeHtml(r.end_date) + '</td>' +
        '<td>' + UI.formatPrice(r.rent_amount) + '/mo</td>' +
        '<td><span class="badge ' + (st.status === 'overdue' || st.status === 'due' ? 'bg-danger' : st.status === 'due_soon' ? 'bg-warning text-dark' : 'bg-success') + '">' +
        UI.escapeHtml(st.label) + '</span>' +
        '<br><small class="text-muted">Next: ' + UI.escapeHtml(st.nextDueDate || '\u2014') + '</small></td>' +
        (st.status === 'ended'
          ? '<td class="text-muted small">\u2014</td>'
          : '<td><button class="btn btn-sm btn-outline-success" data-record-payment="' + r.id +
            '" data-rent="' + r.rent_amount + '" data-period-start="' + (st.current ? st.current.start : '') + '">' +
            '<i class="bi bi-cash-coin"></i> Record Payment</button></td>') +
        '</tr>';
    }).join('');
    wrap.innerHTML =
      '<h4 class="mb-3">Active Rentals (' + rentals.length + ')</h4>' +
      '<div class="card shadow-sm mb-4"><div class="table-responsive">' +
      '<table class="table table-hover mb-0"><thead class="table-light"><tr>' +
      '<th>Property</th><th>Tenant</th><th>Lease</th><th>Rent</th><th>Status</th><th>Payments</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  function renderNotifications(user) {
    var wrap = document.getElementById('landlord-notifications');
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

  function paymentPeriodEnd(start) {
    var d = new Date(Date.parse(start + 'T00:00:00Z') + 30 * 86400000);
    return d.toISOString().slice(0, 10);
  }

  /* "Record payment" modal: writes a real receipt only (no fabricated rows). */
  function wirePaymentModal(user) {
    var modalEl = document.getElementById('record-payment-modal');
    var form = document.getElementById('record-payment-form');
    if (!modalEl || !form) { return; }
    var errEl = document.getElementById('pay-error');

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-record-payment]');
      if (!btn) { return; }
      var rental = Store.rentals.find(function (r) { return String(r.id) === btn.getAttribute('data-record-payment'); });
      if (!rental) { return; }
      if (!Store.canManageProperty(user, Store.findProperty(rental.property_id))) {
        Session.flash('danger', 'You do not have permission to do that.');
        return;
      }
      document.getElementById('pay-rental-id').value = rental.id;
      document.getElementById('pay-amount').value = btn.getAttribute('data-rent') || rental.rent_amount;
      document.getElementById('pay-period-start').value =
        btn.getAttribute('data-period-start') || new Date().toISOString().slice(0, 10);
      document.getElementById('pay-reference').value = '';
      errEl.textContent = '';
      var bs = window.bootstrap && bootstrap.Modal ? bootstrap.Modal.getOrCreateInstance(modalEl) : null;
      if (bs) { bs.show(); } else { modalEl.classList.add('show'); modalEl.style.display = 'block'; }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errEl.textContent = '';
      var rentalId = document.getElementById('pay-rental-id').value;
      var rental = Store.rentals.find(function (r) { return String(r.id) === rentalId; });
      var amount = Number(document.getElementById('pay-amount').value);
      var periodStart = document.getElementById('pay-period-start').value;
      var reference = document.getElementById('pay-reference').value.trim();
      if (!rental) {
        errEl.textContent = 'Rental not found.';
        return;
      }
      if (!periodStart) {
        errEl.textContent = 'Choose the period-start date this payment covers.';
        return;
      }
      Store.addPayment({
        rental_id: rental.id,
        amount: amount,
        period_start: periodStart,
        period_end: paymentPeriodEnd(periodStart),
        reference: reference,
        recorded_by: user.id,
        paid_at: RE.nowISO()
      }).then(function () {
        var bs = window.bootstrap && bootstrap.Modal ? bootstrap.Modal.getInstance(modalEl) : null;
        if (bs) { bs.hide(); } else { modalEl.classList.remove('show'); modalEl.style.display = 'none'; }
        Session.flash('success', 'Payment recorded. Rent status updated.');
        window.location.reload();
      }).catch(function () {
        errEl.textContent = 'Could not record the payment. Please try again.';
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    RE.init().then(function () {
    var user = UI.requireRole(['landlord', 'admin']);
    if (!user) { return; }

    var stats = document.getElementById('landlord-stats');
    if (stats) { stats.innerHTML = metricsHtml(user); }

    renderPending(user);
    renderActiveRentals(user);
    renderNotifications(user);
    wirePaymentModal(user);

    var myProps = Store.propertiesByLandlord(user.id)
      .slice()
      .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });

    document.getElementById('my-properties-heading').textContent = 'My Properties (' + myProps.length + ')';

    var listEl = document.getElementById('my-properties');
    if (!myProps.length) {
      listEl.innerHTML = UI.cardPlaceholder(
        "You haven't listed any properties yet.",
        'property-form.html',
        'Add Your First Property'
      );
    } else {
      listEl.innerHTML = myProps.map(function (p) { return UI.cardHtml(p, { owner: true }); }).join('');
    }

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-delete-property]');
      if (!btn) { return; }
      e.preventDefault();
      var id = btn.getAttribute('data-delete-property');
      var prop = Store.findProperty(id);
      if (!prop) { return; }
      if (!Store.canManageProperty(user, prop)) {
        Session.flash('danger', 'You do not have permission to do that.');
        window.location.href = Session.roleRedirect();
        return;
      }
      if (window.confirm('Delete this property? This will also remove its bookings and reviews.')) {
        Store.deleteProperty(id).then(function () {
          Session.flash('success', 'Property deleted successfully.');
          window.location.reload();
        });
      }
    });
    });
  });
})();
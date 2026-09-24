/* RentEase - Admin dashboard & user management */
(function () {
  'use strict';
  var RE = window.RentEase;
  var Store = RE.Store;
  var Session = RE.Session;
  var UI = RE.UI;

  function statCards() {
    var stats = {
      users: Store.users.length,
      properties: Store.properties.length,
      bookings: Store.bookings.length,
      pending_bookings: Store.bookings.filter(function (b) { return b.status === 'pending'; }).length,
      pending_verification: Store.properties.filter(function (p) { return p.verification === 'unverified'; }).length,
      open_reports: Store.reportsOpen().length
    };
    var defs = [
      { label: 'Total Users', value: stats.users, icon: 'bi-people' },
      { label: 'Properties', value: stats.properties, icon: 'bi-house' },
      { label: 'Applications', value: stats.bookings, icon: 'bi-calendar-check' },
      { label: 'Pending Requests', value: stats.pending_bookings, icon: 'bi-bell' },
      { label: 'Awaiting Verification', value: stats.pending_verification, icon: 'bi-patch-question' },
      { label: 'Open Reports', value: stats.open_reports, icon: 'bi-flag' }
    ];
    return defs.map(function (d) {
      return '<div class="col-md-4 col-lg-2">' +
        '<div class="card dashboard-stat h-100"><div class="card-body text-center p-3 d-flex flex-column align-items-center">' +
        '<div class="stat-icon mb-2"><i class="bi ' + d.icon + '"></i></div>' +
        '<h4 class="mb-0 fw-bold">' + d.value + '</h4>' +
        '<small class="text-muted d-block mt-1">' + d.label + '</small>' +
        '</div></div></div>';
    }).join('');
  }

  function renderModeration() {
    var wrap = document.getElementById('moderation-wrap');
    if (!wrap) { return; }

    var unverified = Store.properties.filter(function (p) { return p.verification === 'unverified'; });
    var verifiedProps = Store.properties.filter(function (p) { return p.verification === 'verified'; });

    var html = '<div class="row g-4 mb-4">';
    html += '<div class="col-lg-6">';
    html += '<div class="card shadow-sm h-100">';
    html += '<div class="card-header"><h5 class="mb-0"><i class="bi bi-patch-question"></i> Property Verification</h5></div>';
    html += '<div class="card-body p-0"><ul class="list-group list-group-flush">';
    if (!unverified.length) {
      html += '<li class="list-group-item text-muted py-4 text-center">No properties awaiting verification. Good job!</li>';
    } else {
      unverified.forEach(function (p) {
        html += '<li class="list-group-item d-flex justify-content-between align-items-center">' +
          '<div><a href="property.html?id=' + p.id + '">' + UI.escapeHtml(p.title) + '</a>' +
          '<br><small class="text-muted">' + UI.escapeHtml(UI.location(p)) + ' \u00B7 ' + UI.formatPrice(p.price) + '</small></div>' +
          '<div class="d-flex gap-1">' +
          '<button class="btn btn-sm btn-success" data-verify-property="' + p.id + '">Approve</button>' +
          '<button class="btn btn-sm btn-outline-danger" data-reject-property="' + p.id + '">Reject</button>' +
          '</div></li>';
      });
    }
    html += verifiedProps.length ? '<li class="list-group-item small text-muted bg-light">' + verifiedProps.length + ' property(ies) verified.</li>' : '';
    html += '</ul></div></div></div>';

    html += '<div class="col-lg-6">';
    html += '<div class="card shadow-sm h-100">';
    html += '<div class="card-header"><h5 class="mb-0"><i class="bi bi-flag"></i> Reports (' + Store.reportsOpen().length + ')</h5></div>';
    html += '<div class="card-body p-0"><ul class="list-group list-group-flush">';
    var reports = Store.reportsOpen();
    if (!reports.length) {
      html += '<li class="list-group-item text-muted py-4 text-center">No open reports.</li>';
    } else {
      reports.forEach(function (r) {
        var reporter = Store.findUser(r.reporter_id);
        var target = r.target_type === 'property'
          ? (function (p) { return p ? '<a href="property.html?id=' + p.id + '">' + UI.escapeHtml(p.title) + '</a>' : 'Unknown property'; })(Store.findProperty(r.target_id))
          : (function (u) { return u ? UI.escapeHtml(u.full_name) : 'Unknown user'; })(Store.findUser(r.target_id));
        html += '<li class="list-group-item">' +
          '<div class="d-flex justify-content-between">' +
          '<strong>' + UI.escapeHtml(firstLetterCap(r.reason)) + '</strong>' +
          '<small class="text-muted">by ' + UI.escapeHtml(reporter ? reporter.full_name : 'Unknown') + '</small>' +
          '</div>' +
          '<p class="small mb-1">' + target + '</p>' +
          (r.details ? '<p class="small text-muted mb-1">' + UI.escapeHtml(r.details) + '</p>' : '') +
          '<button class="btn btn-sm btn-outline-secondary" data-resolve-report="' + r.id + '">Mark Resolved</button>' +
          '</li>';
      });
    }
    html += '</ul></div></div></div>';
    html += '</div>';
    wrap.innerHTML = html;

    wrap.querySelectorAll('[data-verify-property]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = Store.findProperty(btn.getAttribute('data-verify-property'));
        if (!p) { return; }
        p.verification = 'verified';
        Store.updateProperty(p).then(function () {
          Session.flash('success', 'Property marked as verified.');
          renderModeration();
        });
      });
    });
    wrap.querySelectorAll('[data-reject-property]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = Store.findProperty(btn.getAttribute('data-reject-property'));
        if (!p) { return; }
        p.verification = 'rejected';
        Store.updateProperty(p).then(function () {
          Session.flash('warning', 'Property verification rejected.');
          renderModeration();
        });
      });
    });
    wrap.querySelectorAll('[data-resolve-report]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var r = Store.reports.find(function (x) { return String(x.id) === btn.getAttribute('data-resolve-report'); });
        if (!r) { return; }
        r.status = 'resolved';
        Store.updateReport(r).then(function () {
          Session.flash('success', 'Report marked as resolved.');
          renderModeration();
        });
      });
    });
  }

  function firstLetterCap(s) {
    s = (s || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    return s || '\u2014';
  }

  function renderDashboard() {
    var cards = document.getElementById('stats-cards');
    if (!cards) { return; }
    cards.innerHTML = statCards();
    renderModeration();

    var usersEl = document.getElementById('recent-users');
    var recentUsers = Store.users.slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); }).slice(0, 5);
    usersEl.innerHTML = recentUsers.length
      ? recentUsers.map(function (u) {
          return '<li class="list-group-item d-flex justify-content-between">' +
            '<span>' + UI.escapeHtml(u.full_name) + ' <small class="text-muted">(' + UI.escapeHtml(u.role) + ')</small></span>' +
            '<span class="badge ' + (u.is_active !== false ? 'bg-success' : 'bg-danger') + '">' +
            (u.is_active !== false ? 'Active' : 'Inactive') + '</span></li>';
        }).join('')
      : '<li class="list-group-item text-muted">No users yet.</li>';

    var propsEl = document.getElementById('recent-properties');
    var recentProps = Store.properties.slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); }).slice(0, 5);
    propsEl.innerHTML = recentProps.length
      ? recentProps.map(function (p) {
          return '<li class="list-group-item">' +
            '<a href="property.html?id=' + p.id + '">' + UI.escapeHtml(p.title) + '</a><br>' +
            '<small class="text-muted">' + UI.escapeHtml(UI.location(p)) + ' \u00B7 ' + UI.formatPrice(p.price) + '</small></li>';
        }).join('')
      : '<li class="list-group-item text-muted">No properties yet.</li>';
  }

  function renderUsers() {
    var tbody = document.getElementById('users-table');
    if (!tbody) { return; }
    var me = Session.currentUser();
    var rows = Store.users.slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); }).map(function (u) {
      var action;
      if (String(u.account_id || u.id) === String(me.id)) {
        action = '<span class="text-muted small">You</span>';
      } else {
        var isActive = u.is_active !== false;
        action = '<button class="btn btn-sm btn-outline-' + (isActive ? 'danger' : 'success') + '" ' +
          'data-toggle-user="' + u.id + '">' + (isActive ? 'Deactivate' : 'Activate') + '</button>';
      }
      return '<tr>' +
        '<td>' + u.id + '</td>' +
        '<td>' + UI.escapeHtml(u.full_name) + '<br><small class="text-muted">@' + UI.escapeHtml(u.username) + '</small></td>' +
        '<td>' + UI.escapeHtml(u.email) + '</td>' +
        '<td><span class="badge bg-secondary">' + UI.escapeHtml(u.role) + '</span></td>' +
        '<td>' + (u.is_active !== false ? '<span class="badge bg-success">Active</span>' : '<span class="badge bg-danger">Inactive</span>') + '</td>' +
        '<td>' + UI.formatDate(u.created_at) + '</td>' +
        '<td>' + action + '</td></tr>';
    }).join('');
    tbody.innerHTML = rows;

    tbody.querySelectorAll('[data-toggle-user]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-toggle-user');
        var u = Store.findUser(id);
        if (!u) { return; }
        u.is_active = (u.is_active === false);
        Store.updateUser(u).then(function () {
          Session.flash('success', 'User ' + u.username + ' has been ' +
            (u.is_active ? 'activated' : 'deactivated') + '.');
          renderUsers();
        });
      });
    });
  }

  function exportUsersCsv() {
    var rows = Store.users.slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    var cols = ['id', 'username', 'full_name', 'email', 'phone', 'role', 'is_active', 'created_at'];
    function esc(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
    var csv = cols.join(',') + '\r\n' + rows.map(function (u) {
      return cols.map(function (c) {
        return esc(c === 'is_active' ? (u.is_active !== false) : u[c]);
      }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'rentease-users-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function wireCsvExport() {
    var btn = document.getElementById('export-users-csv');
    if (btn) {
      btn.addEventListener('click', function () {
        if (!Store.users.length) {
          Session.flash('warning', 'No users to export.');
          return;
        }
        exportUsersCsv();
        Session.flash('success', 'Users exported to CSV.');
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    RE.init().then(function () {
      var me = UI.requireRole(['admin']);
      if (!me) { return; }
      renderDashboard();
      renderUsers();
      wireCsvExport();
    });
  });
})();
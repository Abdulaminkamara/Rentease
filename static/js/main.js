/* ============================================================
   RentEase - Shared UI & helpers
   Renders navigation, footer and flash messages and provides
   small helpers used across all pages.
   ============================================================ */
(function () {
  'use strict';

  var RE = window.RentEase;
  var Store = RE.Store;
  var Session = RE.Session;

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c];
    });
  }

  function formatPrice(n) {
    return 'Nle ' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  /* "Lumley, Freetown" — Sierra Leone communities live in the pincode
     field. Falls back to city alone when no area is recorded. */
  function location(prop) {
    if (!prop) { return ''; }
    var area = String(prop.pincode || '').trim();
    var city = String(prop.city || '').trim();
    return area && city && area.toLowerCase() !== city.toLowerCase()
      ? area + ', ' + city
      : (city || area);
  }

  /* "Wilberforce, Freetown, Western Area" — full one-line location. */
  function locationLine(prop) {
    if (!prop) { return ''; }
    var base = location(prop);
    return (base ? base + ', ' : '') + String(prop.state || prop.city || '').trim();
  }

  function formatDate(iso) {
    if (!iso) { return ''; }
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return iso; }
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function starHtml(rating) {
    var out = '';
    var r = Math.round(Number(rating) || 0);
    for (var i = 0; i < 5; i++) {
      out += i < r
        ? '<i class="bi bi-star-fill"></i>'
        : '<i class="bi bi-star"></i>';
    }
    return out;
  }

  function statusBadge(status) {
    var map = {
      'available': 'success',
      'rented': 'secondary',
      'pending': 'warning text-dark',
      'inactive': 'secondary',
      'approved': 'success',
      'rejected': 'danger'
    };
    var cls = map[status] || 'secondary';
    return '<span class="badge bg-' + cls.split(' ')[0] + ' ' + (cls.split(' ')[1] || '') + '">' +
      escapeHtml(status.charAt(0).toUpperCase() + status.slice(1)) + '</span>';
  }

  function primaryImage(prop) {
    return prop.images && prop.images.length ? prop.images[0] : RE.placeholderImage(prop.title || 'Property', 800, 600);
  }

  /* Renders one property card (used by index, properties, landlord dashboard) */
  function cardHtml(prop, opts) {
    opts = opts || {};
    var img = primaryImage(prop);
    var meta = '<i class="bi bi-geo-alt"></i> ' + escapeHtml(location(prop)) +
      ' &nbsp;|&nbsp; ' + prop.bedrooms + ' Bed \u00B7 ' + prop.bathrooms + ' Bath \u00B7 ' +
      escapeHtml(prop.property_type.charAt(0).toUpperCase() + prop.property_type.slice(1));
    var demoNote = Store.isDemoProperty(prop)
      ? '<span class="badge bg-light text-dark border demo-badge" title="This is sample demo data, not a real listing."><i class="bi bi-info-circle"></i> Sample Listing</span>'
      : '';

    var ratingBlock = '';
    if (Store.averageRating(prop.id) > 0) {
      ratingBlock = '<p class="rating-stars small mb-2">' + starHtml(Store.averageRating(prop.id)) +
        ' <span class="text-muted">(' + Store.reviewCount(prop.id) + ')</span></p>';
    }

    var actions = '';
    if (opts.owner) {
      actions =
        '<div class="mt-3 d-flex gap-2">' +
        '<a href="property.html?id=' + prop.id + '" class="btn btn-sm btn-outline-primary">View</a>' +
        '<a href="property-form.html?id=' + prop.id + '" class="btn btn-sm btn-outline-secondary">Edit</a>' +
        '<button class="btn btn-sm btn-outline-danger" data-delete-property="' + prop.id + '">Delete</button>' +
        '</div>';
    } else {
      actions =
        '<div class="d-flex justify-content-between align-items-center">' +
        '<span class="price-tag">' + formatPrice(prop.price) + '/mo</span>' +
        '<a href="property.html?id=' + prop.id + '" class="btn btn-sm btn-primary">' +
        (opts.showDetails ? 'Details' : 'View') + '</a>' +
        '</div>';
    }

    return '<div class="col-md-4">' +
      '<div class="card property-card h-100 shadow-sm">' +
      '<a href="property.html?id=' + prop.id + '" class="card-img-wrap">' +
      '<img src="' + img + '" loading="lazy" width="400" height="300" class="card-img-top" alt="' + escapeHtml(prop.title) + '">' +
      '<span class="card-img-chip">' + escapeHtml(prop.property_type.charAt(0).toUpperCase() + prop.property_type.slice(1)) + '</span>' +
      '</a>' +
      '<span class="' + statusBadge(prop.status).replace('class="', 'class="badge-status ') + '</span>' +
      '<div class="card-body">' +
      '<div class="d-flex justify-content-between align-items-start gap-2">' +
      '<h5 class="card-title mb-0"><a class="text-decoration-none text-dark" href="property.html?id=' + prop.id + '">' + escapeHtml(prop.title) + '</a></h5>' +
      demoNote +
      '</div>' +
      '<p class="text-muted small mb-1 mt-1">' + meta + '</p>' +
      ratingBlock +
      actions +
      '</div></div></div>';
  }

  function cardPlaceholder(text, ctaHref, ctaText) {
    return '<div class="col-12 text-center text-muted py-5">' +
      '<i class="bi bi-house display-1"></i>' +
      '<p class="mt-3">' + (text || 'No properties found.') + '</p>' +
      (ctaHref ? '<a href="' + ctaHref + '" class="btn btn-primary">' + (ctaText || 'Go') + '</a>' : '') +
      '</div>';
  }

  function renderNavbar() {
    var container = document.getElementById('site-nav');
    if (!container) { return; }
    var user = Session.currentUser();
    var right;
    if (user) {
      var roleLinks = '';
      if (user.role === 'landlord') {
        roleLinks =
          '<li class="nav-item"><a class="nav-link" href="property-form.html"><i class="bi bi-plus-circle"></i> Add Property</a></li>';
      } else if (user.role === 'admin') {
        roleLinks =
          '<li class="nav-item"><a class="nav-link" href="admin-users.html"><i class="bi bi-people"></i> Manage Users</a></li>';
      } else {
        roleLinks =
          '<li class="nav-item"><a class="nav-link" href="properties.html"><i class="bi bi-search"></i> Find Property</a></li>';
      }
      var unread = Store.unreadCount(user.id);
      var bell = '<li class="nav-item">' +
        '<a class="nav-link position-relative" href="' + Session.roleRedirect() + '">' +
        '<i class="bi bi-bell"></i>' +
        (unread ? '<span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">' + unread + '</span>' : '') +
        '</a></li>';
      right =
        roleLinks + bell +
        '<li class="nav-item"><a class="nav-link" href="' + Session.roleRedirect() + '">' +
        '<i class="bi bi-speedometer2"></i> Dashboard</a></li>' +
        '<li class="nav-item dropdown">' +
        '<a class="nav-link dropdown-toggle" href="#" data-bs-toggle="dropdown">' +
        '<i class="bi bi-person-circle"></i> ' + escapeHtml(user.full_name) + '</a>' +
        '<ul class="dropdown-menu dropdown-menu-end">' +
        '<li><span class="dropdown-item-text text-muted small">' + escapeHtml(user.role.charAt(0).toUpperCase() + user.role.slice(1)) + '</span></li>' +
        '<li><hr class="dropdown-divider"></li>' +
        '<li><a class="dropdown-item" href="#" id="logout-link"><i class="bi bi-box-arrow-right"></i> Logout</a></li>' +
        '</ul></li>';
    } else {
      right =
        '<li class="nav-item"><a class="nav-link" href="login.html">Login</a></li>' +
        '<li class="nav-item ms-lg-2"><a class="btn btn-brand btn-sm px-3 py-2" href="register.html">Register</a></li>';
    }
    container.innerHTML =
      '<nav class="navbar navbar-expand-lg rent-nav sticky-top">' +
      '<div class="container">' +
      '<a class="navbar-brand fw-bold" href="index.html"><span class="brand-icon"><i class="bi bi-house-heart-fill"></i></span>RentEase</a>' +
      '<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-label="Toggle navigation">' +
      '<span class="navbar-toggler-icon"></span></button>' +
      '<div class="collapse navbar-collapse" id="navbarNav">' +
      '<ul class="navbar-nav me-auto">' +
      '<li class="nav-item"><a class="nav-link" href="index.html">Home</a></li>' +
      '<li class="nav-item"><a class="nav-link" href="properties.html">Browse Properties</a></li>' +
      '</ul>' +
      '<ul class="navbar-nav align-items-lg-center">' + right + '</ul>' +
      '</div></div></nav>';
    var rentNav = container.querySelector('.navbar');
    if (rentNav) {
      var onNavScroll = function () {
        if (window.scrollY > 6) { rentNav.classList.add('scrolled'); } else { rentNav.classList.remove('scrolled'); }
      };
      window.addEventListener('scroll', onNavScroll, { passive: true });
      onNavScroll();
    }
    var logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
      logoutLink.addEventListener('click', function (e) {
        e.preventDefault();
        Session.logout().then(function () {
          Session.flash('info', 'You have been logged out.');
          window.location.href = 'index.html';
        });
      });
    }
  }

  function renderFooter() {
    var container = document.getElementById('site-footer');
    if (!container) { return; }
    container.innerHTML =
      '<footer class="site-footer">' +
      '<div class="container py-4">' +
      '<div class="d-flex flex-column flex-md-row align-items-center justify-content-between gap-2 text-center">' +
      '<p class="fw-bold brand-footer"><span class="brand-icon"><i class="bi bi-house-heart-fill"></i></span>RentEase</p>' +
      '<p class="small text-light-emphasis">&copy; 2026 RentEase \u2013 Online Rental & Property Listing Management System</p>' +
      '<p class="small text-light-emphasis">Final Year Project | HTML, CSS & JavaScript</p>' +
      '</div></div></footer>';
  }

  function showFlashes() {
    var flashes = Session.drainFlashes();
    if (!flashes.length) { return; }
    var host = document.getElementById('flash-container') || document.querySelector('main') ||
      document.body;
    if (host.id !== 'flash-container' && host.insertBefore) {
      var wrap = document.createElement('div');
      wrap.className = 'container mt-3';
      wrap.id = 'flash-container';
      host.insertBefore(wrap, host.firstChild);
      host = wrap;
    }
    flashes.forEach(function (f) {
      var el = document.createElement('div');
      el.className = 'alert alert-' + f.category + ' alert-dismissible fade show';
      el.setAttribute('role', 'alert');
      el.innerHTML = escapeHtml(f.message) +
        '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>';
      host.appendChild(el);
    });
    window.setTimeout(function () {
      var list = document.querySelectorAll('#flash-container .alert');
      [].forEach.call(list, function (a) {
        var bs = window.bootstrap && bootstrap.Alert ? bootstrap.Alert.getOrCreateInstance(a) : null;
        if (bs) { bs.close(); }
      });
    }, 5000);
  }

  /* Guard: redirects to login (or a role dashboard) when the
     current user does not satisfy the required roles. */
  function requireRole(roles) {
    var user = Session.currentUser();
    if (!user) {
      window.location.href = 'login.html';
      return null;
    }
    if (roles.indexOf(user.role) === -1) {
      Session.flash('danger', 'You do not have permission to access this page.');
      window.location.href = Session.roleRedirect();
      return null;
    }
    return user;
  }

  /* Compress an uploaded image file into a data URL (max 900px wide). */
  function compressImage(file, maxDim) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height;
          maxDim = maxDim || 900;
          if (w > maxDim) {
            h = Math.round(h * maxDim / w);
            w = maxDim;
          }
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = function () { reject(new Error('Could not read image.')); };
        img.src = e.target.result;
      };
      reader.onerror = function () { reject(new Error('Could not read file.')); };
      reader.readAsDataURL(file);
    });
  }

  function qs(name, fallback) {
    var match = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : fallback;
  }

  window.RentEase.UI = {
    escapeHtml: escapeHtml,
    formatPrice: formatPrice,
    formatDate: formatDate,
    starHtml: starHtml,
    statusBadge: statusBadge,
    primaryImage: primaryImage,
    location: location,
    locationLine: locationLine,
    cardHtml: cardHtml,
    cardPlaceholder: cardPlaceholder,
    renderNavbar: renderNavbar,
    renderFooter: renderFooter,
    showFlashes: showFlashes,
    requireRole: requireRole,
    compressImage: compressImage,
    qs: qs
  };

  function showOfflineNotice() {
    var host = document.getElementById('flash-container') || document.querySelector('main') ||
      document.body;
    if (host.id === 'flash-container' || host.querySelector) {
      var note = document.createElement('div');
      note.className = 'container mt-3';
      note.innerHTML =
        '<div class="alert alert-warning alert-dismissible fade show" role="alert">' +
        '<strong>Appwrite is not configured.</strong> Open <code>static/js/config.js</code>, ' +
        'fill in your project ID, database and table IDs (see the README), then refresh. ' +
        '<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>';
      host.insertBefore(note, host.firstChild);
    }
  }

  function showLoading() {
    var host = document.querySelector('main') || document.body;
    if (!host || document.getElementById('page-loading')) { return; }
    var el = document.createElement('div');
    el.id = 'page-loading';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="container py-5 text-center text-muted">' +
      '<div class="spinner-border text-primary" role="status"></div>' +
      '<p class="mt-2 mb-0">Loading RentEase\u2026</p></div>';
    if (host.firstChild) {
      host.insertBefore(el, host.firstChild);
    } else {
      host.appendChild(el);
    }
  }

  function hideLoading() {
    var el = document.getElementById('page-loading');
    if (el && el.parentNode) { el.parentNode.removeChild(el); }
  }

  document.addEventListener('DOMContentLoaded', function () {
    showLoading();
    RE.init().then(function () {
      renderNavbar();
      renderFooter();
      showFlashes();
      if (RE.offline) {
        showOfflineNotice();
      }
      hideLoading();
    });
  });
})();
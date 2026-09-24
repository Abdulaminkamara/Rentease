/* RentEase - Property detail page: carousel, specs, reviews, booking */
(function () {
  'use strict';
  var RE = window.RentEase;
  var Store = RE.Store;
  var Session = RE.Session;
  var UI = RE.UI;

  function setMeta(prop, content) {
    var el = document.querySelector('meta[property="' + prop + '"], meta[name="' + prop + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(prop.indexOf('og:') === 0 || prop === 'og:type' ? 'property' : 'name', prop);
      document.head.appendChild(el);
    }
    el.setAttribute('content', String(content));
  }

  function carouselHtml(prop) {
    if (!prop.images || !prop.images.length) {
      return '<img src="' + RE.placeholderImage(prop.title, 800, 400) + '" class="card-img-top" alt="' + UI.escapeHtml(prop.title) + '">';
    }
    var items = prop.images.map(function (src, i) {
      return '<div class="carousel-item' + (i === 0 ? ' active' : '') + '">' +
        '<img src="' + src + '"' + (i > 0 ? ' loading="lazy"' : '') +
        ' class="d-block w-100 prop-hero-img" alt="' + UI.escapeHtml(prop.title) + ' \u2014 photo ' + (i + 1) + ' of ' + prop.images.length + '">' +
        '</div>';
    }).join('');
    var controls = prop.images.length > 1
      ? '<button class="carousel-control-prev" type="button" data-bs-target="#propCarousel" data-bs-slide="prev">' +
        '<span class="carousel-control-prev-icon"></span></button>' +
        '<button class="carousel-control-next" type="button" data-bs-target="#propCarousel" data-bs-slide="next">' +
        '<span class="carousel-control-next-icon"></span></button>'
      : '';
    var thumbs = prop.images.length > 1
      ? '<div class="prop-thumbs d-flex gap-2 mt-2 overflow-auto" role="group" aria-label="Property photos">' +
        prop.images.map(function (src, i) {
          return '<button type="button" class="prop-thumb' + (i === 0 ? ' active' : '') + '" data-img="' + i + '" aria-label="Photo ' + (i + 1) + ' of ' + prop.images.length + '">' +
            '<img src="' + src + '" loading="lazy" width="120" height="80" alt="' + UI.escapeHtml(prop.title) + ' \u2014 thumbnail ' + (i + 1) + '"></button>';
        }).join('') + '</div>'
      : '';
    var demoAlert = Store.isDemoProperty(prop)
      ? '<div class="alert alert-warning small d-flex align-items-center gap-2 mb-0 mt-3 demo-note">' +
        '<i class="bi bi-info-circle flex-shrink-0"></i>' +
        '<span><strong>Sample listing.</strong> This is demo data bundled with the app to preview the marketplace \u2014 the photos are stock images and there is no real property at this location.</span></div>'
      : '';
    var lightbox = '<div class="prop-lightbox" id="propLightbox" hidden>' +
      '<div class="prop-lightbox-backdrop" data-close-lightbox></div>' +
      '<div class="prop-lightbox-panel">' +
      '<img id="lb-img" src="" alt="">' +
      '<button type="button" class="prop-lightbox-close btn btn-light btn-sm" data-close-lightbox aria-label="Close photos"><i class="bi bi-x-lg"></i></button>' +
      '<div class="prop-lightbox-nav">' +
      '<button type="button" class="btn btn-light btn-sm" data-lb-prev aria-label="Previous photo"><i class="bi bi-chevron-left"></i></button>' +
      '<span id="lb-count" class="text-white small"></span>' +
      '<button type="button" class="btn btn-light btn-sm" data-lb-next aria-label="Next photo"><i class="bi bi-chevron-right"></i></button>' +
      '</div></div></div>';
    return '<div class="prop-carousel">' +
      '<div id="propCarousel" class="carousel slide">' +
      '<div class="carousel-inner">' + items + '</div>' + controls +
      '<button type="button" class="prop-zoom btn btn-sm btn-light" data-zoom aria-label="View photos full screen">' +
      '<i class="bi bi-arrows-fullscreen"></i></button>' +
      '</div>' + thumbs + demoAlert + lightbox + '</div>';
  }

  /* ----- fullscreen photo lightbox ----- */
  var lightboxProp = null;
  var lightboxIdx = 0;

  function lbEl() { return document.getElementById('propLightbox'); }

  function lbImg() { return document.getElementById('lb-img'); }

  function updateLightbox() {
    if (!lightboxProp) { return; }
    var list = lightboxProp.images || [];
    if (lightboxIdx < 0) { lightboxIdx = list.length - 1; }
    if (lightboxIdx >= list.length) { lightboxIdx = 0; }
    var img = lbImg();
    if (img) { img.src = list[lightboxIdx]; }
    var count = document.getElementById('lb-count');
    if (count) { count.textContent = (lightboxIdx + 1) + ' / ' + list.length; }
  }

  function openLightbox(prop, i) {
    lightboxProp = prop;
    lightboxIdx = i;
    var el = lbEl();
    if (el) {
      el.hidden = false;
      updateLightbox();
    }
  }

  function closeLightbox() {
    var el = lbEl();
    if (el) { el.hidden = true; }
    lightboxProp = null;
  }

  function moveLightbox(delta) {
    if (lightboxProp && (lightboxProp.images || []).length > 1) {
      lightboxIdx += delta;
      updateLightbox();
    }
  }

  function bindGallery(prop, wrap) {
    wrap.addEventListener('click', function (e) {
      var thumb = e.target.closest('[data-img]');
      if (thumb) {
        var i = parseInt(thumb.getAttribute('data-img'), 10);
        var carouselEl = document.getElementById('propCarousel');
        if (carouselEl && window.bootstrap && bootstrap.Carousel) {
          bootstrap.Carousel.getOrCreateInstance(carouselEl).to(i);
        }
        openLightbox(prop, i);
        return;
      }
      if (e.target.closest('[data-zoom]')) {
        var activeItem = wrap.querySelector('.carousel-item.active');
        var idx = activeItem ? Array.prototype.indexOf.call(activeItem.parentNode.children, activeItem) : 0;
        openLightbox(prop, idx);
        return;
      }
      if (e.target.closest('[data-close-lightbox]')) { closeLightbox(); }
      if (e.target.closest('[data-lb-prev]')) { moveLightbox(-1); }
      if (e.target.closest('[data-lb-next]')) { moveLightbox(1); }
    });
    document.addEventListener('keydown', function (e) {
      if (lbEl() && !lbEl().hidden) {
        if (e.key === 'Escape') { closeLightbox(); }
        if (e.key === 'ArrowLeft') { moveLightbox(-1); }
        if (e.key === 'ArrowRight') { moveLightbox(1); }
      }
    });
  }

  function specHtml(prop) {
    var cells = [
      { icon: 'bi-door-open', val: prop.bedrooms, label: 'Bedrooms' },
      { icon: 'bi-droplet', val: prop.bathrooms, label: 'Bathrooms' },
      { icon: 'bi-rulers', val: prop.area_sqft || '\u2014', label: 'Sq.ft' },
      { icon: 'bi-house', val: UI.escapeHtml(prop.property_type), label: 'Type' }
    ];
    return cells.map(function (c) {
      return '<div class="col-3"><div class="p-2 bg-light rounded" style="height:100%">' +
        '<i class="bi ' + c.icon + ' text-primary"></i><br>' +
        '<strong>' + c.val + '</strong><br><small>' + c.label + '</small></div></div>';
    }).join('');
  }

  function renderReviews(prop, container) {
    var reviews = Store.reviewsForProperty(prop.id);
    if (!reviews.length) {
      container.innerHTML = '<p class="text-muted">No reviews yet.</p>';
      return;
    }
    container.innerHTML = reviews.map(function (r) {
      var tenant = Store.findUser(r.tenant_id) || { full_name: 'Unknown' };
      return '<div class="border-bottom py-3">' +
        '<div class="d-flex justify-content-between">' +
        '<strong>' + UI.escapeHtml(tenant.full_name) + '</strong>' +
        '<span class="rating-stars">' + UI.starHtml(r.rating) + '</span>' +
        '</div>' +
        '<p class="mb-1">' + UI.escapeHtml(r.comment || 'No comment') + '</p>' +
        '<small class="text-muted">' + UI.formatDate(r.created_at) + '</small>' +
        '</div>';
    }).join('');
  }

  function canReview(prop, user) {
    if (!user) { return false; }
    if (user.role === 'admin') { return true; }
    if (user.role === 'tenant') {
      return !!Store.approvedBookingForTenant(prop.id, user.id);
    }
    return false;
  }

  function renderReviewForm(prop, wrap) {
    var user = Session.currentUser();
    if (!canReview(prop, user)) { return; }

    var existing = Store.reviewByTenant(prop.id, user.id);
    var ratingOptions = [
      ['5', '\u2605\u2605\u2605\u2605\u2605 Excellent'],
      ['4', '\u2605\u2605\u2605\u2605\u2606 Very Good'],
      ['3', '\u2605\u2605\u2605\u2606\u2606 Good'],
      ['2', '\u2605\u2605\u2606\u2606\u2606 Fair'],
      ['1', '\u2605\u2606\u2606\u2606\u2606 Poor']
    ];
    var sel = ratingOptions.map(function (o) {
      var selected = existing && Number(existing.rating) === Number(o[0]) ? ' selected' : '';
      return '<option value="' + o[0] + '"' + selected + '>' + o[1] + '</option>';
    }).join('');

    wrap.innerHTML =
      '<hr>' +
      '<h6>' + (existing ? 'Update your review' : 'Write a Review') + '</h6>' +
      '<form id="review-form">' +
      '<div class="mb-3"><select class="form-select" id="rv-rating">' + sel + '</select></div>' +
      '<div class="mb-3"><textarea class="form-control" id="rv-comment" rows="3" placeholder="Share your experience...">' +
      UI.escapeHtml(existing ? existing.comment || '' : '') + '</textarea></div>' +
      '<button type="submit" class="btn btn-outline-primary btn-sm">' +
      (existing ? 'Update Review' : 'Submit Review') + '</button>' +
      '</form>';

    wrap.querySelector('#review-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var rating = parseInt(wrap.querySelector('#rv-rating').value, 10);
      var comment = wrap.querySelector('#rv-comment').value.trim();
      var review = Store.reviewByTenant(prop.id, user.id);
      if (review) {
        review.rating = rating;
        review.comment = comment;
        Store.updateReview(review).then(function () {
          Session.flash('success', 'Review updated!');
          window.location.reload();
        });
      } else {
        Store.addReview({
          property_id: prop.id,
          tenant_id: user.id,
          rating: rating,
          comment: comment
        }).then(function () {
          Session.flash('success', 'Thank you for your review!');
          window.location.reload();
        });
      }
    });
  }

  function bindSaveToggle(prop, user) {
    var btn = document.getElementById('save-toggle');
    if (!btn) { return; }
    btn.addEventListener('click', function () {
      var saved = Store.isSaved(user.id, prop.id);
      Store.toggleSaved(user.id, prop.id).then(function (nowSaved) {
        if (nowSaved) {
          btn.className = 'btn btn-warning w-100';
          btn.innerHTML = '<i class="bi bi-bookmark-check-fill"></i> Saved';
          Session.flash('success', 'Property saved to your favourites.');
        } else {
          btn.className = 'btn btn-outline-warning w-100';
          btn.innerHTML = '<i class="bi bi-bookmark-plus"></i> Save Property';
          Session.flash('info', 'Property removed from your favourites.');
        }
      });
    });
  }

  function renderBookingSidebar(prop) {
    var sidebar = document.getElementById('booking-sidebar');
    if (!sidebar) { return; }
    var user = Session.currentUser();
    var saveButton = function () {
      var saved = user && Store.isSaved(user.id, prop.id);
      return '<button type="button" class="btn ' + (saved ? 'btn-warning' : 'btn-outline-warning') +
        ' w-100 mb-3" id="save-toggle">' +
        (saved ? '<i class="bi bi-bookmark-check-fill"></i> Saved' : '<i class="bi bi-bookmark-plus"></i> Save Property') +
        '</button>';
    };

    /* Owner of this property sees a management card, not a booking form. */
    if (user && Store.canManageProperty(user, prop)) {
      sidebar.innerHTML =
        '<div class="card shadow-sm sticky-top" style="top:80px;">' +
        '<div class="card-body">' +
        '<h5 class="card-title">Your property</h5>' +
        '<p class="text-muted small">Manage this listing, respond to requests and track rentals from your dashboard.</p>' +
        (Store.bookingsForLandlord(user.id).filter(function (b) {
          return String(b.property_id) === String(prop.id) && b.status === 'pending';
        }).length ?
          '<div class="alert alert-warning small py-2">You have pending rental requests for this property.</div>' : '') +
        '<a href="landlord-dashboard.html" class="btn btn-outline-primary w-100 mb-2"><i class="bi bi-speedometer2"></i> Open Dashboard</a>' +
        '<a href="property-form.html?id=' + prop.id + '" class="btn btn-outline-secondary w-100">Edit Listing</a>' +
        '</div></div>';
      return;
    }

    if (user && user.role === 'tenant' && prop.status === 'available') {
      sidebar.innerHTML =
        '<div class="card shadow-sm sticky-top" style="top:80px;">' +
        '<div class="card-body">' +
        saveButton() +
        '<h5 class="card-title">Request to Rent</h5>' +
        '<form id="booking-form">' +
        '<div class="mb-3"><label class="form-label" for="bk-start">Move-in Date</label>' +
        '<input type="date" class="form-control" id="bk-start" required></div>' +
        '<div class="mb-3"><label class="form-label" for="bk-end">Move-out Date (optional)</label>' +
        '<input type="date" class="form-control" id="bk-end"></div>' +
        '<div class="mb-3"><label class="form-label" for="bk-message">Message to Landlord</label>' +
        '<textarea class="form-control" id="bk-message" rows="3" maxlength="500"></textarea></div>' +
        '<div class="text-danger small mb-2" id="bk-error"></div>' +
        '<button type="submit" class="btn btn-primary w-100">Send Rental Request</button>' +
        '</form></div></div>';

      var today = new Date().toISOString().slice(0, 10);
      var startInput = document.getElementById('bk-start');
      startInput.min = today;
      startInput.value = today;

      document.getElementById('booking-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var err = document.getElementById('bk-error');
        err.textContent = '';
        var start = document.getElementById('bk-start').value;
        var end = document.getElementById('bk-end').value || start;
        if (new Date(end) < new Date(start)) {
          err.textContent = 'Move-out date cannot be before the move-in date.';
          return;
        }
        var existing = Store.activeBookingForTenant(prop.id, user.id);
        if (existing) {
          Session.flash('warning', 'You already have an active request for this property.');
          window.location.href = 'tenant-dashboard.html';
          return;
        }
        Store.addBooking({
          property_id: prop.id,
          tenant_id: user.id,
          start_date: start,
          end_date: end,
          message: document.getElementById('bk-message').value.trim(),
          status: 'pending',
          total_amount: prop.price
        }).then(function () {
          Session.flash('success', 'Rental request sent successfully! The landlord will review it soon.');
          window.location.href = 'tenant-dashboard.html';
        });
      });
      bindSaveToggle(prop, user);
      return;
    }

    if (!user) {
      sidebar.innerHTML =
        '<div class="card shadow-sm"><div class="card-body text-center">' +
        '<p>Please <a href="login.html">login</a> to request or save this property.</p>' +
        '<a href="login.html" class="btn btn-outline-warning w-100"><i class="bi bi-bookmark-plus"></i> Save Property</a>' +
        '</div></div>';
      return;
    }

    if (user && user.role === 'tenant') {
      sidebar.innerHTML =
        '<div class="card shadow-sm"><div class="card-body">' +
        saveButton() + 
        (prop.status === 'rented'
          ? '<div class="text-center"><span class="badge bg-secondary fs-6">This property is already rented</span></div>'
          : '<div class="text-center text-muted">This property is not available for booking right now.</div>') +
        '</div></div>';
      bindSaveToggle(prop, user);
      return;
    }

    sidebar.innerHTML = '<div class="card shadow-sm"><div class="card-body text-center text-muted">' +
      'This property is not available for booking right now.</div></div>';
  }

  function renderReportBox(prop) {
    var wrap = document.getElementById('report-box');
    if (!wrap) { return; }
    var user = Session.currentUser();
    if (user && Store.canManageProperty(user, prop)) { return; }
    wrap.innerHTML =
      '<div class="card shadow-sm mt-3"><div class="card-body text-center">' +
      '<small class="text-muted">Spot a problem with this listing?</small><br>' +
      '<button class="btn btn-outline-danger btn-sm mt-2" id="report-toggle"><i class="bi bi-flag"></i> Report this listing</button>' +
      '<div id="report-form-wrap" class="d-none mt-3 text-start">' +
      '<select class="form-select form-select-sm mb-2" id="report-reason">' +
      '<option value="suspicious_listing">Suspicious listing</option>' +
      '<option value="incorrect_information">Incorrect information</option>' +
      '<option value="duplicate_listing">Duplicate listing</option>' +
      '<option value="inappropriate_content">Inappropriate content</option>' +
      '<option value="suspected_scam">Suspected scam</option>' +
      '<option value="other">Other issue</option>' +
      '</select>' +
      '<textarea class="form-control form-control-sm mb-2" id="report-details" rows="3" placeholder="Any details you can share (optional)"></textarea>' +
      '<button class="btn btn-sm btn-danger w-100" id="report-submit">Submit Report</button>' +
      '</div></div></div>';

    var toggle = document.getElementById('report-toggle');
    toggle.addEventListener('click', function () {
      document.getElementById('report-form-wrap').classList.toggle('d-none');
    });
    document.getElementById('report-submit').addEventListener('click', function () {
      Store.addReport({
        reporter_id: user ? user.id : 'guest',
        target_type: 'property',
        target_id: prop.id,
        reason: document.getElementById('report-reason').value,
        details: document.getElementById('report-details').value.trim(),
        status: 'open'
      }).then(function () {
        Session.flash('success', 'Thank you. Your report has been sent to the administrators.');
        wrap.innerHTML = '<div class="card shadow-sm mt-3"><div class="card-body text-center text-muted small">' +
          '<i class="bi bi-check-circle text-success"></i> Report submitted for review.</div></div>';
      }).catch(function () {
        Session.flash('danger', 'Could not submit your report. Please try again.');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    RE.init().then(function () {
    var pageEl = document.getElementById('property-page');
    if (!pageEl) { return; }

    var id = UI.qs('id', null);
    var prop = Store.findProperty(id);
    if (!prop) {
      pageEl.innerHTML = '<div class="text-center text-muted py-5">' +
        '<i class="bi bi-house-x display-1"></i><p class="mt-3">Property not found.</p>' +
        '<a href="properties.html" class="btn btn-primary">Browse Properties</a></div>';
      return;
    }

    document.title = prop.title + ' | RentEase';
    setMeta('og:title', prop.title + ' | RentEase');
    setMeta('twitter:title', prop.title + ' | RentEase');
    var desc = (prop.description || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (desc) {
      setMeta('description', desc);
      setMeta('og:description', desc);
    }
    var primary = UI.primaryImage(prop);
    if (primary) {
      setMeta('og:image', primary);
    }
    var carouselWrap = document.getElementById('prop-carousel-wrap');
    carouselWrap.innerHTML = carouselHtml(prop);
    bindGallery(prop, carouselWrap);
    document.getElementById('p-title').textContent = prop.title;
    document.getElementById('p-location').textContent = UI.locationLine(prop) + ' \u00B7 Sierra Leone';
    document.getElementById('p-status').innerHTML = UI.statusBadge(prop.status) +
      (prop.verification === 'verified'
        ? ' <span class="badge bg-success"><i class="bi bi-patch-check-fill"></i> Verified listing</span>'
        : ' <span class="badge bg-secondary">Not yet verified</span>');
    document.getElementById('p-price').innerHTML =
      UI.formatPrice(prop.price) + ' <small class="text-muted fs-6">/ month</small>';
    document.getElementById('p-specs').innerHTML = specHtml(prop);
    document.getElementById('p-description').textContent = prop.description;

    var amenities = prop.amenities ? prop.amenities.split(',').map(function (a) { return a.trim(); }).filter(Boolean) : [];
    var amenityEl = document.getElementById('p-amenities');
    amenityEl.innerHTML = '<h5 class="mt-4">Amenities</h5>' +
      '<div class="d-flex flex-wrap gap-2">' +
      amenities.map(function (a) {
        return '<span class="badge bg-light text-dark border">' + UI.escapeHtml(a) + '</span>';
      }).join('') + '</div>';

    document.getElementById('p-furnished').textContent =
      'Furnished: ' + (prop.is_furnished ? 'Yes' : 'No');

    var landlord = Store.findUser(prop.landlord_id);
    document.getElementById('p-listed-by').textContent =
      'Listed by: ' + (landlord ? landlord.full_name : 'Unknown') + ' \u00B7 ' + UI.formatDate(prop.created_at);

    var heading = document.getElementById('reviews-heading');
    var avg = Store.averageRating(prop.id);
    var count = Store.reviewCount(prop.id);
    if (count > 0) {
      heading.innerHTML = 'Reviews <span class="rating-stars">' + avg + ' \u2605</span>' +
        ' <small class="text-muted">(' + count + ' review' + (count > 1 ? 's' : '') + ')</small>';
    }

    renderReviews(prop, document.getElementById('reviews-list'));
    renderReviewForm(prop, document.getElementById('review-form-wrap'));
    renderBookingSidebar(prop);
    renderReportBox(prop);
    });
  });
})();
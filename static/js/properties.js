/* RentEase - Browse properties page: filters, grid, pagination */
(function () {
  'use strict';
  var RE = window.RentEase;
  var Store = RE.Store;
  var UI = RE.UI;

  var PER_PAGE = 9;

  function collectFilters() {
    var page = parseInt(UI.qs('page', '1'), 10) || 1;
    return {
      page: page,
      keyword: UI.qs('keyword', ''),
      city: UI.qs('city', ''),
      property_type: UI.qs('property_type', ''),
      min_price: UI.qs('min_price', ''),
      max_price: UI.qs('max_price', ''),
      bedrooms: UI.qs('bedrooms', '')
    };
  }

  function applyFilters(list, f) {
    return list.filter(function (p) {
      if (f.keyword) {
        var kw = f.keyword.toLowerCase();
        var hay = (p.title + ' ' + p.description + ' ' + p.address + ' ' + (p.pincode || '') + ' ' + p.city).toLowerCase();
        if (hay.indexOf(kw) === -1) { return false; }
      }
      if (f.city && p.city.toLowerCase().indexOf(f.city.toLowerCase()) === -1) { return false; }
      if (f.property_type && p.property_type !== f.property_type) { return false; }
      if (f.min_price && Number(p.price) < Number(f.min_price)) { return false; }
      if (f.max_price && Number(p.price) > Number(f.max_price)) { return false; }
      if (f.bedrooms && Number(p.bedrooms) < Number(f.bedrooms)) { return false; }
      return true;
    });
  }

  function paginationHtml(qsNow, page, pages) {
    if (pages <= 1) { return ''; }
    function link(p) {
      var params = new URLSearchParams(qsNow);
      params.set('page', p);
      return 'properties.html?' + params.toString();
    }
    var html = '<ul class="pagination justify-content-center">';
    html += '<li class="page-item' + (page <= 1 ? ' disabled' : '') + '"><a class="page-link" href="' + link(page - 1) + '">Previous</a></li>';
    for (var i = 1; i <= pages; i++) {
      html += '<li class="page-item' + (i === page ? ' active' : '') + '"><a class="page-link" href="' + link(i) + '">' + i + '</a></li>';
    }
    html += '<li class="page-item' + (page >= pages ? ' disabled' : '') + '"><a class="page-link" href="' + link(page + 1) + '">Next</a></li>';
    return html + '</ul>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    RE.init().then(function () {
    var listEl = document.getElementById('property-list');
    var pagEl = document.getElementById('pagination');
    if (!listEl) { return; }

    var filters = collectFilters();

    // Reflect filters in the form controls
    document.getElementById('f-keyword').value = filters.keyword;
    document.getElementById('f-city').value = filters.city;
    document.getElementById('f-type').value = filters.property_type;
    document.getElementById('f-bedrooms').value = filters.bedrooms;
    document.getElementById('f-min').value = filters.min_price;
    document.getElementById('f-max').value = filters.max_price;

    document.getElementById('search-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var params = new URLSearchParams();
      if (document.getElementById('f-keyword').value) { params.set('keyword', document.getElementById('f-keyword').value); }
      if (document.getElementById('f-city').value) { params.set('city', document.getElementById('f-city').value); }
      if (document.getElementById('f-type').value) { params.set('property_type', document.getElementById('f-type').value); }
      if (document.getElementById('f-bedrooms').value) { params.set('bedrooms', document.getElementById('f-bedrooms').value); }
      if (document.getElementById('f-min').value) { params.set('min_price', document.getElementById('f-min').value); }
      if (document.getElementById('f-max').value) { params.set('max_price', document.getElementById('f-max').value); }
      window.location.href = 'properties.html' + (params.toString() ? '?' + params.toString() : '');
    });

    var all = Store.publicProperties()
      .slice()
      .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    var filtered = applyFilters(all, filters);
    var pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    var page = Math.min(Math.max(1, filters.page), pages);
    var start = (page - 1) * PER_PAGE;
    var pageItems = filtered.slice(start, start + PER_PAGE);

    if (!pageItems.length) {
      listEl.innerHTML = UI.cardPlaceholder('No properties found matching your criteria.', 'properties.html', 'Clear Search');
    } else {
      listEl.innerHTML = pageItems.map(function (p) { return UI.cardHtml(p, { showDetails: true }); }).join('');
    }

    pagEl.innerHTML = paginationHtml(window.location.search.replace(/^\?/, ''), page, pages);

    window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
})();
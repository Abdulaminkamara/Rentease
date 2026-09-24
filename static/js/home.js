/* RentEase - Home page: featured properties */
(function () {
  'use strict';
  var RE = window.RentEase;
  var Store = RE.Store;
  var UI = RE.UI;

  document.addEventListener('DOMContentLoaded', function () {
    RE.init().then(function () {
    var container = document.getElementById('featured-properties');
    if (!container) { return; }

    var featured = Store.publicProperties()
      .filter(function (p) { return p.status === 'available'; })
      .slice()
      .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); })
      .slice(0, 6);

    if (!featured.length) {
      container.innerHTML = UI.cardPlaceholder('No properties listed yet. Be the first landlord to add one!', 'register.html', 'Get Started');
      return;
    }

    container.innerHTML = featured.map(function (p) { return UI.cardHtml(p, { showDetails: false }); }).join('');

    // Only show "Get Started" hero button to guests
    var getStarted = document.getElementById('get-started');
    if (getStarted && RE.Session.isAuthenticated()) {
      getStarted.style.display = 'none';
    }
    });
  });
})();
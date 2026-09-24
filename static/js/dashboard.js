/* RentEase - Role redirect page (dashboard.html) */
(function () {
  'use strict';
  var RE = window.RentEase;

  document.addEventListener('DOMContentLoaded', function () {
    RE.init().then(function () {
      var user = RE.Session.currentUser();
      window.location.href = user ? RE.Session.roleRedirect() : 'login.html';
    });
  });
})();
/* RentEase - Authentication: login & register (Appwrite-backed) */
(function () {
  'use strict';
  var RE = window.RentEase;
  var Store = RE.Store;
  var Session = RE.Session;

  function handleLogin() {
    var form = document.getElementById('login-form');
    if (!form) { return; }

    if (Session.isAuthenticated()) {
      window.location.href = Session.roleRedirect();
      return;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('email').value.trim();
      var password = document.getElementById('password').value;
      document.getElementById('email-error').textContent = '';
      document.getElementById('password-error').textContent = '';

      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; }

      RE.api.account.createEmailPasswordSession({ email: email, password: password })
        .then(function () { return Session.refresh(); })
        .then(function (user) {
          if (!user || user.is_active === false) {
            return Session.logout().then(function () {
              document.getElementById('password-error').textContent =
                'Your account has been deactivated. Please contact the administrator.';
            });
          }
          Session.flash('success', 'Welcome back, ' + user.full_name + '!');
          window.location.href = Session.roleRedirect();
        })
        .catch(function () {
          document.getElementById('password-error').textContent = 'Invalid email or password.';
        })
        .then(function () { if (btn) { btn.disabled = false; } });
    });
  }

  function handleRegister() {
    var form = document.getElementById('register-form');
    if (!form) { return; }

    if (Session.isAuthenticated()) {
      window.location.href = 'index.html';
      return;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = document.getElementById('register-error');
      errEl.textContent = '';

      var username = document.getElementById('r-username').value.trim();
      var fullName = document.getElementById('r-fullname').value.trim();
      var email = document.getElementById('r-email').value.trim();
      var phone = document.getElementById('r-phone').value.trim();
      var role = document.getElementById('r-role').value;
      var password = document.getElementById('r-password').value;
      var confirm = document.getElementById('r-confirm').value;

      if (password.length < 8) {
        errEl.textContent = 'Password must be at least 8 characters long (Appwrite minimum).';
        return;
      }
      if (password !== confirm) {
        errEl.textContent = 'Passwords do not match.';
        return;
      }

      var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(email)) {
        errEl.textContent = 'Please enter a valid email address.';
        return;
      }

      if (Store.findUserByEmail(email)) {
        errEl.textContent = 'Email already registered. Please use a different email.';
        return;
      }
      if (Store.users.some(function (u) { return u.username.toLowerCase() === username.toLowerCase(); })) {
        errEl.textContent = 'Username already taken. Please choose a different one.';
        return;
      }

      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; }

      RE.api.account.create({
        userId: Appwrite.ID.unique(),
        email: email,
        password: password,
        name: fullName
      })
        .then(function () {
          return RE.api.account.createEmailPasswordSession({ email: email, password: password });
        })
        .then(function () {
          return RE.api.account.updatePrefs({ role: role, phone: phone, username: username });
        })
        .then(function () {
          return RE.api.account.get();
        })
        .then(function (acc) {
          return Store.addUser({
            account_id: acc.$id,
            username: username,
            email: email,
            phone: phone,
            full_name: fullName,
            role: role,
            is_active: true,
            created_at: RE.nowISO()
          });
        })
        .then(function () {
          return Session.refresh();
        })
        .then(function (user) {
          Session.flash('success', 'Welcome to RentEase, ' + user.full_name + '! Your account is ready.');
          window.location.href = Session.roleRedirect();
        })
        .catch(function (err) {
          if (err && (err.code === 409 || /already|exists/i.test(err.message || ''))) {
            errEl.textContent = 'Email already registered. Please use a different email.';
          } else {
            errEl.textContent = 'Registration failed. Please try again.';
          }
          if (btn) { btn.disabled = false; }
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    RE.init().then(function () {
      handleLogin();
      handleRegister();
    });
  });
})();
/* RentEase - Add / edit property form with image upload */
(function () {
  'use strict';
  var RE = window.RentEase;
  var Store = RE.Store;
  var Session = RE.Session;
  var UI = RE.UI;

  var editId = null;
  var keptImages = [];
  var newImages = [];

  function renderPreview() {
    var wrap = document.getElementById('image-preview');
    var all = keptImages.concat(newImages);
    wrap.innerHTML = all.map(function (img, i) {
      var isNew = i >= keptImages.length;
      return '<div class="position-relative" style="width:90px;height:70px;">' +
        '<img src="' + img + '" class="w-100 h-100 rounded" style="object-fit:cover;" alt="preview">' +
        '<button type="button" class="btn-close position-absolute top-0 end-0 bg-white rounded-circle p-1" ' +
        'style="font-size:10px;" data-remove-image="' + i + '" data-new="' + isNew + '" aria-label="Remove"></button>' +
        '</div>';
    }).join('');

    wrap.querySelectorAll('[data-remove-image]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-remove-image'));
        if (btn.getAttribute('data-new') === 'true') {
          newImages.splice(idx - keptImages.length, 1);
        } else {
          keptImages.splice(idx, 1);
        }
        renderPreview();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    RE.init().then(function () {
    var user = UI.requireRole(['landlord', 'admin']);
    if (!user) { return; }

    var form = document.getElementById('property-form');
    var page = UI.qs('id', null);
    var prop = null;

    if (page) {
      prop = Store.findProperty(page);
      if (!prop) {
        Session.flash('danger', 'Property not found.');
        window.location.href = 'landlord-dashboard.html';
        return;
      }
      if (!Store.canManageProperty(user, prop)) {
        Session.flash('danger', 'You do not have permission to edit this property.');
        window.location.href = Session.roleRedirect();
        return;
      }
      editId = prop.id;
      document.title = 'Edit Property | RentEase';
      document.getElementById('page-title').textContent = 'Edit Property | RentEase';
      document.getElementById('form-title').textContent = 'Edit Property';
      document.getElementById('save-button').textContent = 'Save Changes';

      document.getElementById('f-title').value = prop.title;
      document.getElementById('f-description').value = prop.description;
      document.getElementById('f-address').value = prop.address;
      document.getElementById('f-pincode').value = prop.pincode || '';
      document.getElementById('f-city').value = prop.city;
      document.getElementById('f-state').value = prop.state;
      document.getElementById('f-price').value = prop.price;
      document.getElementById('f-type').value = prop.property_type;
      document.getElementById('f-status').value = prop.status;
      document.getElementById('f-bedrooms').value = prop.bedrooms;
      document.getElementById('f-bathrooms').value = prop.bathrooms;
      document.getElementById('f-area').value = prop.area_sqft || '';
      document.getElementById('f-amenities').value = prop.amenities || '';
      document.getElementById('f-furnished').checked = !!prop.is_furnished;
      keptImages = (prop.images || []).slice();
      renderPreview();
    }

    var fileInput = document.getElementById('f-images');
    fileInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(fileInput.files);
      if (!files.length) { return; }
      var allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      var tasks = files.map(function (file) {
        if (allowed.indexOf(file.type) === -1) {
          return Promise.resolve(null);
        }
        return UI.compressImage(file, 900);
      });
      Promise.all(tasks).then(function (results) {
        results.forEach(function (dataUrl) {
          if (dataUrl) { newImages.push(dataUrl); }
        });
        renderPreview();
        fileInput.value = '';
      }).catch(function (err) {
        Session.flash('danger', err.message || 'Could not read an image file.');
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = document.getElementById('form-error');
      errEl.textContent = '';

      var data = {
        landlord_id: user.id,
        title: document.getElementById('f-title').value.trim(),
        description: document.getElementById('f-description').value.trim(),
        address: document.getElementById('f-address').value.trim(),
        pincode: document.getElementById('f-pincode').value.trim(),
        city: document.getElementById('f-city').value.trim(),
        state: document.getElementById('f-state').value.trim(),
        price: Number(document.getElementById('f-price').value),
        property_type: document.getElementById('f-type').value,
        status: document.getElementById('f-status').value,
        bedrooms: Number(document.getElementById('f-bedrooms').value) || 1,
        bathrooms: Number(document.getElementById('f-bathrooms').value) || 1,
        area_sqft: Number(document.getElementById('f-area').value) || null,
        amenities: document.getElementById('f-amenities').value.trim(),
        is_furnished: document.getElementById('f-furnished').checked,
        images: keptImages.concat(newImages)
      };

      if (!data.title || !data.description || !data.address || !data.city || !data.state || !data.price) {
        errEl.textContent = 'Please fill in all required fields.';
        return;
      }
      if (!user || user.role === 'tenant') {
        errEl.textContent = 'Only landlords can list properties.';
        return;
      }

      var save;
      if (editId) {
        var existing = Store.findProperty(editId);
        if (!existing) {
          Session.flash('danger', 'Property not found.');
          window.location.href = 'landlord-dashboard.html';
          return;
        }
        if (!Store.canManageProperty(user, existing)) {
          errEl.textContent = 'You do not have permission to edit this property.';
          return;
        }
        Object.keys(data).forEach(function (k) { existing[k] = data[k]; });
        save = Store.updateProperty(existing);
      } else {
        save = Store.addProperty(data);
      }
      save.then(function () {
        Session.flash('success', editId ? 'Property updated successfully!' : 'Property listed successfully!');
        window.location.href = 'landlord-dashboard.html';
      }).catch(function () {
        Session.flash('danger', 'Could not save the property. Please try again.');
      });
    });
    });
  });
})();
/* ============================================================
   RentEase - Appwrite configuration
   ============================================================
   Fill in these values from your Appwrite Console
   (https://cloud.appwrite.io) after completing the setup steps
   in the README (create project -> create database -> create the
   nine tables -> set table permissions to 'any' (All Users) full
   CRUD -> open the site once to auto-seed -> refresh).

   The values below already point at the project's live Cloud
   backend (all nine tables + indexes + permissions exist; demo
   accounts admin@/landlord@…/tenant@…@demo.com are created). Any
   sample data that is missing is seeded on load, so the browse page
   is always populated.

   For a quick local test you can also self-host Appwrite and
   point `endpoint` at it, e.g. 'http://localhost/v1'.
   ============================================================ */
(function () {
  'use strict';
  window.REConfig = {
    endpoint: 'https://fra.cloud.appwrite.io/v1',
    projectId: '6ab57b9a00083af710b3',
    databaseId: '6ab57cc00006dfad73ba',
    tables: {
      users: 'users',
      properties: 'properties',
      bookings: 'bookings',
      reviews: 'reviews',
      rentals: 'rentals',
      saved_properties: 'saved_properties',
      notifications: 'notifications',
      payments: 'payments',
      reports: 'reports'
    }
  };
})();
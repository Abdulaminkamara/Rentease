/* ============================================================
   RentEase - Appwrite client module
   Shares a single Appwrite client (endpoint + project) across
   every page, and fires client.ping() once at startup so the
   user can confirm the SDK setup in the browser console.
   ============================================================ */
(function () {
  'use strict';

  var c = window.REConfig || {};
  var endpoint = c.endpoint || 'https://fra.cloud.appwrite.io/v1';
  var projectId = c.projectId || '6ab57b9a00083af710b3';

  var client = new Appwrite.Client()
    .setEndpoint(endpoint)
    .setProject(projectId);

  var account = new Appwrite.Account(client);
  var tablesDB = new Appwrite.TablesDB(client);
  var storage = new Appwrite.Storage(client);

  /* Health check against the Appwrite backend. Resolves with the
     ping response object once the endpoint + project are reachable. */
  function ping() {
    return client.ping()
      .then(function (res) {
        console.log('RentEase Appwrite connected:', endpoint, res);
        return res;
      })
      .catch(function (err) {
        console.warn('RentEase Appwrite ping failed:', err && err.message ? err.message : err);
        throw err;
      });
  }

  /* Fire once on every app start so the setup is confirmed. */
  ping();

  window.RentEase = window.RentEase || {};
  window.RentEase.AppClient = {
    client: client,
    account: account,
    tablesDB: tablesDB,
    storage: storage,
    ping: ping
  };
})();
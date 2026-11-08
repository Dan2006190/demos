/* Общее демо-хранилище сайта и админки (localStorage браузера).
   В рабочей версии заменяется на сервер + бот Telegram. */
(function () {
  var KEY_BUSY = 'alessia_busy_v1';
  var KEY_REQ = 'alessia_requests_v1';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function today() { var t = new Date(); t.setHours(0, 0, 0, 0); return t; }

  function read(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function write(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  function seed() {
    if (localStorage.getItem(KEY_BUSY) !== null) return;
    var t = today();
    var busy = [2, 3, 6, 9, 10, 14, 17, 23].map(function (n) { return iso(addDays(t, n)); });
    var reqs = [
      { id: 'd1', date: iso(addDays(t, 2)), name: 'Демо-заявка 1', phone: '+7 900 000-00-01', service: 'Кератиновое выпрямление', status: 'confirmed', created: Date.now() - 86400000 * 3 },
      { id: 'd2', date: iso(addDays(t, 6)), name: 'Демо-заявка 2', phone: '+7 900 000-00-02', service: 'Ботокс для волос', status: 'new', created: Date.now() - 86400000 }
    ];
    write(KEY_BUSY, busy);
    write(KEY_REQ, reqs);
  }

  var Store = {
    iso: iso, today: today, addDays: addDays,
    busy: function () { seed(); return read(KEY_BUSY, []); },
    isBusy: function (d) { return Store.busy().indexOf(d) !== -1; },
    setBusy: function (d, on) {
      var b = Store.busy().filter(function (x) { return x !== d; });
      if (on) b.push(d);
      write(KEY_BUSY, b.sort());
    },
    requests: function () { seed(); return read(KEY_REQ, []); },
    addRequest: function (r) {
      var list = Store.requests();
      r.id = 'r' + Date.now();
      r.created = Date.now();
      r.status = 'new';
      list.push(r);
      write(KEY_REQ, list);
      Store.setBusy(r.date, true);
      return r;
    },
    updateRequest: function (id, patch) {
      var list = Store.requests().map(function (r) {
        if (r.id === id) { for (var k in patch) r[k] = patch[k]; }
        return r;
      });
      write(KEY_REQ, list);
    },
    removeRequest: function (id) {
      var list = Store.requests();
      var r = list.filter(function (x) { return x.id === id; })[0];
      write(KEY_REQ, list.filter(function (x) { return x.id !== id; }));
      if (r) Store.setBusy(r.date, false);
    },
    reset: function () { localStorage.removeItem(KEY_BUSY); localStorage.removeItem(KEY_REQ); seed(); }
  };

  window.Store = Store;
})();

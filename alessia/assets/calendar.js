/* Календарь на месяц: общий для сайта и админки.
   opts: { el, dayClass(iso, date) -> string, disabled(iso, date) -> bool, onPick(iso), selected }
*/
(function () {
  var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  function Calendar(opts) {
    this.o = opts;
    var t = Store.today();
    this.min = new Date(t.getFullYear(), t.getMonth(), 1);
    this.max = new Date(t.getFullYear(), t.getMonth() + (opts.monthsAhead || 2), 1);
    this.view = new Date(this.min);
    this.selected = opts.selected || null;
    this.render();
  }

  Calendar.prototype.go = function (step) {
    var v = new Date(this.view.getFullYear(), this.view.getMonth() + step, 1);
    if (v < this.min || v > this.max) return;
    this.view = v;
    this.render(step);
  };

  Calendar.prototype.render = function (dir) {
    var self = this, o = this.o, y = this.view.getFullYear(), m = this.view.getMonth();
    var first = new Date(y, m, 1), shift = (first.getDay() + 6) % 7;
    var days = new Date(y, m + 1, 0).getDate();
    var h = '';
    h += '<div class="cal-head">';
    h += '<button type="button" class="cal-nav" data-step="-1" aria-label="Предыдущий месяц"' + (this.view <= this.min ? ' disabled' : '') + '>' +
      '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>';
    h += '<div class="cal-title">' + MONTHS[m] + ' <span>' + y + '</span></div>';
    h += '<button type="button" class="cal-nav" data-step="1" aria-label="Следующий месяц"' + (this.view >= this.max ? ' disabled' : '') + '>' +
      '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>';
    h += '</div><div class="cal-grid' + (dir ? (dir > 0 ? ' from-right' : ' from-left') : '') + '">';
    WD.forEach(function (w) { h += '<div class="cal-wd">' + w + '</div>'; });
    for (var i = 0; i < shift; i++) h += '<div class="cal-empty"></div>';
    for (var d = 1; d <= days; d++) {
      var date = new Date(y, m, d), id = Store.iso(date);
      var dis = o.disabled ? o.disabled(id, date) : false;
      var cls = 'cal-day' + (o.dayClass ? ' ' + o.dayClass(id, date) : '') + (id === self.selected ? ' is-selected' : '') +
        (id === Store.iso(Store.today()) ? ' is-today' : '');
      h += '<button type="button" class="' + cls + '" data-date="' + id + '"' + (dis ? ' disabled' : '') + '>' + d + '</button>';
    }
    h += '</div>';
    o.el.innerHTML = h;

    o.el.querySelectorAll('.cal-nav').forEach(function (b) {
      b.addEventListener('click', function () { self.go(+b.dataset.step); });
    });
    o.el.querySelectorAll('.cal-day').forEach(function (b) {
      b.addEventListener('click', function () {
        self.selected = b.dataset.date;
        if (o.onPick) o.onPick(b.dataset.date);
        self.render();
      });
    });

    /* свайп по календарю = смена месяца */
    var grid = o.el.querySelector('.cal-grid'), sx = null, sy = null;
    grid.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    grid.addEventListener('touchend', function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) self.go(dx < 0 ? 1 : -1);
      sx = null;
    }, { passive: true });
  };

  Calendar.format = function (id) {
    var p = id.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    var gen = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    var wd = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    return d.getDate() + ' ' + gen[d.getMonth()] + ', ' + wd[d.getDay()];
  };

  window.Calendar = Calendar;
})();

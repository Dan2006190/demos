/* Нижняя панель на телефоне: «Меню» · «Клондайк →»/«← Колибри» · «Бронь» — под большим пальцем.
   Появляется после первого экрана; когда в корзине что-то есть — вместо неё кнопка корзины (#cartbar).
   Прячется, пока открыт Telegram-бот, корзина или меню-бургер. */
(function () {
  'use strict';
  var dock = document.getElementById('mdock'); if (!dock) return;
  var sw = document.getElementById('mdSwitch'), bar = document.getElementById('cartbar');
  var kd = document.getElementById('klondike'), bot = document.getElementById('bot');
  var mq = matchMedia('(max-width:700px)'), botOn = false;
  function upd() {
    var past = scrollY > innerHeight * .75;
    var busy = (bar && !bar.hidden) || botOn || document.querySelector('.drawer.open, .mnav.open');
    dock.classList.toggle('on', mq.matches && past && !busy);
    dock.setAttribute('aria-hidden', dock.classList.contains('on') ? 'false' : 'true');
    if (kd && sw) {
      var inKd = kd.getBoundingClientRect().top < innerHeight * .5;
      sw.textContent = inKd ? '← Колибри' : 'Клондайк →';
      sw.setAttribute('data-scroll', inKd ? 'kolibri' : 'klondike');
      sw.setAttribute('href', inKd ? '#kolibri' : '#klondike');
    }
  }
  if (bot && 'IntersectionObserver' in window)
    new IntersectionObserver(function (es) { es.forEach(function (e) { botOn = e.isIntersecting; }); upd(); }, { threshold: .15 }).observe(bot);
  if (bar) new MutationObserver(upd).observe(bar, { attributes: true, attributeFilter: ['hidden'] });
  ['cartModal', 'mnav'].forEach(function (id) { var el = document.getElementById(id); if (el) new MutationObserver(upd).observe(el, { attributes: true, attributeFilter: ['class'] }); });
  var t = false;
  addEventListener('scroll', function () { if (!t) { t = true; requestAnimationFrame(function () { t = false; upd(); }); } }, { passive: true });
  addEventListener('resize', upd);
  dock.hidden = false; upd();
})();

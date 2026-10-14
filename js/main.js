/* Главная страница: подборка меню со свайпом и карусель отзывов */
(function () {
  "use strict";

  RumaUI.init();

  /* ---------- подборка меню ---------- */
  var panel = document.getElementById("menu-panel");
  var tabsRoot = document.getElementById("menu-tabs");
  var currentGroup = "drinks";

  function featuredRank(item) { return typeof item.featured === "number" ? item.featured : 999; }

  // в подборку попадают позиции с полем featured (см. js/menu.js), по его порядку
  function render(group, direction) {
    currentGroup = group;
    var rows = [];
    MENU[group].forEach(function (cat, ci) {
      cat.items.forEach(function (item, ii) {
        if (item.featured) rows.push({ ci: ci, ii: ii, item: item, cat: cat });
      });
    });
    rows.sort(function (a, b) { return featuredRank(a.item) - featuredRank(b.item); });
    panel.setAttribute("aria-labelledby", "tab-" + group);
    panel.innerHTML = '<ul class="items">' + rows.map(function (r, i) {
      return RumaUI.itemRow(group, r.ci, r.ii, r.item, r.cat, { number: RumaUI.pad(i + 1), category: true });
    }).join("") + "</ul>";

    if (direction) { // короткая анимация в сторону свайпа
      panel.classList.remove("slide-next", "slide-prev");
      void panel.offsetWidth; // перезапуск анимации
      panel.classList.add(direction > 0 ? "slide-next" : "slide-prev");
    }
    document.getElementById("full-menu-link").href = "menu.html#" + group; // ведёт на ту же вкладку
    RumaCart.refresh();
  }

  var order = ["drinks", "food"];
  var tabs = RumaUI.setupTabs(tabsRoot, function (key) {
    var dir = order.indexOf(key) - order.indexOf(currentGroup);
    render(key, dir);
  });

  // свайп по списку: влево — следующая вкладка, вправо — предыдущая
  var startX = 0, startY = 0, tracking = false;
  panel.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) return;
    tracking = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  panel.addEventListener("touchend", function (e) {
    if (!tracking) return;
    tracking = false;
    var dx = e.changedTouches[0].clientX - startX;
    var dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) tabs.step(dx < 0 ? 1 : -1);
  }, { passive: true });

  render("drinks");

  // время завтраков в контактах берём из пометки категории «Завтраки» в js/menu.js
  var breakfast = MENU.food.filter(function (c) { return c.title === "Завтраки"; })[0];
  var breakfastHours = document.getElementById("breakfast-hours");
  if (breakfast && breakfast.note && breakfastHours) breakfastHours.textContent = breakfast.note;

  // кнопки вида <a href="#menu" data-menu-tab="food"> открывают нужный раздел меню
  document.querySelectorAll("[data-menu-tab]").forEach(function (a) {
    a.addEventListener("click", function () { tabs.select(a.dataset.menuTab); });
  });

  /* ---------- карусель отзывов ---------- */
  var track = document.getElementById("quotes");
  var slides = track.querySelectorAll(".quote");
  var counter = document.getElementById("quote-count");
  var index = 0;

  function show(i) {
    var n = slides.length;
    index = (i + n) % n;
    track.scrollTo({ left: slides[index].offsetLeft - track.offsetLeft, behavior: "smooth" });
  }

  document.getElementById("quote-prev").addEventListener("click", function () { show(index - 1); });
  document.getElementById("quote-next").addEventListener("click", function () { show(index + 1); });

  // номер текущего отзыва: учитываем и свайп пальцем, и кнопки
  track.addEventListener("scroll", function () {
    index = Math.round(track.scrollLeft / track.clientWidth);
    counter.textContent = RumaUI.pad(index + 1) + " / " + RumaUI.pad(slides.length);
  }, { passive: true });

  track.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { e.preventDefault(); show(index + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); show(index - 1); }
  });
})();

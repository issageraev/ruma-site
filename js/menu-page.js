/* Страница полного меню: все категории вкладки, липкая панель с «чипсами» */
(function () {
  "use strict";

  RumaUI.init();

  var panel = document.getElementById("menu-panel");
  var chips = document.getElementById("chips");
  var tabsRoot = document.getElementById("menu-tabs");
  var currentGroup = "drinks";
  var order = ["drinks", "food"];

  function render(group) {
    currentGroup = group;
    var cats = MENU[group];
    panel.innerHTML = cats.map(function (cat, ci) {
      return '<section class="cat" id="cat-' + group + "-" + ci + '" aria-labelledby="cat-title-' + group + "-" + ci + '">' +
        '<h2 class="cat__title" id="cat-title-' + group + "-" + ci + '">' + RumaUI.esc(cat.title) +
          (cat.note ? ' <span class="cat__note">' + RumaUI.esc(cat.note) + "</span>" : "") + "</h2>" +
        '<ul class="items">' +
          cat.items.map(function (item, ii) { return RumaUI.itemRow(group, ci, ii, item, cat); }).join("") +
        "</ul></section>";
    }).join("");

    chips.innerHTML = cats.map(function (cat, ci) {
      return '<a class="chip' + (ci === 0 ? ' is-active' : '') + '" href="#cat-' + group + "-" + ci + '">' + RumaUI.esc(cat.title) + "</a>";
    }).join("");

    RumaCart.refresh();
    observeCategories();
  }

  /* ---------- подсветка категории, которую сейчас читает гость ---------- */
  var observer = null;
  function observeCategories() {
    if (observer) observer.disconnect();
    if (!("IntersectionObserver" in window)) return;
    // «линия чтения» — полоса под липкой панелью; секция, пересекающая её, активна
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var link = chips.querySelector('a[href="#' + en.target.id + '"]');
        chips.querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("is-active", c === link); });
        if (link && chips.scrollTo) { // на телефоне — подкрутить ленту к активному чипсу
          chips.scrollTo({ left: link.offsetLeft - chips.clientWidth / 3, behavior: "smooth" });
        }
      });
    }, { rootMargin: "-160px 0px -70% 0px" });
    panel.querySelectorAll(".cat").forEach(function (s) { observer.observe(s); });
  }

  // плавная прокрутка к категории с учётом высоты липких панелей
  chips.addEventListener("click", function (e) {
    var a = e.target.closest("a.chip");
    if (!a) return;
    e.preventDefault();
    var target = document.querySelector(a.getAttribute("href"));
    if (!target) return;
    var offset = document.querySelector(".topbar").offsetHeight + document.getElementById("menubar").offsetHeight + 12;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: "smooth" });
  });

  var tabs = RumaUI.setupTabs(tabsRoot, function (key) {
    var changed = key !== currentGroup;
    render(key);
    if (changed) { // новая вкладка — читаем с начала списка
      var top = panel.getBoundingClientRect().top + window.scrollY - document.getElementById("menubar").offsetHeight - document.querySelector(".topbar").offsetHeight - 8;
      if (window.scrollY > top) window.scrollTo({ top: top, behavior: "auto" });
    }
  });

  // свайп влево/вправо переключает вкладки и здесь
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
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) tabs.step(dx < 0 ? 1 : -1);
  }, { passive: true });

  // ссылка вида menu.html#food открывает нужную вкладку сразу
  var wanted = location.hash.slice(1);
  if (order.indexOf(wanted) !== -1) tabs.select(wanted);
  else render("drinks");
})();

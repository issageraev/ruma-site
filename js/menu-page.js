/* Страница полного меню: все категории вкладки, липкая панель с «чипсами» */
(function () {
  "use strict";

  RumaUI.init();

  var panel = document.getElementById("menu-panel");
  var chips = document.getElementById("chips");
  var tabsRoot = document.getElementById("menu-tabs");
  var currentGroup = "drinks";
  var order = ["drinks", "food"];

  // категории с одинаковым group (или без него — по своему названию) собираются в один раздел
  function groupsOf(cats) {
    var groups = [], byTitle = {};
    cats.forEach(function (cat, ci) {
      var title = cat.group || cat.title;
      if (!byTitle[title]) { byTitle[title] = { title: title, parts: [] }; groups.push(byTitle[title]); }
      byTitle[title].parts.push({ cat: cat, ci: ci });
    });
    return groups;
  }

  function render(group) {
    var groups = groupsOf(MENU[group]);

    panel.innerHTML = groups.map(function (g, gi) {
      var id = "cat-" + group + "-" + gi;
      var lead = g.parts[0].cat;
      var note = lead.title === g.title && lead.note ? lead.note : "";
      return '<section class="cat" id="' + id + '" aria-labelledby="' + id + '-title">' +
        '<h2 class="cat__title" id="' + id + '-title">' + RumaUI.esc(g.title) +
          (note ? ' <span class="cat__note">' + RumaUI.esc(note) + "</span>" : "") + "</h2>" +
        g.parts.map(function (part) {
          // подзаголовок нужен, когда в разделе несколько категорий (кроме первой — она и дала название)
          var sub = part.cat.title !== g.title
            ? '<h3 class="cat__sub">' + RumaUI.esc(part.cat.title) +
                (part.cat.note ? ' <span class="cat__note">' + RumaUI.esc(part.cat.note) + "</span>" : "") + "</h3>"
            : "";
          return sub + '<ul class="items">' +
            part.cat.items.map(function (item, ii) { return RumaUI.itemRow(group, part.ci, ii, item, part.cat); }).join("") +
            "</ul>";
        }).join("") +
      "</section>";
    }).join("");

    chips.innerHTML = groups.map(function (g, gi) {
      return '<a class="chip' + (gi === 0 ? ' is-active' : '') + '" href="#cat-' + group + "-" + gi + '">' + RumaUI.esc(g.title) + "</a>";
    }).join("");

    RumaCart.refresh();
    observeCategories();
  }

  /* ---------- подсветка категории, которую сейчас читает гость ---------- */
  var observer = null;
  function observeCategories() {
    if (observer) observer.disconnect();
    if (!("IntersectionObserver" in window)) return;
    // «линия чтения» — полоса под липкими панелями; секция, пересекающая её, активна
    var top = document.querySelector(".topbar").offsetHeight + document.getElementById("menubar").offsetHeight + 24;
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var link = chips.querySelector('a[href="#' + en.target.id + '"]');
        chips.querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("is-active", c === link); });
        if (link && chips.scrollTo) { // на телефоне — подкрутить ленту к активному чипсу
          chips.scrollTo({ left: link.offsetLeft - chips.clientWidth / 3, behavior: "smooth" });
        }
      });
    }, { rootMargin: "-" + top + "px 0px -65% 0px" });
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
    if (key === currentGroup) return;
    var dir = order.indexOf(key) - order.indexOf(currentGroup);
    currentGroup = key;
    // список и чипсы плавно сменяются, а новая вкладка читается с начала списка
    RumaUI.swapContent([panel, chips], dir, function () {
      render(key);
      var top = panel.getBoundingClientRect().top + window.scrollY - document.getElementById("menubar").offsetHeight - document.querySelector(".topbar").offsetHeight - 8;
      if (window.scrollY > top) window.scrollTo({ top: top, behavior: "auto" });
    });
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
  if (order.indexOf(wanted) !== -1) {
    currentGroup = wanted;
    render(wanted);
    tabs.select(wanted); // только подсветка вкладки: содержимое уже показано
  } else {
    render("drinks");
  }
})();

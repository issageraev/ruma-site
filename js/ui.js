/* Общие помощники для обеих страниц: разбор цен, строка меню, вкладки,
   шапка, статус «открыто/закрыто». Подключается после menu.js. */
window.RumaUI = (function () {
  "use strict";

  // часы работы — ежедневно; поменяются, достаточно поправить эти две строки
  var HOURS = { open: "07:30", close: "23:00" };
  // заведение работает по московскому времени, независимо от часов на телефоне гостя
  var TIMEZONE = "Europe/Moscow";

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------- варианты: «Капучино 200/300 мл — 260/280» → два варианта ---------- */
  // «200/300 мл» → ["200 мл", "300 мл"]; если пометка другая — вернёт пустой список
  function sizeLabels(note, count) {
    var m = note && note.match(/^\s*(\d[\d.,]*(?:\s*\/\s*\d[\d.,]*)*)\s*(.*)$/);
    if (!m) return [];
    var sizes = m[1].split("/").map(function (s) { return s.trim(); });
    if (sizes.length !== count) return [];
    return sizes.map(function (s) { return (s + " " + m[2]).trim(); });
  }

  function getVariants(item) {
    var prices = String(item.price).split("/").map(function (p) {
      return /^\s*\d+\s*$/.test(p) ? Number(p) : NaN;
    });
    if (prices.some(function (p) { return !Number.isSafeInteger(p) || p <= 0; })) return null; // цена не распознана — без кнопки заказа
    if (prices.length === 1) return [{ label: item.note || "", price: prices[0] }];
    var labels = sizeLabels(item.note, prices.length);
    return prices.map(function (price, i) {
      return { label: labels[i] || "вариант " + (i + 1), price: price };
    });
  }

  /* ---------- строка позиции меню ---------- */
  // opts.number — порядковый номер; opts.category — показать название категории, если нет описания
  function itemRow(groupKey, ci, ii, item, cat, opts) {
    opts = opts || {};
    var sub = [item.note, item.desc].filter(Boolean).join(" · ");
    if (!sub && opts.category) sub = cat.title + (cat.note ? " · " + cat.note : "");
    var canOrder = !!getVariants(item);
    return '<li class="item">' +
      (opts.number ? '<span class="item__num" aria-hidden="true">' + opts.number + "</span>" : "") +
      '<div class="item__main">' +
        '<h4 class="item__name">' + esc(item.name) +
          (item.badge ? ' <span class="badge">' + esc(item.badge) + "</span>" : "") + "</h4>" +
        (sub ? '<p class="item__desc">' + esc(sub) + "</p>" : "") +
      "</div>" +
      '<span class="item__price">' + esc(item.price) + "&nbsp;₽</span>" +
      (canOrder
        ? '<button class="item__add" type="button" data-group="' + groupKey + '" data-ci="' + ci + '" data-ii="' + ii +
          '" aria-label="Добавить в заказ: ' + esc(item.name) + '"></button>'
        : '<span class="item__add item__add--none" aria-hidden="true"></span>') +
    "</li>";
  }

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  // 1 позиция, 2 позиции, 5 позиций
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  /* ---------- плавная смена содержимого (вкладки меню) ---------- */
  // Содержимое меняется сразу. Новое нажатие прерывает прежнюю анимацию,
  // поэтому быстрые переключения не создают очередь и не задерживают интерфейс.
  var swaps = new WeakMap();
  function swapContent(els, dir, render) {
    var list = Array.isArray(els) ? els : [els];
    list.forEach(function (el) { var old = swaps.get(el); if (old) old.cancel(); });
    render();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    list.forEach(function (el) {
      if (!el.animate || !el.isConnected || !el.getClientRects().length) return;
      var a = el.animate(
        [{ opacity: 0.65, transform: "translateX(" + (dir >= 0 ? 6 : -6) + "px)" }, { opacity: 1, transform: "translateX(0)" }],
        { duration: 180, easing: "ease-out" });
      swaps.set(el, a);
      a.finished.catch(function () {}).then(function () { if (swaps.get(el) === a) swaps.delete(el); });
    });
  }

  /* ---------- вкладки (с управлением стрелками, как в ARIA-паттерне) ---------- */
  // активная вкладка подсвечивается «бегунком», который скользит между пунктами
  function setupTabs(root, onChange) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll(".tab"));
    var current = tabs[0].dataset.tab;

    // Общий размер подписи подстраивается под реальные метрики шрифта, включая запасной.
    function resizeTabs() {
      if (!root.isConnected || !root.offsetWidth) return;
      root.style.removeProperty("--tab-label-size");
      if (root.classList.contains("tabs--menu") && matchMedia("(max-width: 600px)").matches) {
        var size = parseFloat(getComputedStyle(tabs[0]).fontSize);
        var scale = 1;
        tabs.forEach(function (t) {
          var css = getComputedStyle(t);
          var available = t.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight) - 1;
          var range = document.createRange();
          range.selectNodeContents(t);
          var width = range.getBoundingClientRect().width;
          if (width > 0) scale = Math.min(scale, available / width);
        });
        if (scale < 1) root.style.setProperty("--tab-label-size", (size * scale).toFixed(2) + "px");
      }
      placeThumb();
    }

    function placeThumb() {
      var active = root.querySelector(".tab.is-active");
      if (!active || !active.offsetWidth) return;
      root.style.setProperty("--thumb-x", active.offsetLeft + "px");
      root.style.setProperty("--thumb-w", active.offsetWidth + "px");
      if (!root.classList.contains("has-thumb")) {
        root.classList.add("has-thumb");
        // анимацию включаем только после первой расстановки — чтобы бегунок не «ехал» при загрузке
        requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add("thumb-anim"); }); });
      }
    }

    function select(key, focus) {
      current = key;
      tabs.forEach(function (t) {
        var on = t.dataset.tab === key;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus({ preventScroll: true });
      });
      placeThumb();
      onChange(key);
    }

    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t.dataset.tab); });
      t.addEventListener("keydown", function (e) {
        var next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
        if (next === null) return;
        e.preventDefault();
        select(tabs[(next + tabs.length) % tabs.length].dataset.tab, true);
      });
    });

    resizeTabs();
    window.addEventListener("resize", resizeTabs);
    document.addEventListener("ruma:navigation", resizeTabs);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(resizeTabs); // шрифт меняет ширину кнопок

    return {
      select: select,
      step: function (delta) { // для свайпа: -1 / +1, без зацикливания
        var i = tabs.findIndex(function (t) { return t.dataset.tab === current; }) + delta;
        if (i >= 0 && i < tabs.length) select(tabs[i].dataset.tab);
      },
    };
  }

  /* ---------- шапка ---------- */
  function setupHeader() {
    var header = document.querySelector(".topbar");
    if (!header) return;

    // тень у шапки, когда страница прокручена
    function onScroll() { header.classList.toggle("is-stuck", window.scrollY > 8); }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- нижняя панель навигации на телефоне (Liquid Glass) ---------- */
  var TAB_ICONS = {
    home: '<path d="M4 11.2L12 4l8 7.2V19a1 1 0 01-1 1h-4.5v-5.5h-5V20H5a1 1 0 01-1-1v-7.8z"/>',
    about: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2M12 7.9v.1"/>',
    menu: '<path d="M5 9h11v5.2A4.8 4.8 0 0111.2 19h-1.4A4.8 4.8 0 015 14.2V9zM16 10.2h1.2a2.4 2.4 0 010 4.8H16M8.5 4.5v2M12.5 4.5v2"/>',
    rolls: '<ellipse cx="12" cy="12" rx="8.5" ry="8.5"/><circle cx="12" cy="12" r="4.6"/><path d="M12 7.4v4.6h3.4"/>',
    contacts: '<path d="M12 20.5s6.5-5.6 6.5-11a6.5 6.5 0 10-13 0c0 5.4 6.5 11 6.5 11z"/><circle cx="12" cy="9.5" r="2.3"/>'
  };

  function setupTabbar() {
    var page = document.body.dataset.page || "home";
    var onHome = page === "home";
    // ссылки ведут туда же, что и верхнее меню; «эта страница» — наверх
    var items = [
      { key: "home", label: "Главная", href: "index.html" },
      { key: "about", label: "О нас", href: "index.html#about" },
      { key: "menu", label: "Меню", href: "menu.html" },
      { key: "contacts", label: "Контакты", href: "index.html#contacts" }
    ];

    var nav = document.createElement("nav");
    nav.className = "tabbar";
    nav.setAttribute("aria-label", "Разделы сайта");
    nav.innerHTML = '<div class="tabbar__glass"><span class="tabbar__thumb" aria-hidden="true"></span>' +
      items.map(function (it) {
        return '<a class="tabbar__item" data-key="' + it.key + '" href="' + it.href + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + TAB_ICONS[it.key] + "</svg>" +
          "<span>" + it.label + "</span></a>";
      }).join("") + "</div>";
    document.body.appendChild(nav);

    var glass = nav.firstChild;
    var links = Array.prototype.slice.call(nav.querySelectorAll(".tabbar__item"));
    var activeKey = null;

    function placeThumb() {
      var active = nav.querySelector(".tabbar__item.is-active");
      if (!active || !active.offsetWidth) return;
      glass.style.setProperty("--thumb-x", active.offsetLeft + "px");
      glass.style.setProperty("--thumb-w", active.offsetWidth + "px");
      if (!glass.classList.contains("has-thumb")) {
        glass.classList.add("has-thumb");
        requestAnimationFrame(function () { requestAnimationFrame(function () { glass.classList.add("thumb-anim"); }); });
      }
    }

    function setActive(key) {
      if (key === activeKey) return;
      activeKey = key;
      links.forEach(function (a) {
        var on = a.dataset.key === key;
        a.classList.toggle("is-active", on);
        if (on) a.setAttribute("aria-current", document.body.dataset.page === "home" ? "location" : "page");
        else a.removeAttribute("aria-current");
      });
      placeThumb();
    }

    var ids = ["about", "menu", "contacts"];
    var ticking = false;
    function pick() {
      ticking = false;
      var onHomeNow = document.body.dataset.page === "home";
      var key = onHomeNow ? "home" : "menu";
      if (onHomeNow) {
        var line = window.innerHeight * 0.45;
        ids.forEach(function (id) {
          var el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= line) key = id;
        });
      }
      setActive(key);
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(pick); }
    }, { passive: true });
    document.addEventListener("ruma:navigation", function () { pick(); placeThumb(); });
    pick();

    window.addEventListener("resize", placeThumb);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeThumb);
  }

  /* ---------- «открыто сейчас» / «закрыто» ---------- */
  function minutesOf(hhmm) {
    var p = hhmm.split(":");
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  function nowMinutes() {
    try {
      var parts = new Intl.DateTimeFormat("ru-RU", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
      var h = 0, m = 0;
      parts.forEach(function (p) {
        if (p.type === "hour") h = parseInt(p.value, 10);
        if (p.type === "minute") m = parseInt(p.value, 10);
      });
      return h * 60 + m;
    } catch (e) {
      var d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    }
  }

  function isOpenNow() {
    var now = nowMinutes();
    return now >= minutesOf(HOURS.open) && now < minutesOf(HOURS.close);
  }

  function updateHours() {
    var nodes = document.querySelectorAll(".hours-badge");
    if (!nodes.length) return;
    var isOpen = isOpenNow();
    var text = isOpen ? "Открыто · до " + HOURS.close : "Закрыто · откроется в " + HOURS.open;
    nodes.forEach(function (n) {
      n.textContent = text;
      n.classList.toggle("hours-badge--open", isOpen);
      n.classList.toggle("hours-badge--closed", !isOpen);
    });
  }

  /* ---------- плавное появление блоков при прокрутке ---------- */
  function setupReveal() {
    var els = document.querySelectorAll(".reveal:not(.is-in)");
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (el) { io.observe(el); });
  }

  function init() {
    setupTabbar();
    setupHeader();
    setupReveal();
    updateHours();
    setInterval(updateHours, 60000);
    document.addEventListener("ruma:navigation", function () { setupReveal(); updateHours(); });
    var y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
  }

  return {
    esc: esc, pad: pad, plural: plural, getVariants: getVariants, itemRow: itemRow,
    setupTabs: setupTabs, swapContent: swapContent, isOpenNow: isOpenNow, hours: HOURS, init: init,
  };
})();

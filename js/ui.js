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
      return parseInt(p.replace(/\D/g, ""), 10);
    });
    if (prices.some(function (p) { return !p; })) return null; // цена не распознана — без кнопки заказа
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

  /* ---------- вкладки (с управлением стрелками, как в ARIA-паттерне) ---------- */
  function setupTabs(root, onChange) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll(".tab"));
    var current = tabs[0].dataset.tab;

    function select(key, focus) {
      current = key;
      tabs.forEach(function (t) {
        var on = t.dataset.tab === key;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        if (on) {
          if (focus) t.focus();
          if (t.scrollIntoView) t.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
        }
      });
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

    return {
      select: select,
      step: function (delta) { // для свайпа: -1 / +1, без зацикливания
        var i = tabs.findIndex(function (t) { return t.dataset.tab === current; }) + delta;
        if (i >= 0 && i < tabs.length) select(tabs[i].dataset.tab);
      },
    };
  }

  /* ---------- шапка: бургер на телефоне ---------- */
  function setupHeader() {
    var header = document.querySelector(".topbar");
    var burger = document.getElementById("burger");
    if (!header || !burger) return;
    function setOpen(open) {
      header.classList.toggle("nav-open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      burger.setAttribute("aria-label", open ? "Закрыть навигацию" : "Открыть навигацию");
    }
    burger.addEventListener("click", function () { setOpen(!header.classList.contains("nav-open")); });
    header.querySelectorAll(".topbar__nav a").forEach(function (a) {
      a.addEventListener("click", function () { setOpen(false); });
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });
    // тень у шапки, когда страница прокручена
    function onScroll() { header.classList.toggle("is-stuck", window.scrollY > 8); }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
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

  function updateHours() {
    var nodes = document.querySelectorAll(".hours-badge");
    if (!nodes.length) return;
    var now = nowMinutes();
    var isOpen = now >= minutesOf(HOURS.open) && now < minutesOf(HOURS.close);
    var text = isOpen ? "Открыто · до " + HOURS.close : "Закрыто · откроется в " + HOURS.open;
    nodes.forEach(function (n) {
      n.textContent = text;
      n.classList.toggle("hours-badge--open", isOpen);
      n.classList.toggle("hours-badge--closed", !isOpen);
    });
  }

  /* ---------- плавное появление блоков при прокрутке ---------- */
  function setupReveal() {
    var els = document.querySelectorAll(".reveal");
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
    setupHeader();
    setupReveal();
    updateHours();
    setInterval(updateHours, 60000);
    var y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
  }

  return { esc: esc, pad: pad, getVariants: getVariants, itemRow: itemRow, setupTabs: setupTabs, init: init };
})();

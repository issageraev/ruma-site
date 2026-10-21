/* Роллы: карточки с фото и окно блюда (два кадра, полный состав, кнопка «В заказ»).
   Подключается после cart.js. Любой элемент с data-rolls="featured" (подборка на главной)
   или data-rolls="all" (вся страница rolls.html) заполняется карточками из MENU.rolls. */
window.RumaRolls = (function () {
  "use strict";

  var GROUP = "rolls";
  var esc = RumaUI.esc;

  function money(price) {
    return String(price).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₽";
  }

  function photo(item, detail) {
    return "img/rolls/" + item.photo + (detail ? "-detail" : "") + ".webp";
  }

  /* ---------- карточка ---------- */
  function card(ci, ii, item) {
    var attrs = 'data-group="' + GROUP + '" data-ci="' + ci + '" data-ii="' + ii + '"';
    return '<article class="roll-card">' +
      '<button class="roll-card__open" type="button" ' + attrs + ' aria-haspopup="dialog" ' +
        'aria-label="' + esc(item.name) + ' — фото и состав">' +
        '<span class="roll-card__media">' +
          '<img class="roll-card__img" src="' + photo(item) + '" alt="' + esc(item.name) + '" width="1000" height="1250" loading="lazy">' +
          '<img class="roll-card__img roll-card__img--alt" src="' + photo(item, true) + '" alt="" aria-hidden="true" width="1000" height="1250" loading="lazy">' +
        "</span>" +
        '<span class="roll-card__body">' +
          '<span class="roll-card__name">' + esc(item.name) + "</span>" +
          '<span class="roll-card__desc">' + esc(item.desc) + "</span>" +
        "</span>" +
      "</button>" +
      '<div class="roll-card__foot">' +
        '<span class="roll-card__price">' + money(item.price) + "</span>" +
        '<button class="item__add roll-card__add" type="button" ' + attrs +
          ' aria-label="Добавить в заказ: ' + esc(item.name) + '"></button>' +
      "</div>" +
    "</article>";
  }

  function mount(el) {
    var featuredOnly = el.dataset.rolls === "featured";
    var rows = [];
    MENU[GROUP].forEach(function (cat, ci) {
      cat.items.forEach(function (item, ii) {
        if (!featuredOnly || item.featured) rows.push({ ci: ci, ii: ii, item: item });
      });
    });
    if (featuredOnly) {
      rows.sort(function (a, b) { return (a.item.featured || 999) - (b.item.featured || 999); });
    }
    el.innerHTML = rows.map(function (r) { return card(r.ci, r.ii, r.item); }).join("");
  }

  /* ---------- окно блюда ---------- */
  var dlg = document.createElement("div");
  dlg.className = "overlay";
  dlg.id = "roll-dialog";
  dlg.hidden = true;
  dlg.innerHTML =
    '<div class="overlay__backdrop" data-close></div>' +
    '<div class="dialog dialog--cart dialog--roll" role="dialog" aria-modal="true" aria-labelledby="roll-title" tabindex="-1">' +
      '<span class="dialog__handle" aria-hidden="true"></span>' +
      '<header class="sheet__head">' +
        '<h3 class="dialog__title" id="roll-title"></h3>' +
        '<p class="sheet__meta" id="roll-price"></p>' +
        '<button class="dialog__close" type="button" data-close aria-label="Закрыть">✕</button>' +
      "</header>" +
      '<div class="sheet__body">' +
        '<div class="gallery" id="roll-gallery" role="group" aria-label="Фото блюда"></div>' +
        '<div class="gallery__dots" id="roll-dots" aria-hidden="true"><i class="is-on"></i><i></i></div>' +
        '<h4 class="roll-comp__label">Состав</h4>' +
        '<p class="roll-comp" id="roll-comp"></p>' +
      "</div>" +
      '<footer class="sheet__foot">' +
        '<button class="order-submit" id="roll-add" type="button"></button>' +
      "</footer>" +
    "</div>";
  document.body.appendChild(dlg);
  RumaCart.registerOverlay(dlg);

  var gallery = document.getElementById("roll-gallery");
  var dots = dlg.querySelectorAll("#roll-dots i");
  var current = null; // { item, variant }

  gallery.addEventListener("scroll", function () {
    var i = Math.round(gallery.scrollLeft / gallery.clientWidth);
    dots.forEach(function (d, n) { d.classList.toggle("is-on", n === i); });
  }, { passive: true });

  function open(ci, ii) {
    var item = MENU[GROUP][ci].items[ii];
    var variant = RumaUI.getVariants(item)[0];
    current = { item: item, variant: variant };

    document.getElementById("roll-title").textContent = item.name;
    document.getElementById("roll-price").textContent = money(variant.price);
    document.getElementById("roll-comp").textContent = item.desc; // то же описание, что на карточке
    gallery.innerHTML =
      '<img src="' + photo(item) + '" alt="' + esc(item.name) + '" width="1000" height="1250">' +
      '<img src="' + photo(item, true) + '" alt="' + esc(item.name) + ' — крупным планом" width="1000" height="1250">';
    gallery.scrollLeft = 0;
    dots.forEach(function (d, n) { d.classList.toggle("is-on", n === 0); });
    document.getElementById("roll-add").textContent = "Добавить в заказ · " + money(variant.price);
    RumaCart.openOverlay(dlg);
  }

  document.getElementById("roll-add").addEventListener("click", function () {
    if (!current) return;
    RumaCart.add(current.item.name, current.variant.label, current.variant.price);
    RumaCart.closeAll();
  });

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".roll-card__open");
    if (btn) open(parseInt(btn.dataset.ci, 10), parseInt(btn.dataset.ii, 10));
  });

  document.querySelectorAll("[data-rolls]").forEach(mount);
  RumaCart.refresh(); // счётчики на кнопках «+» для уже выбранных роллов

  return { mount: mount };
})();

/* Корзина, окна заказа и отправка заказа в WhatsApp.
   Разметку плашки и окон подставляем сами — одна на обе страницы. */
window.RumaCart = (function () {
  "use strict";

  var WHATSAPP_PHONE = "79064501429"; // номер для приёма заказов
  var STORAGE_KEY = "ruma_cart_v1";
  var esc = RumaUI.esc;

  // подпись доп. поля для каждого формата заказа (null — поле не нужно)
  var EXTRA_FIELDS = {
    "С собой": null,
    "На месте": null,
    "Заберу заказ": { label: "К какому времени подготовить?", placeholder: "например, к 14:30" },
    "Отправить на такси": { label: "Адрес для такси", placeholder: "улица, дом" },
  };

  /* ---------- разметка ---------- */
  document.body.insertAdjacentHTML("beforeend",
    '<div class="cart-bar" id="cart-bar" hidden>' +
      '<span class="cart-bar__info" id="cart-bar-info" role="status" aria-live="polite"></span>' +
      '<button class="btn btn--light cart-bar__btn" id="cart-bar-open" type="button">Оформить заказ</button>' +
    "</div>" +

    '<div class="overlay" id="variant-picker" hidden>' +
      '<div class="overlay__backdrop" data-close></div>' +
      '<div class="dialog dialog--small" role="dialog" aria-modal="true" aria-labelledby="variant-title" tabindex="-1">' +
        '<h3 class="dialog__title" id="variant-title"></h3>' +
        '<div class="variant-options" id="variant-options"></div>' +
        '<button class="dialog__close" type="button" data-close aria-label="Закрыть">✕</button>' +
      "</div>" +
    "</div>" +

    '<div class="overlay" id="cart-sheet" hidden>' +
      '<div class="overlay__backdrop" data-close></div>' +
      '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cart-title" tabindex="-1">' +
        '<h3 class="dialog__title" id="cart-title">Ваш заказ</h3>' +
        '<ul class="cart-items" id="cart-items"></ul>' +
        '<div class="cart-totalrow">' +
          '<button class="cart-clear" id="cart-clear" type="button">Очистить всё</button>' +
          '<span>Итого: <b id="cart-total"></b></span>' +
        "</div>" +
        '<p class="order-type-label" id="order-type-label">Как вам удобно?</p>' +
        '<div class="order-types" role="group" aria-labelledby="order-type-label">' +
          Object.keys(EXTRA_FIELDS).map(function (t) {
            return '<button class="order-type" type="button" data-type="' + t + '">' + t + "</button>";
          }).join("") +
        "</div>" +
        '<div class="order-extra" id="order-extra" hidden>' +
          '<label class="order-extra__label" id="order-extra-label" for="order-extra-input"></label>' +
          '<input class="order-extra__input" id="order-extra-input" type="text" maxlength="120">' +
        "</div>" +
        '<div class="order-extra">' +
          '<label class="order-extra__label" for="order-comment">Комментарий к заказу</label>' +
          '<input class="order-extra__input" id="order-comment" type="text" maxlength="200" placeholder="необязательно — пожелания, аллергии, «без сахара»…">' +
        "</div>" +
        '<a class="order-submit" id="order-btn" href="#" target="_blank" rel="noopener">Заказать в WhatsApp</a>' +
        '<p class="order-hint">Откроется чат WhatsApp с готовым текстом заказа — останется нажать «Отправить»</p>' +
        '<button class="dialog__close" type="button" data-close aria-label="Закрыть">✕</button>' +
      "</div>" +
    "</div>");

  var cartBar = document.getElementById("cart-bar");
  var cartBarInfo = document.getElementById("cart-bar-info");
  var sheet = document.getElementById("cart-sheet");
  var sheetList = document.getElementById("cart-items");
  var sheetTotal = document.getElementById("cart-total");
  var extraWrap = document.getElementById("order-extra");
  var extraInput = document.getElementById("order-extra-input");
  var orderBtn = document.getElementById("order-btn");
  var picker = document.getElementById("variant-picker");
  var pickerTitle = document.getElementById("variant-title");
  var pickerBtns = document.getElementById("variant-options");
  var headerCount = document.getElementById("header-count");

  /* ---------- корзина ---------- */
  // cart: { key: {name, variant, price, qty} }
  var cart = {};
  var orderType = "С собой";

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart: cart, orderType: orderType }));
    } catch (e) { /* приватный режим — работаем без сохранения */ }
  }

  function loadCart() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (data && typeof data.cart === "object" && data.cart !== null) {
        Object.keys(data.cart).forEach(function (k) {
          var it = data.cart[k];
          if (it && typeof it.name === "string" && typeof it.price === "number" &&
              it.price > 0 && typeof it.qty === "number" && it.qty > 0) {
            cart[k] = { name: it.name, variant: it.variant || "", price: it.price, qty: Math.min(it.qty, 20) };
          }
        });
      }
      if (data && EXTRA_FIELDS.hasOwnProperty(data.orderType)) orderType = data.orderType;
    } catch (e) { /* повреждённые данные — начинаем с пустой корзины */ }
  }

  function count() {
    return Object.keys(cart).reduce(function (n, k) { return n + cart[k].qty; }, 0);
  }

  function total() {
    return Object.keys(cart).reduce(function (s, k) { return s + cart[k].price * cart[k].qty; }, 0);
  }

  function add(name, variant, price) {
    var key = name + "|" + variant + "|" + price;
    if (cart[key]) cart[key].qty = Math.min(cart[key].qty + 1, 20);
    else cart[key] = { name: name, variant: variant, price: price, qty: 1 };
    saveCart();
    update();
  }

  function changeQty(key, delta) {
    if (!cart[key]) return;
    cart[key].qty += delta;
    if (cart[key].qty <= 0) delete cart[key];
    saveCart();
    update();
  }

  /* ---------- счётчики на кнопках «+» ---------- */
  function updateBadges() {
    var counts = {};
    Object.keys(cart).forEach(function (k) {
      var it = cart[k];
      var ck = it.name + "|" + it.price;
      counts[ck] = (counts[ck] || 0) + it.qty;
    });
    document.querySelectorAll(".item__add[data-group]").forEach(function (btn) {
      var cat = MENU[btn.dataset.group][parseInt(btn.dataset.ci, 10)];
      var item = cat && cat.items[parseInt(btn.dataset.ii, 10)];
      if (!item) return;
      var c = (RumaUI.getVariants(item) || []).reduce(function (s, v) {
        return s + (counts[item.name + "|" + v.price] || 0);
      }, 0);
      if (c > 0) btn.setAttribute("data-count", c);
      else btn.removeAttribute("data-count");
    });
  }

  function update() {
    var n = count();
    cartBar.hidden = n === 0;
    document.body.classList.toggle("has-cart", n > 0);
    if (n === 0 && !sheet.hidden) closeAll();
    cartBarInfo.textContent = n + " поз. · " + total() + " ₽";
    if (headerCount) {
      headerCount.hidden = n === 0;
      headerCount.textContent = n;
    }

    sheetList.innerHTML = Object.keys(cart).map(function (k) {
      var it = cart[k];
      return '<li class="cart-item">' +
        '<span class="cart-item__name">' + esc(it.name) +
          (it.variant ? ' <span class="cart-item__variant">' + esc(it.variant) + "</span>" : "") + "</span>" +
        '<span class="cart-item__qty">' +
          '<button class="qty-btn" type="button" data-key="' + esc(k) + '" data-d="-1" aria-label="Убрать одну: ' + esc(it.name) + '">−</button>' +
          "<b>" + it.qty + "</b>" +
          '<button class="qty-btn" type="button" data-key="' + esc(k) + '" data-d="1" aria-label="Добавить ещё: ' + esc(it.name) + '">+</button>' +
        "</span>" +
        '<span class="cart-item__sum">' + it.price * it.qty + " ₽</span>" +
      "</li>";
    }).join("");
    sheetTotal.textContent = total() + " ₽";

    document.querySelectorAll(".order-type").forEach(function (b) {
      var on = b.dataset.type === orderType;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var extra = EXTRA_FIELDS[orderType];
    extraWrap.hidden = !extra;
    if (extra) {
      document.getElementById("order-extra-label").textContent = extra.label;
      extraInput.placeholder = extra.placeholder;
    }
    updateBadges();
  }

  /* ---------- окна: открытие, фокус, закрытие ---------- */
  var lastFocus = null;

  function openOverlay(el) {
    lastFocus = document.activeElement;
    el.hidden = false;
    document.body.classList.add("no-scroll");
    var dlg = el.querySelector(".dialog");
    dlg.focus();
  }

  function closeAll() {
    var wasOpen = !sheet.hidden || !picker.hidden;
    sheet.hidden = true;
    picker.hidden = true;
    document.body.classList.remove("no-scroll");
    if (wasOpen && lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function openSheet() {
    if (count() > 0) openOverlay(sheet);
  }

  // Tab не должен «убегать» из открытого окна на страницу под ним
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeAll(); return; }
    if (e.key !== "Tab") return;
    var open = !sheet.hidden ? sheet : !picker.hidden ? picker : null;
    if (!open) return;
    var focusable = open.querySelectorAll("button, a[href], input");
    var list = Array.prototype.filter.call(focusable, function (el) { return el.offsetParent !== null; });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === open.querySelector(".dialog"))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });

  document.querySelectorAll("[data-close]").forEach(function (el) {
    el.addEventListener("click", closeAll);
  });

  /* ---------- выбор варианта (объём/размер) ---------- */
  function pickVariant(name, variants) {
    pickerTitle.textContent = name;
    pickerBtns.innerHTML = variants.map(function (v, i) {
      return '<button class="variant-btn" type="button" data-i="' + i + '">' +
        (v.label ? esc(v.label) + " — " : "") + v.price + " ₽</button>";
    }).join("");
    pickerBtns.onclick = function (e) {
      var b = e.target.closest(".variant-btn");
      if (!b) return;
      var v = variants[parseInt(b.dataset.i, 10)];
      add(name, v.label, v.price);
      closeAll();
    };
    openOverlay(picker);
  }

  // кнопки «+» в меню (на любой странице)
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".item__add[data-group]");
    if (!btn) return;
    var item = MENU[btn.dataset.group][parseInt(btn.dataset.ci, 10)].items[parseInt(btn.dataset.ii, 10)];
    var variants = RumaUI.getVariants(item);
    if (!variants) return;
    if (variants.length === 1) {
      add(item.name, variants[0].label, variants[0].price);
      btn.classList.add("is-flash");
      setTimeout(function () { btn.classList.remove("is-flash"); }, 350);
    } else {
      pickVariant(item.name, variants);
    }
  });

  /* ---------- окно заказа ---------- */
  sheetList.addEventListener("click", function (e) {
    var b = e.target.closest(".qty-btn");
    if (b) changeQty(b.dataset.key, parseInt(b.dataset.d, 10));
  });

  document.getElementById("cart-clear").addEventListener("click", function () {
    cart = {};
    saveCart();
    update();
  });

  document.querySelectorAll(".order-type").forEach(function (b) {
    b.addEventListener("click", function () {
      orderType = b.dataset.type;
      saveCart();
      update();
    });
  });

  document.getElementById("cart-bar-open").addEventListener("click", openSheet);

  // кнопка «Заказать» в шапке: с товарами — открывает заказ, без — ведёт к меню
  var headerOrder = document.getElementById("header-order");
  if (headerOrder) {
    headerOrder.addEventListener("click", function (e) {
      if (count() > 0) { e.preventDefault(); openSheet(); }
    });
  }

  /* ---------- сообщение в WhatsApp ---------- */
  function buildMessage() {
    var lines = ["Здравствуйте! Хочу сделать заказ в RUMA:", ""];
    Object.keys(cart).forEach(function (k) {
      var it = cart[k];
      lines.push("• " + it.name + (it.variant ? " (" + it.variant + ")" : "") +
        (it.qty > 1 ? " ×" + it.qty : "") + " — " + it.price * it.qty + " ₽");
    });
    lines.push("");
    lines.push("Итого: " + total() + " ₽");
    lines.push("Формат: " + orderType);
    var extra = EXTRA_FIELDS[orderType];
    if (extra) {
      var val = extraInput.value.trim();
      lines.push(extra.label.replace(/\?$/, "") + ": " + (val || "(уточню в чате)"));
    }
    var comment = document.getElementById("order-comment").value.trim();
    if (comment) lines.push("Комментарий: " + comment);
    return lines.join("\n");
  }

  orderBtn.addEventListener("click", function (e) {
    if (count() === 0) { e.preventDefault(); return; }
    orderBtn.href = "https://wa.me/" + WHATSAPP_PHONE + "?text=" + encodeURIComponent(buildMessage());
    // после ухода в WhatsApp очищаем поля и закрываем окно,
    // чтобы по возвращении на сайт не оставались старые адрес/время/комментарий
    setTimeout(function () {
      extraInput.value = "";
      document.getElementById("order-comment").value = "";
      closeAll();
    }, 400);
  });

  loadCart();
  update();

  return { add: add, count: count, openSheet: openSheet, refresh: updateBadges };
})();

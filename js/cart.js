/* Корзина, окна заказа и отправка заказа в WhatsApp.
   Разметку плашки и окон подставляем сами — одна на обе страницы. */
window.RumaCart = (function () {
  "use strict";

  var WHATSAPP_PHONE = "79064501429"; // номер для приёма заказов
  var STORAGE_KEY = "ruma_cart_v1";
  var esc = RumaUI.esc;

  // форматы заказа: value уходит в сообщение, extra — доп. поле (required — без него не отправить)
  var ORDER_TYPES = [
    { value: "С собой", hint: "упакуем навынос", extra: null },
    { value: "На месте", hint: "в зале RUMA", extra: null },
    { value: "Заберу заказ", hint: "приготовим к времени",
      extra: { label: "К какому времени подготовить?", placeholder: "например, к 14:30" } },
    { value: "Отправить на такси", hint: "передадим с такси",
      extra: { label: "Адрес для такси", placeholder: "улица, дом", required: true,
        error: "Укажите адрес — без него такси не отправить" } },
  ];

  function typeByValue(v) {
    return ORDER_TYPES.filter(function (t) { return t.value === v; })[0] || null;
  }

  var ICON_BAG = '<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6.5h12l-1 10.5H5L4 6.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7.5 8.5V5.5a2.5 2.5 0 015 0v3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  var ICON_ARROW = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_WA = '<svg class="icon icon--wa" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.2a9.7 9.7 0 00-8.4 14.6L2.3 21.8l5.1-1.3A9.7 9.7 0 1012 2.2zm0 17.7c-1.5 0-2.9-.4-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1112 19.9zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 01-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 00-.7.3 2.8 2.8 0 00-.9 2.1 4.9 4.9 0 001 2.6 11.2 11.2 0 004.3 3.8c1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.2.2-.6.2-1.1.1-1.2l-.5-.4z"/></svg>';

  /* ---------- разметка ---------- */
  document.body.insertAdjacentHTML("beforeend",
    '<div class="cart-bar" id="cart-bar" hidden>' +
      '<button class="cart-bar__open" id="cart-bar-open" type="button" aria-haspopup="dialog">' +
        '<span class="cart-bar__icon">' + ICON_BAG + '<span class="cart-bar__count" id="cart-bar-count"></span></span>' +
        '<span class="cart-bar__info" id="cart-bar-info" role="status" aria-live="polite"></span>' +
        '<span class="cart-bar__cta">Оформить' + ICON_ARROW + "</span>" +
      "</button>" +
    "</div>" +

    '<div class="overlay" id="variant-picker" hidden>' +
      '<div class="overlay__backdrop" data-close></div>' +
      '<div class="dialog dialog--small" role="dialog" aria-modal="true" aria-labelledby="variant-title" tabindex="-1">' +
        '<span class="dialog__handle" aria-hidden="true"></span>' +
        '<p class="dialog__eyebrow">Выберите вариант</p>' +
        '<h3 class="dialog__title" id="variant-title"></h3>' +
        '<div class="variant-options" id="variant-options"></div>' +
        '<button class="dialog__close" type="button" data-close aria-label="Закрыть">✕</button>' +
      "</div>" +
    "</div>" +

    '<div class="overlay" id="cart-sheet" hidden>' +
      '<div class="overlay__backdrop" data-close></div>' +
      '<div class="dialog dialog--cart" role="dialog" aria-modal="true" aria-labelledby="cart-title" tabindex="-1">' +
        '<span class="dialog__handle" aria-hidden="true"></span>' +
        '<header class="sheet__head">' +
          '<h3 class="dialog__title" id="cart-title">Ваш заказ</h3>' +
          '<p class="sheet__meta" id="cart-meta"></p>' +
          '<button class="dialog__close" type="button" data-close aria-label="Закрыть">✕</button>' +
        "</header>" +

        '<div class="sheet__body">' +
          '<p class="notice" id="order-closed" hidden></p>' +
          '<ul class="cart-items" id="cart-items"></ul>' +
          '<div class="cart-tools">' +
            '<button class="cart-more" id="cart-more" type="button">+ Добавить ещё</button>' +
            '<button class="cart-clear" id="cart-clear" type="button">Очистить всё</button>' +
          "</div>" +

          '<fieldset class="order-step">' +
            '<legend class="order-step__title"><span class="order-step__num">1</span>Как вам удобно?</legend>' +
            '<div class="order-types">' +
              ORDER_TYPES.map(function (t, i) {
                return '<label class="order-type">' +
                  '<input type="radio" name="order-type" value="' + t.value + '"' + (i === 0 ? " checked" : "") + ">" +
                  '<span class="order-type__body"><b>' + t.value + "</b><small>" + t.hint + "</small></span>" +
                "</label>";
              }).join("") +
            "</div>" +
          "</fieldset>" +

          '<fieldset class="order-step">' +
            '<legend class="order-step__title"><span class="order-step__num">2</span>Детали</legend>' +
            '<div class="collapse" id="order-extra" inert>' +
              '<div class="collapse__inner">' +
                '<div class="field">' +
                  '<label class="field__label" id="order-extra-label" for="order-extra-input"></label>' +
                  '<input class="field__input" id="order-extra-input" type="text" maxlength="120" autocomplete="off" aria-describedby="order-extra-error">' +
                  '<p class="field__error" id="order-extra-error" hidden></p>' +
                "</div>" +
              "</div>" +
            "</div>" +
            '<div class="field">' +
              '<label class="field__label" for="order-comment">Комментарий <span class="field__opt">— необязательно</span></label>' +
              '<input class="field__input" id="order-comment" type="text" maxlength="200" placeholder="пожелания, аллергии, «без сахара»…">' +
            "</div>" +
          "</fieldset>" +
        "</div>" +

        '<footer class="sheet__foot">' +
          '<div class="sheet__total"><span>Итого</span><b id="cart-total"></b></div>' +
          '<a class="order-submit" id="order-btn" href="#" target="_blank" rel="noopener">' + ICON_WA + "Отправить заказ в WhatsApp</a>" +
          '<p class="order-hint">Откроется WhatsApp с готовым текстом — останется нажать «Отправить»</p>' +
        "</footer>" +
      "</div>" +
    "</div>");

  var cartBar = document.getElementById("cart-bar");
  var cartBarInfo = document.getElementById("cart-bar-info");
  var cartBarCount = document.getElementById("cart-bar-count");
  var sheet = document.getElementById("cart-sheet");
  var sheetList = document.getElementById("cart-items");
  var sheetTotal = document.getElementById("cart-total");
  var sheetMeta = document.getElementById("cart-meta");
  var closedNote = document.getElementById("order-closed");
  var extraWrap = document.getElementById("order-extra");
  var extraInput = document.getElementById("order-extra-input");
  var extraError = document.getElementById("order-extra-error");
  var commentInput = document.getElementById("order-comment");
  var clearBtn = document.getElementById("cart-clear");
  var orderBtn = document.getElementById("order-btn");
  var picker = document.getElementById("variant-picker");
  var pickerTitle = document.getElementById("variant-title");
  var pickerBtns = document.getElementById("variant-options");
  var headerCount = document.getElementById("header-count");

  /* ---------- корзина ---------- */
  // cart: { key: {name, variant, price, qty} }
  var cart = {};
  var orderType = ORDER_TYPES[0].value;

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
      if (data && typeByValue(data.orderType)) orderType = data.orderType;
    } catch (e) { /* повреждённые данные — начинаем с пустой корзины */ }
  }

  function count() {
    return Object.keys(cart).reduce(function (n, k) { return n + cart[k].qty; }, 0);
  }

  function total() {
    return Object.keys(cart).reduce(function (s, k) { return s + cart[k].price * cart[k].qty; }, 0);
  }

  function money(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₽"; // 1 250 ₽
  }

  function positions(n) {
    return n + " " + RumaUI.plural(n, "позиция", "позиции", "позиций");
  }

  function add(name, variant, price) {
    var key = name + "|" + variant + "|" + price;
    if (cart[key]) cart[key].qty = Math.min(cart[key].qty + 1, 20);
    else cart[key] = { name: name, variant: variant, price: price, qty: 1 };
    saveCart();
    update();
    bump();
  }

  function changeQty(key, delta) {
    if (!cart[key]) return;
    cart[key].qty = Math.min(cart[key].qty + delta, 20);
    if (cart[key].qty <= 0) delete cart[key];
    saveCart();
    update();
  }

  // плашка корзины коротко «подпрыгивает», когда что-то добавили
  function bump() {
    cartBar.classList.remove("is-bump");
    void cartBar.offsetWidth;
    cartBar.classList.add("is-bump");
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
    cartBarCount.textContent = n;
    cartBarInfo.textContent = positions(n) + " · " + money(total());
    sheetMeta.textContent = positions(n);
    if (headerCount) {
      headerCount.hidden = n === 0;
      headerCount.textContent = n;
    }

    sheetList.innerHTML = Object.keys(cart).map(function (k) {
      var it = cart[k];
      return '<li class="cart-item">' +
        '<div class="cart-item__info">' +
          '<span class="cart-item__name">' + esc(it.name) + "</span>" +
          '<span class="cart-item__variant">' + esc([it.variant, money(it.price)].filter(Boolean).join(" · ")) + "</span>" +
        "</div>" +
        '<div class="cart-item__qty">' +
          '<button class="qty-btn" type="button" data-key="' + esc(k) + '" data-d="-1" aria-label="Убрать одну: ' + esc(it.name) + '">−</button>' +
          '<b aria-label="Количество">' + it.qty + "</b>" +
          '<button class="qty-btn" type="button" data-key="' + esc(k) + '" data-d="1" aria-label="Добавить ещё: ' + esc(it.name) + '"' + (it.qty >= 20 ? " disabled" : "") + ">+</button>" +
        "</div>" +
        '<span class="cart-item__sum">' + money(it.price * it.qty) + "</span>" +
      "</li>";
    }).join("");
    sheetTotal.textContent = money(total());

    applyOrderType();
    updateBadges();
  }

  // формат заказа: отмечаем карточку и плавно раскрываем/сворачиваем доп. поле.
  // Подпись поля меняем только когда оно нужно — при сворачивании текст остаётся до конца анимации.
  function applyOrderType() {
    document.querySelectorAll('input[name="order-type"]').forEach(function (r) {
      r.checked = r.value === orderType;
    });
    var extra = typeByValue(orderType).extra;
    if (extra) {
      document.getElementById("order-extra-label").innerHTML = esc(extra.label) +
        (extra.required ? "" : ' <span class="field__opt">— можно уточнить в чате</span>');
      extraInput.placeholder = extra.placeholder;
      extraInput.required = !!extra.required;
    }
    extraWrap.classList.toggle("is-open", !!extra);
    if (extra) extraWrap.removeAttribute("inert"); // свёрнутое поле не должно ловить Tab
    else extraWrap.setAttribute("inert", "");
    setError("");
  }

  function setError(text) {
    extraError.textContent = text;
    extraError.hidden = !text;
    extraInput.classList.toggle("is-invalid", !!text);
    extraInput.setAttribute("aria-invalid", text ? "true" : "false");
  }

  /* ---------- окна: открытие, фокус, закрытие ---------- */
  var lastFocus = null;

  function openOverlay(el) {
    lastFocus = document.activeElement;
    el.hidden = false;
    document.body.classList.add("no-scroll");
    el.querySelector(".dialog").focus();
  }

  // все окна страницы: корзина, выбор объёма и окна, которые подключают другие скрипты (окно ролла)
  var overlays = [sheet, picker];

  function openOverlays() {
    return overlays.filter(function (o) { return !o.hidden; });
  }

  function closeAll() {
    var wasOpen = openOverlays().length > 0;
    overlays.forEach(function (o) { o.hidden = true; });
    document.body.classList.remove("no-scroll");
    resetClear();
    if (wasOpen && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function openSheet() {
    if (count() === 0) return;
    var open = RumaUI.isOpenNow();
    closedNote.hidden = open;
    if (!open) {
      closedNote.textContent = "Сейчас RUMA закрыта, откроемся в " + RumaUI.hours.open +
        ". Заказ можно отправить заранее — его увидят после открытия.";
    }
    openOverlay(sheet);
  }

  // Tab не должен «убегать» из открытого окна на страницу под ним
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeAll(); return; }
    if (e.key !== "Tab") return;
    var open = openOverlays()[0];
    if (!open) return;
    var list = Array.prototype.filter.call(
      open.querySelectorAll("button:not([disabled]), a[href], input:not([type=radio]), input[type=radio]:checked"),
      function (el) { return el.offsetParent !== null; });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === open.querySelector(".dialog"))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });

  // крестик и затемнение закрывают любое окно (делегирование — окна могут появиться позже)
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) closeAll();
  });

  /* ---------- выбор варианта (объём/размер) ---------- */
  function pickVariant(name, variants) {
    pickerTitle.textContent = name;
    pickerBtns.innerHTML = variants.map(function (v, i) {
      return '<button class="variant-btn" type="button" data-i="' + i + '">' +
        "<span>" + esc(v.label || "Стандарт") + "</span><b>" + money(v.price) + "</b></button>";
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

  // «Очистить всё» — со второго нажатия, чтобы не стереть заказ случайно
  var clearTimer = null;
  function resetClear() {
    clearTimeout(clearTimer);
    clearBtn.classList.remove("is-confirm");
    clearBtn.textContent = "Очистить всё";
  }
  clearBtn.addEventListener("click", function () {
    if (!clearBtn.classList.contains("is-confirm")) {
      clearBtn.classList.add("is-confirm");
      clearBtn.textContent = "Точно очистить?";
      clearTimer = setTimeout(resetClear, 3000);
      return;
    }
    resetClear();
    cart = {};
    saveCart();
    update();
  });

  document.getElementById("cart-more").addEventListener("click", function () {
    closeAll();
    var menu = document.getElementById("menu");
    if (menu) menu.scrollIntoView({ behavior: "smooth" });
  });

  document.querySelectorAll('input[name="order-type"]').forEach(function (r) {
    r.addEventListener("change", function () {
      orderType = r.value;
      saveCart();
      applyOrderType();
    });
  });

  extraInput.addEventListener("input", function () { if (extraInput.value.trim()) setError(""); });

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
    var extra = typeByValue(orderType).extra;
    if (extra) {
      var val = extraInput.value.trim();
      lines.push(extra.label.replace(/\?$/, "") + ": " + (val || "(уточню в чате)"));
    }
    var comment = commentInput.value.trim();
    if (comment) lines.push("Комментарий: " + comment);
    return lines.join("\n");
  }

  orderBtn.addEventListener("click", function (e) {
    if (count() === 0) { e.preventDefault(); return; }
    var extra = typeByValue(orderType).extra;
    if (extra && extra.required && !extraInput.value.trim()) {
      e.preventDefault();
      setError(extra.error);
      extraInput.focus();
      return;
    }
    orderBtn.href = "https://wa.me/" + WHATSAPP_PHONE + "?text=" + encodeURIComponent(buildMessage());
    // после ухода в WhatsApp очищаем поля и закрываем окно,
    // чтобы по возвращении на сайт не оставались старые адрес/время/комментарий
    setTimeout(function () {
      extraInput.value = "";
      commentInput.value = "";
      closeAll();
    }, 400);
  });

  loadCart();
  update();

  // регистрация окна, созданного другим скриптом: даёт ему Escape, ловушку фокуса и блокировку прокрутки
  function registerOverlay(el) {
    if (overlays.indexOf(el) === -1) overlays.push(el);
  }

  return {
    add: add, count: count, openSheet: openSheet, refresh: updateBadges, buildMessage: buildMessage,
    openOverlay: openOverlay, closeAll: closeAll, registerOverlay: registerOverlay,
  };
})();

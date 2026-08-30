/* Рендер меню, вкладки, корзина и заказ через WhatsApp */
(function () {
  "use strict";

  var WHATSAPP_PHONE = "79064501429"; // номер для приёма заказов

  var panel = document.getElementById("menu-panel");
  var tabs = document.querySelectorAll(".tab");

  /* ---------- корзина ---------- */
  // cart: { key: {name, variant, price, qty} }
  var cart = {};
  var orderType = "С собой";
  var STORAGE_KEY = "ruma_cart_v1";

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart: cart, orderType: orderType }));
    } catch (e) { /* приватный режим — работаем без сохранения */ }
  }

  function loadCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && typeof data.cart === "object" && data.cart !== null) {
        Object.keys(data.cart).forEach(function (k) {
          var it = data.cart[k];
          if (it && typeof it.name === "string" && typeof it.price === "number" &&
              it.price > 0 && typeof it.qty === "number" && it.qty > 0) {
            cart[k] = { name: it.name, variant: it.variant || "", price: it.price, qty: Math.min(it.qty, 20) };
          }
        });
      }
      if (typeof data.orderType === "string") orderType = data.orderType;
    } catch (e) { /* повреждённые данные — начинаем с пустой корзины */ }
  }

  function cartCount() {
    return Object.keys(cart).reduce(function (n, k) { return n + cart[k].qty; }, 0);
  }

  function cartTotal() {
    return Object.keys(cart).reduce(function (s, k) { return s + cart[k].price * cart[k].qty; }, 0);
  }

  function addToCart(name, variant, price) {
    var key = name + "|" + variant + "|" + price;
    if (cart[key]) {
      cart[key].qty = Math.min(cart[key].qty + 1, 20);
    } else {
      cart[key] = { name: name, variant: variant, price: price, qty: 1 };
    }
    saveCart();
    updateCartUI();
  }

  function changeQty(key, delta) {
    if (!cart[key]) return;
    cart[key].qty += delta;
    if (cart[key].qty <= 0) delete cart[key];
    saveCart();
    updateCartUI();
  }

  /* ---------- варианты (позиции с двумя ценами, например 230/260) ---------- */
  // «Фильтр», note «200/300 мл», price «230/260» → два варианта: 200 мл за 230 и 300 мл за 260
  function getVariants(item) {
    var prices = String(item.price).split("/");
    if (prices.length < 2) {
      var p = parseInt(String(item.price).replace(/\D/g, ""), 10);
      if (!p) return null; // цена не распознана — без кнопки заказа
      return [{ label: item.note || "", price: p }];
    }
    var labels = [];
    var m = item.note && item.note.match(/^([\d.,]+)\s*\/\s*([\d.,]+)\s*(.*)$/);
    if (m) {
      labels = [m[1] + " " + m[3], m[2] + " " + m[3]];
    }
    return prices.map(function (pr, i) {
      var p = parseInt(pr.replace(/\D/g, ""), 10);
      return { label: (labels[i] || "вариант " + (i + 1)).trim(), price: p };
    }).filter(function (v) { return v.price > 0; });
  }

  /* ---------- рендер меню ---------- */
  var currentTab = "drinks";

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function render(tabKey) {
    currentTab = tabKey;
    var categories = MENU[tabKey] || [];
    panel.innerHTML = categories.map(function (cat, ci) {
      return '<section class="cat">' +
        '<h3 class="cat__title">' + esc(cat.title) +
          (cat.note ? ' <span class="cat__note">' + esc(cat.note) + "</span>" : "") + "</h3>" +
        '<ul class="cat__list">' +
        cat.items.map(function (it, ii) {
          var variants = getVariants(it);
          return '<li class="item">' +
            '<div class="item__row">' +
              '<span class="item__name">' + esc(it.name) +
                (it.note ? ' <span class="item__note">' + esc(it.note) + "</span>" : "") + "</span>" +
              '<span class="item__dots" aria-hidden="true"></span>' +
              '<span class="item__price">' + esc(it.price) + "&nbsp;₽</span>" +
              (variants ? '<button class="item__add" data-ci="' + ci + '" data-ii="' + ii +
                '" aria-label="Добавить ' + esc(it.name) + ' в заказ">+</button>' : "") +
            "</div>" +
            (it.desc ? '<p class="item__desc">' + esc(it.desc) + "</p>" : "") +
          "</li>";
        }).join("") +
        "</ul></section>";
    }).join("");
    updateMenuBadges();
  }

  // счётчики выбранного на кнопках «+» в меню
  function updateMenuBadges() {
    var counts = {};
    Object.keys(cart).forEach(function (k) {
      var it = cart[k];
      var ck = it.name + "|" + it.price;
      counts[ck] = (counts[ck] || 0) + it.qty;
    });
    document.querySelectorAll(".item__add").forEach(function (btn) {
      var cat = MENU[currentTab][parseInt(btn.dataset.ci, 10)];
      var item = cat && cat.items[parseInt(btn.dataset.ii, 10)];
      if (!item) return;
      var variants = getVariants(item) || [];
      var c = variants.reduce(function (s, v) { return s + (counts[item.name + "|" + v.price] || 0); }, 0);
      if (c > 0) btn.setAttribute("data-count", c);
      else btn.removeAttribute("data-count");
    });
  }

  panel.addEventListener("click", function (e) {
    var btn = e.target.closest(".item__add");
    if (!btn) return;
    var cat = MENU[currentTab][parseInt(btn.dataset.ci, 10)];
    var item = cat.items[parseInt(btn.dataset.ii, 10)];
    var variants = getVariants(item);
    if (!variants) return;
    if (variants.length === 1) {
      addToCart(item.name, variants[0].label, variants[0].price);
      flash(btn);
    } else {
      openVariantPicker(item.name, variants);
    }
  });

  function flash(btn) {
    btn.classList.add("item__add--flash");
    setTimeout(function () { btn.classList.remove("item__add--flash"); }, 350);
  }

  /* ---------- выбор варианта ---------- */
  var picker = document.getElementById("variant-picker");
  var pickerTitle = document.getElementById("variant-title");
  var pickerBtns = document.getElementById("variant-options");

  function openVariantPicker(name, variants) {
    pickerTitle.textContent = name;
    pickerBtns.innerHTML = variants.map(function (v, i) {
      return '<button class="variant-btn" data-i="' + i + '">' +
        (v.label ? esc(v.label) + " — " : "") + v.price + " ₽</button>";
    }).join("");
    pickerBtns.onclick = function (e) {
      var b = e.target.closest(".variant-btn");
      if (!b) return;
      var v = variants[parseInt(b.dataset.i, 10)];
      addToCart(name, v.label, v.price);
      closeOverlays();
    };
    picker.hidden = false;
  }

  /* ---------- корзина: панель и оформление ---------- */
  var cartBar = document.getElementById("cart-bar");
  var cartBarInfo = document.getElementById("cart-bar-info");
  var sheet = document.getElementById("cart-sheet");
  var sheetList = document.getElementById("cart-items");
  var sheetTotal = document.getElementById("cart-total");
  var extraWrap = document.getElementById("order-extra");
  var extraInput = document.getElementById("order-extra-input");
  var orderBtn = document.getElementById("order-btn");

  // подпись доп. поля для каждого формата заказа (null — поле не нужно)
  var EXTRA_FIELDS = {
    "С собой": null,
    "На месте": null,
    "Заберу заказ": { label: "К какому времени подготовить?", placeholder: "например, к 14:30" },
    "Отправить на такси": { label: "Адрес для такси", placeholder: "улица, дом" },
  };

  function updateCartUI() {
    var count = cartCount();
    cartBar.hidden = count === 0;
    if (count === 0) sheet.hidden = true;
    cartBarInfo.textContent = count + " поз. · " + cartTotal() + " ₽";

    sheetList.innerHTML = Object.keys(cart).map(function (k) {
      var it = cart[k];
      return '<li class="cart-item">' +
        '<span class="cart-item__name">' + esc(it.name) +
          (it.variant ? ' <span class="cart-item__variant">' + esc(it.variant) + "</span>" : "") + "</span>" +
        '<span class="cart-item__qty">' +
          '<button class="qty-btn" data-key="' + esc(k) + '" data-d="-1" aria-label="Убрать">−</button>' +
          "<b>" + it.qty + "</b>" +
          '<button class="qty-btn" data-key="' + esc(k) + '" data-d="1" aria-label="Добавить">+</button>' +
        "</span>" +
        '<span class="cart-item__sum">' + it.price * it.qty + " ₽</span>" +
      "</li>";
    }).join("");
    sheetTotal.textContent = cartTotal() + " ₽";

    document.querySelectorAll(".order-type").forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.type === orderType);
    });
    var extra = EXTRA_FIELDS[orderType];
    extraWrap.hidden = !extra;
    if (extra) {
      document.getElementById("order-extra-label").textContent = extra.label;
      extraInput.placeholder = extra.placeholder;
    }
    updateMenuBadges();
  }

  sheetList.addEventListener("click", function (e) {
    var b = e.target.closest(".qty-btn");
    if (b) changeQty(b.dataset.key, parseInt(b.dataset.d, 10));
  });

  document.getElementById("cart-clear").addEventListener("click", function () {
    cart = {};
    saveCart();
    updateCartUI();
  });

  document.querySelectorAll(".order-type").forEach(function (b) {
    b.addEventListener("click", function () {
      orderType = b.dataset.type;
      saveCart();
      updateCartUI();
    });
  });

  cartBar.addEventListener("click", function (e) {
    if (e.target.closest("#cart-bar-open")) sheet.hidden = false;
  });

  function closeOverlays() {
    sheet.hidden = true;
    picker.hidden = true;
  }
  document.querySelectorAll("[data-close]").forEach(function (el) {
    el.addEventListener("click", closeOverlays);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeOverlays();
  });

  /* ---------- сообщение в WhatsApp ---------- */
  function buildMessage() {
    var lines = ["Здравствуйте! Хочу сделать заказ в RUMA:", ""];
    Object.keys(cart).forEach(function (k) {
      var it = cart[k];
      lines.push("• " + it.name + (it.variant ? " (" + it.variant + ")" : "") +
        (it.qty > 1 ? " ×" + it.qty : "") + " — " + it.price * it.qty + " ₽");
    });
    lines.push("");
    lines.push("Итого: " + cartTotal() + " ₽");
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
    if (cartCount() === 0) { e.preventDefault(); return; }
    orderBtn.href = "https://wa.me/" + WHATSAPP_PHONE + "?text=" + encodeURIComponent(buildMessage());
    // после ухода в WhatsApp очищаем поля и закрываем окно,
    // чтобы по возвращении на сайт не оставались старые адрес/время/комментарий
    setTimeout(function () {
      extraInput.value = "";
      document.getElementById("order-comment").value = "";
      closeOverlays();
    }, 400);
  });

  /* ---------- вкладки ---------- */
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) {
        t.classList.toggle("is-active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      render(tab.dataset.tab);
    });
  });

  /* ---------- старт ---------- */
  loadCart();
  render("drinks");
  updateCartUI();
  document.getElementById("year").textContent = new Date().getFullYear();
})();

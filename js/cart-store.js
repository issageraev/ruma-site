/* Каталог и сохранённые товары. Адрес и комментарий сюда не записываются. */
window.RumaCartStore = (function () {
  "use strict";
  var key = "ruma_cart_v1";
  var entries = [];
  Object.keys(MENU).forEach(function (group) {
    MENU[group].forEach(function (category) {
      category.items.forEach(function (item) {
        (RumaUI.getVariants(item) || []).forEach(function (variant) {
          entries.push({
            id: item.id, name: item.name, variant: variant.label,
            price: variant.price, group: group
          });
        });
      });
    });
  });

  function find(item) {
    var matches = entries.filter(function (entry) {
      return (item.id ? entry.id === item.id : entry.name === item.name) &&
        entry.variant === (item.variant || "");
    });
    if (matches.length > 1) {
      matches = matches.filter(function (entry) { return entry.price === item.price; });
    }
    return matches.length === 1 ? matches[0] : null;
  }

  function itemKey(item) { return item.id + "|" + item.variant; }

  function normalize(input) {
    var cart = {};
    var changed = false;
    if (!input || typeof input !== "object" || Array.isArray(input)) return { cart: cart, changed: true };
    Object.keys(input).forEach(function (key) {
      var saved = input[key];
      var entry = saved && find(saved);
      if (!entry || !Number.isFinite(saved.qty) || saved.qty < 1) { changed = true; return; }
      var qty = Math.min(Math.floor(saved.qty), 20);
      var id = itemKey(entry);
      if (saved.price !== entry.price || saved.qty !== qty) changed = true;
      if (cart[id]) {
        cart[id].qty = Math.min(cart[id].qty + qty, 20);
        changed = true;
      } else {
        cart[id] = { id: entry.id, name: entry.name, variant: entry.variant, price: entry.price, qty: qty };
      }
    });
    return { cart: cart, changed: changed };
  }

  var memory = { cart: {}, revision: "", reset: "" };
  var available = true;
  function read() {
    try {
      var raw = localStorage.getItem(key);
      var data;
      try { data = raw ? JSON.parse(raw) : { cart: {} }; }
      catch (e) { data = { cart: {} }; }
      if (!data || typeof data !== "object") data = { cart: {} };
      var normalized = normalize(data && data.cart);
      memory = {
        cart: normalized.cart,
        revision: typeof data.revision === "string" ? data.revision : "",
        reset: typeof data.reset === "string" ? data.reset : ""
      };
      return { cart: memory.cart, revision: memory.revision, reset: memory.reset, changed: normalized.changed };
    } catch (e) {
      // Если хранилище недоступно, заказ остаётся в памяти этой страницы.
      return { cart: memory.cart, revision: memory.revision, reset: memory.reset, changed: false };
    }
  }

  function write(state) {
    memory = state;
    try { localStorage.setItem(key, JSON.stringify(state)); }
    catch (e) { available = false; }
    return state;
  }

  var queue = Promise.resolve();
  function mutate(change, preserveRevision) {
    function commit() {
      var state = read();
      change(state);
      state.cart = normalize(state.cart).cart;
      if (!preserveRevision || state.changed || !state.revision) {
        state.revision = Date.now() + "-" + Math.random().toString(36).slice(2);
      }
      return write({ cart: state.cart, revision: state.revision, reset: state.reset });
    }
    // Web Locks сериализует записи разных вкладок одного сайта.
    queue = queue.catch(function () {}).then(function () {
      return navigator.locks ? navigator.locks.request("ruma-cart", commit) : commit();
    });
    return queue;
  }

  function messageName(item) {
    var entry = find(item);
    if (!entry) return item.name;
    if (entry.group === "rolls" && /^Цезарь/.test(entry.name)) return "Ролл " + entry.name;
    if (entry.group === "food" && /^Цезарь/.test(entry.name)) return "Салат " + entry.name;
    return entry.name;
  }

  return {
    key: key, read: read, mutate: mutate, find: find, itemKey: itemKey,
    messageName: messageName, available: function () { return available; }
  };
})();

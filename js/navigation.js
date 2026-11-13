/* Главная и каталог переключаются без повторной загрузки сайта.
   Сохраняем сами DOM-узлы: корзина, фото и обработчики не создаются заново. */
window.RumaNavigation = (function () {
  "use strict";
  var views = Object.create(null), requests = Object.create(null);
  var current = document.body.dataset.page;
  var revision = 0, pendingHref = null, lastTap = { href: "", time: 0 };
  var base = new URL("./", location.href);

  function pageFromUrl(url) {
    if (url.origin !== location.origin || !url.pathname.startsWith(base.pathname)) return null;
    var path = url.pathname.slice(base.pathname.length);
    if (path === "" || path === "index" || path === "index.html") return "home";
    if (path === "menu" || path === "menu.html") return "menu";
    return null;
  }

  function rememberScroll() {
    history.replaceState(Object.assign({}, history.state, { rumaScroll: window.scrollY }), "", location.href);
  }

  function entry(main, title, page) { return { main: main, title: title, page: page, mounted: false, scroll: 0 }; }
  views[current] = entry(document.getElementById("main"), document.title, current);

  function loadView(page) {
    if (views[page]) return Promise.resolve(views[page]);
    if (requests[page]) return requests[page];
    var file = page === "home" ? "index.html" : "menu.html";
    requests[page] = fetch(new URL(file, base), { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("Page unavailable");
      return r.text();
    }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, "text/html");
      var main = doc.getElementById("main");
      if (!main || doc.body.dataset.page !== page) throw new Error("Unexpected page");
      // Полоса статуса находится вне <main>, добавляем её при входе через прямую ссылку каталога.
      if (page === "home" && !document.querySelector(".statusbar")) {
        var status = doc.querySelector(".statusbar");
        if (status) document.body.insertBefore(status, document.querySelector(".topbar"));
      }
      views[page] = entry(main, doc.title, page);
      return views[page];
    }).catch(function (err) { delete requests[page]; throw err; });
    return requests[page];
  }

  function mount(view) {
    document.body.dataset.page = view.page;
    document.body.classList.toggle("page-menu", view.page === "menu");
    document.title = view.title;
    document.querySelectorAll(".topbar__nav a").forEach(function (a) {
      if (a.textContent.trim() !== "Меню") return;
      if (view.page === "menu") a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (!view.mounted) {
      view.mounted = true;
      if (view.page === "home") RumaHome.mount();
      else RumaMenuPage.mount();
    }
  }

  function topFor(url) {
    var id = url.hash.slice(1);
    if (!id || id === "top") return 0;
    if (id === "rolls" && current === "home") id = "menu";
    // drinks / food / rolls выбирают раздел каталога, а не якорь в середине страницы.
    if (current === "menu" && ["drinks", "food", "rolls"].indexOf(id) !== -1) return 0;
    var target = document.getElementById(id);
    if (!target) return 0;
    var margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    var padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    return Math.max(0, target.getBoundingClientRect().top + scrollY - margin - padding);
  }

  function scrollToTop(top, smooth) {
    if (Math.abs(scrollY - top) < 2) return;
    window.scrollTo({ top: top, behavior: smooth ? "smooth" : "instant" });
  }

  var viewAnimation = null;
  function revealView(view) {
    if (viewAnimation) { viewAnimation.cancel(); viewAnimation = null; }
    if (!view.main.animate || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Содержимое уже на месте: лёгкое появление не задерживает нажатие и не ставится в очередь.
    viewAnimation = view.main.animate(
      [{ opacity: 0.55 }, { opacity: 1 }],
      { duration: 220, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
  }

  async function navigate(url, restore) {
    var page = pageFromUrl(url);
    if (!page) return;
    // Повторное нажатие текущего «Меню» сохраняет позицию чтения.
    if (!restore && current === page && page === "menu" && !url.hash) {
      revision++; pendingHref = null; // отменяем также ещё не завершённый переход на другой экран
      return;
    }
    if (!restore && pendingHref === url.href) return;
    var now = performance.now();
    if (!restore && lastTap.href === url.href && now - lastTap.time < 650) return;
    lastTap = { href: url.href, time: now };
    var ticket = ++revision;
    pendingHref = url.href;
    try {
      var view = views[page] || await loadView(page);
      if (ticket !== revision) return; // пока грузили, гость выбрал другую вкладку
      var switched = page !== current;
      var resume = null;
      if (!restore && switched && page === "menu" && !url.hash && view.mounted) {
        resume = view.scroll;
        var selected = view.main.querySelector("#menu-tabs .tab.is-active");
        if (selected && selected.dataset.tab !== "drinks") url.hash = selected.dataset.tab;
      }
      if (!restore) rememberScroll();
      views[current].scroll = scrollY;
      if (switched) {
        document.getElementById("main").replaceWith(view.main);
        current = page;
      }
      if (!restore && location.href !== url.href) history.pushState({ rumaScroll: 0 }, "", url.href);
      mount(view);
      document.dispatchEvent(new CustomEvent("ruma:navigation"));
      RumaCart.refresh();
      var top = restore && typeof restore.top === "number" ? restore.top : resume !== null ? resume : topFor(url);
      // Переход между экранами — сразу, якорь внутри экрана — одна плавная прокрутка.
      scrollToTop(top, !switched && !restore && !matchMedia("(prefers-reduced-motion: reduce)").matches);
      if (switched) {
        view.main.setAttribute("tabindex", "-1");
        view.main.focus({ preventScroll: true });
        revealView(view);
      }
    } catch (err) {
      console.warn("RUMA navigation fallback", err);
      if (ticket === revision) location.assign(url.href); // обычный переход, если предварительная загрузка не удалась
    } finally { if (ticket === revision) pendingHref = null; }
  }

  // Ссылки шапки и подвала одинаково работают на обоих экранах.
  document.querySelectorAll(".topbar a, .footer a").forEach(function (a) {
    var href = a.getAttribute("href");
    if (href === "#about" || href === "#contacts") a.href = "index.html" + href;
    if (href === "#menu" || href === "index.html#menu" || (a.closest(".topbar__nav") && a.textContent.trim() === "Меню")) a.href = "menu.html";
    if (a.classList.contains("topbar__logo") || a.classList.contains("footer__logo")) a.href = "index.html";
  });
  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute("download")) return;
    var url = new URL(a.href);
    if (!pageFromUrl(url)) return;
    e.preventDefault();
    navigate(url);
  });
  window.addEventListener("popstate", function (e) {
    navigate(new URL(location.href), { top: e.state && typeof e.state.rumaScroll === "number" ? e.state.rumaScroll : undefined });
  });
  window.addEventListener("hashchange", function () {
    document.dispatchEvent(new CustomEvent("ruma:navigation"));
  });
  history.scrollRestoration = "manual";
  // Сначала общий интерфейс, затем единственный контроллер текущего экрана.
  RumaUI.init();
  mount(views[current]);
  document.dispatchEvent(new CustomEvent("ruma:navigation"));
  if (location.hash) requestAnimationFrame(function () { scrollToTop(topFor(new URL(location.href)), false); });
  // Загружаем вторую страницу один раз после первой отрисовки, до первого нажатия.
  var prefetch = function () { loadView(current === "home" ? "menu" : "home").catch(function () {}); };
  if ("requestIdleCallback" in window) requestIdleCallback(prefetch, { timeout: 800 });
  else setTimeout(prefetch, 150);
  return { rememberScroll: rememberScroll, pageFromUrl: pageFromUrl };
})();

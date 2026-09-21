(function () {
  "use strict";

  /* контакты — единственное место, где менять номер/юзернейм/почту */
  var WHATSAPP_PHONE = "79958589505";
  var TELEGRAM_USERNAME = "pridestatus";
  var EMAIL = "geraevinc@gmail.com";
  var WHATSAPP_GREETING = "Здравствуйте! Пишу по вашему портфолио.";

  var LANG_KEY = "geraev_lang";

  /* ссылки уже лежат рабочими в HTML (сайт должен работать без JS) —
     здесь просто пересобираем их из констант, чтобы номер/юзернейм
     редактировались в одном месте */
  function buildContactLinks() {
    var waHref = "https://wa.me/" + WHATSAPP_PHONE + "?text=" + encodeURIComponent(WHATSAPP_GREETING);
    var tgHref = "https://t.me/" + TELEGRAM_USERNAME;
    var mailHref = "mailto:" + EMAIL;

    Array.prototype.forEach.call(document.querySelectorAll("[data-contact='whatsapp']"), function (el) {
      el.href = waHref;
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-contact='telegram']"), function (el) {
      el.href = tgHref;
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-contact='email']"), function (el) {
      el.href = mailHref;
    });
  }

  function getLang() {
    try {
      return localStorage.getItem(LANG_KEY) || "ru";
    } catch (e) {
      return "ru";
    }
  }

  function setLang(lang) {
    var dict = window.I18N && window.I18N[lang];
    if (!dict) return;

    document.documentElement.lang = lang;

    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (el) {
      var key = el.getAttribute("data-i18n");
      if (Object.prototype.hasOwnProperty.call(dict, key)) {
        var value = dict[key];
        el.textContent = value;
        el.hidden = value === "";
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-aria]"), function (el) {
      var key = el.getAttribute("data-i18n-aria");
      if (Object.prototype.hasOwnProperty.call(dict, key)) {
        el.setAttribute("aria-label", dict[key]);
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll(".lang-btn"), function (btn) {
      var isActive = btn.getAttribute("data-lang") === lang;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });

    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch (e) {}
  }

  function initLangSwitch() {
    Array.prototype.forEach.call(document.querySelectorAll(".lang-btn"), function (btn) {
      btn.addEventListener("click", function () {
        setLang(btn.getAttribute("data-lang"));
      });
    });
    setLang(getLang());
  }

  function initScrollReveal() {
    var items = document.querySelectorAll(".reveal");

    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(items, function (el) { el.classList.add("is-visible"); });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    Array.prototype.forEach.call(items, function (el) { observer.observe(el); });
  }

  function initFooterYear() {
    var el = document.getElementById("year");
    if (el) el.textContent = String(new Date().getFullYear());
  }

  document.addEventListener("DOMContentLoaded", function () {
    buildContactLinks();
    initLangSwitch();
    initScrollReveal();
    initFooterYear();
  });
})();

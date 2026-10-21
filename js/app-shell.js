/* Поведение сайта, установленного на экран «Домой» (режим приложения).
   Подключается в <head> до отрисовки страницы. */
(function () {
  "use strict";

  var standalone = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  if (!standalone) return; // в обычном браузере ничего не меняем — там щипок для увеличения нужен людям с плохим зрением

  document.documentElement.classList.add("is-app");

  // в приложении запрещаем масштабирование
  var viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
  }

  // iOS присылает собственные события щипка — гасим их
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (type) {
    document.addEventListener(type, function (e) { e.preventDefault(); }, { passive: false });
  });
})();

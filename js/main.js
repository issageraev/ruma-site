/* Рендер меню и переключение вкладок */
(function () {
  const panel = document.getElementById("menu-panel");
  const tabs = document.querySelectorAll(".tab");

  function render(tabKey) {
    const categories = MENU[tabKey] || [];
    panel.innerHTML = categories
      .map(
        (cat) => `
      <section class="cat">
        <h3 class="cat__title">${cat.title}${cat.note ? ` <span class="cat__note">${cat.note}</span>` : ""}</h3>
        <ul class="cat__list">
          ${cat.items
            .map(
              (it) => `
            <li class="item">
              <div class="item__row">
                <span class="item__name">${it.name}${it.note ? ` <span class="item__note">${it.note}</span>` : ""}</span>
                <span class="item__dots" aria-hidden="true"></span>
                <span class="item__price">${it.price}&nbsp;₽</span>
              </div>
              ${it.desc ? `<p class="item__desc">${it.desc}</p>` : ""}
            </li>`
            )
            .join("")}
        </ul>
      </section>`
      )
      .join("");
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.toggle("is-active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      render(tab.dataset.tab);
    });
  });

  render("drinks");

  document.getElementById("year").textContent = new Date().getFullYear();
})();

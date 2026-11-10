const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const base = "https://ruma-test.invalid/ruma-site/";

(async function () {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, reducedMotion: "reduce"
    });
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (!url.href.startsWith(base)) return route.abort();
      const file = path.resolve(root, url.pathname.slice("/ruma-site/".length) || "index.html");
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
      return route.fulfill({ path: file });
    });
    const errors = [];
    context.on("page", page => page.on("pageerror", e => errors.push(e.message)));
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const go = async (target = page) => {
      await target.goto(base + "menu.html#food");
      await target.evaluate(() => RumaCart.ready);
    };
    const count = async (expected, target = page) =>
      target.waitForFunction(n => RumaCart.count() === n, expected, { polling: 50 });
    const message = () => page.evaluate(() => RumaCart.buildMessage());
    const clear = async () => {
      await page.locator("#cart-bar-open").click();
      await page.locator("#cart-clear").click();
      await page.locator("#cart-clear").click();
      await count(0);
    };
    const send = async () => {
      await page.locator("#order-btn").evaluate(el =>
        el.addEventListener("click", e => e.preventDefault(), { once: true }));
      await page.locator("#order-btn").click();
      await page.locator("#confirm-yes").waitFor();
    };
    await go();
    assert.equal(await page.evaluate(() => {
      const ids = Object.values(MENU).flatMap(categories => categories.flatMap(category => category.items.map(item => item.id)));
      return ids.length === new Set(ids).size && ids.every(Boolean);
    }), true);
    assert.equal(await page.evaluate(() => RumaUI.getVariants({price: "250,50"})), null);
    await page.evaluate(() => {
      localStorage.ruma_cart_v1 = JSON.stringify({
        cart: {
          old: { name: "Бургер", price: 340, qty: 1 },
          removed: { name: "Удалённое блюдо", price: 1, qty: 1 }
        },
        draft: { extra: "СТАРЫЙ АДРЕС", comment: "СТАРЫЙ КОММЕНТАРИЙ" }
      });
    });
    await page.reload();
    await page.evaluate(() => RumaCart.ready);
    await count(1);
    assert.match(await message(), /Бургер — 490 ₽/);
    assert.doesNotMatch(await message(), /340|Удалённое|СТАРЫЙ/);
    await page.getByRole("button", { name: "Добавить в заказ: Бургер", exact: true }).click();
    await count(2);
    assert.match(await message(), /Бургер ×2 — 980 ₽/);
    assert.equal(await page.locator(".cart-item").count(), 1);
    await page.locator("#cart-bar-open").click();
    await page.locator('input[value="Отправить на такси"] + span').click();
    await page.locator("#order-btn").click();
    assert.equal(await page.locator("#order-extra-error").isVisible(), true);
    await page.locator("#order-extra-input").fill("НОВЫЙ АДРЕС");
    await page.locator("#order-btn").click();
    assert.equal(await page.locator("#order-pay-error").isVisible(), true);
    await page.locator('input[value="Банковской картой"] + span').click();
    await page.locator("#order-comment").fill('<img src=x onerror="alert(1)">');
    await page.locator('input[value="Заберу заказ"] + span').click();
    assert.equal(await page.locator("#order-extra-input").inputValue(), "");
    await page.locator("#order-extra-input").fill("14:30");
    assert.match(await message(), /14:30/);
    assert.doesNotMatch(await message(), /НОВЫЙ АДРЕС/);
    await page.locator('input[value="Отправить на такси"] + span').click();
    assert.equal(await page.locator("#order-extra-input").inputValue(), "НОВЫЙ АДРЕС");
    assert.doesNotMatch(await page.evaluate(() => localStorage.ruma_cart_v1), /АДРЕС|onerror|payment|draft/);
    await send();
    assert.equal(await page.locator("#confirm-again").evaluate(el => new URL(el.href).origin), "https://wa.me");
    assert.doesNotMatch(await page.evaluate(() => sessionStorage.ruma_order_pending), /href|АДРЕС/);
    await page.reload();
    await page.evaluate(() => RumaCart.ready);
    await page.locator("#confirm-no").waitFor();
    await page.locator("#confirm-no").click();
    await page.locator("#cart-clear").click();
    await page.locator("#cart-clear").click();
    await count(0);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("ruma_order_draft_v2")), null);
    assert.equal(await page.locator("#order-comment").inputValue(), "");
    await page.reload();
    await page.evaluate(() => RumaCart.ready);
    await page.getByRole("button", { name: "Добавить в заказ: Бургер", exact: true }).click();
    await count(1);
    assert.doesNotMatch(await message(), /АДРЕС|onerror|14:30/);
    const other = await context.newPage();
    await go(other);
    await Promise.all([
      page.evaluate(() => RumaCart.add("Бургер", "", 490)),
      other.evaluate(() => RumaCart.add("Сырники", "", 400))
    ]);
    await count(3);
    await count(3, other);
    assert.match(await message(), /Сырники/);
    await page.locator("#cart-bar-open").click();
    await send();
    await other.evaluate(() => RumaCart.add("Бургер", "", 490));
    await count(4);
    // Даже устаревший обработчик подтверждения не должен очистить новый состав.
    await page.locator("#confirm-yes").evaluate(el => el.click());
    await count(4);
    assert.match(await message(), /Бургер ×3/);
    await page.keyboard.press("Escape");
    await clear();
    await page.evaluate(() => {
      const now = Date.now();
      localStorage.ruma_cart_v1 = JSON.stringify({ cart: {
        invalid: { name: "Бургер", price: 1, qty: 1.5 },
        excessive: { name: "Сырники", price: 1, qty: 500 },
        markup: { name: '<img src=x onerror="alert(1)">', price: 1, qty: 1 }
      }});
      localStorage.ruma_order_pending = JSON.stringify({ ts: now, href: "https://example.invalid" });
      sessionStorage.ruma_order_pending = JSON.stringify({ ts: now + 100000, href: "javascript:alert(1)" });
      sessionStorage.ruma_order_draft_v2 = JSON.stringify({
        expires: now - 1, details: { "Отправить на такси": "ПРОСРОЧЕННЫЙ АДРЕС" }, comment: "ПРОСРОЧЕННЫЙ"
      });
    });
    await page.reload();
    await page.evaluate(() => RumaCart.ready);
    await count(21);
    assert.equal(await page.locator("#confirm-again").getAttribute("href"), "#");
    assert.equal(await page.evaluate(() => localStorage.getItem("ruma_order_pending")), null);
    assert.doesNotMatch(await message(), /ПРОСРОЧЕННЫЙ|onerror/);
    await clear();
    await page.getByRole("button", { name: "Добавить в заказ: Бургер", exact: true }).click();
    await count(1);
    await page.locator("#cart-bar-open").click();
    await send();
    await page.locator("#confirm-yes").click();
    await count(0);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("ruma_order_pending")), null);
    await page.goto(base + "index.html");
    await page.getByRole("button", { name: "Добавить в заказ: Капучино", exact: true }).click();
    await page.locator(".variant-btn").last().click();
    await count(1);
    await page.goto(base + "rolls.html");
    await page.locator(".roll-card__open").first().click();
    await page.locator("#roll-add").click();
    await count(2);
    await page.goto(base + "menu.html");
    await count(2);
    assert.match(await message(), /Капучино \(300 мл\).*280 ₽/);
    assert.match(await message(), /Итого: 730 ₽/);
    assert.deepEqual(errors, []);
    console.log("PASS migration, prices, quantities, privacy, modes, tabs, confirmation, safe links, navigation");
    await context.close();
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

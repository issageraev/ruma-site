const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const base = "https://ruma-test.invalid/ruma-site/";

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (!url.href.startsWith(base)) return route.abort();
      const file = path.resolve(root, url.pathname.slice("/ruma-site/".length) || "index.html");
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
      return route.fulfill({ path: file });
    });
    const errors = [];
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message));
    page.setDefaultTimeout(5000);
    const selected = key => page.waitForFunction(key =>
      document.querySelector("#menu-panel").getAttribute("aria-labelledby") === "tab-" + key, key);
    const choose = async key => {
      await page.locator('#menu-tabs [data-tab="' + key + '"]').click();
      await selected(key);
    };

    await page.goto(base + "menu.html");
    await page.evaluate(() => RumaCart.ready);
    assert.deepEqual(await page.locator("#menu-tabs .tab").allTextContents(), ["Кофе и напитки", "Завтраки и кухня", "Роллы"]);
    const expectedCounts = await page.evaluate(() => Object.fromEntries(Object.entries(MENU).map(([key, cats]) => [key, cats.reduce((n, c) => n + c.items.length, 0)])));
    assert.equal(await page.locator("#menu-panel .item").count(), expectedCounts.drinks);
    const drinkChips = await page.locator(".chip").allTextContents();
    await page.getByRole("button", { name: "Добавить в заказ: Капучино", exact: true }).click();
    await page.locator(".variant-btn").last().click();
    await page.waitForFunction(() => RumaCart.count() === 1);

    await choose("food");
    assert.equal(await page.locator("#menu-panel .item").count(), expectedCounts.food);
    await page.getByRole("button", { name: "Добавить в заказ: Бургер", exact: true }).click();
    await page.waitForFunction(() => RumaCart.count() === 2);
    await choose("rolls");
    assert.equal(await page.locator("#menu-panel .roll-card").count(), expectedCounts.rolls);
    assert.equal(await page.locator("#chips").isVisible(), false);
    const text = await page.locator(".roll-card__desc").first().textContent();
    await page.locator(".roll-card__open").first().click();
    assert.equal(await page.locator("#roll-comp").textContent(), text);
    assert.equal(await page.locator("#roll-gallery img").count(), 2);
    await page.locator("#roll-add").click();
    await page.waitForFunction(() => RumaCart.count() === 3);
    const message = await page.evaluate(() => RumaCart.buildMessage());
    assert.match(message, /Капучино \(300 мл\).*280 ₽/);
    assert.match(message, /Бургер — 490 ₽/);
    assert.match(message, /Калифорния с креветкой — 450 ₽/);
    assert.match(message, /Итого: 1220 ₽/);
    await choose("drinks");
    assert.deepEqual(await page.locator(".chip").allTextContents(), drinkChips);
    await page.goBack();
    await selected("rolls");
    await page.reload();
    await selected("rolls");
    await page.evaluate(() => RumaCart.ready);
    assert.equal(await page.evaluate(() => RumaCart.count()), 3);
    await page.goBack();
    await selected("food");
    await page.goForward();
    await selected("rolls");

    // Previous URLs and homepage previews land in the same catalogue.
    await page.goto(base + "rolls.html?from=qr");
    await page.waitForURL(base + "menu.html?from=qr#rolls");
    await selected("rolls");
    await page.goto(base + "index.html#rolls");
    await selected("rolls");
    assert.equal(await page.locator(".section.rolls").count(), 0);
    assert.equal(await page.locator("#menu-panel .roll-card").count(), 4);
    await page.locator("#full-menu-link").click();
    await page.waitForURL(base + "menu.html#rolls");
    await selected("rolls");
    await page.locator('.tabbar__item[data-key="home"]').click();
    await page.waitForURL(base + "index.html");
    await page.locator('.tabbar__item[data-key="menu"]').click();
    await page.waitForURL(base + "menu.html");

    // All labels fit and remain tappable at narrow widths. Arrow navigation reaches all three tabs.
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const key of ["drinks", "food", "rolls"]) {
        await choose(key);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, width + "px: overflow in " + key);
        assert.equal(await page.locator(".tab").evaluateAll(tabs => tabs.every(t => t.scrollWidth <= t.clientWidth + 1 && t.scrollHeight <= t.clientHeight + 1)), true, width + "px: clipped labels");
      }
    }
    await page.locator('#menu-tabs [data-tab="drinks"]').focus();
    await page.keyboard.press("ArrowRight");
    await selected("food");
    await page.keyboard.press("ArrowRight");
    await selected("rolls");

    // Motion-enabled rapid switching must leave the last selected panel mounted.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => ["drinks", "food", "rolls"].forEach(key => document.querySelector('#menu-tabs [data-tab="' + key + '"]').click()));
    await selected("rolls");
    await page.waitForFunction(() => document.querySelector("#menu-panel").getAnimations().length === 0);
    assert.equal(await page.locator(".roll-card").count(), expectedCounts.rolls);
    assert.deepEqual(errors, []);
    await context.close();
    console.log("Unified menu: all sections, photos, cart, redirects, history, keyboard and responsive layout passed.");
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

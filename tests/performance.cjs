const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const base = "https://ruma-test.invalid/ruma-site/";

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", isMobile: true, hasTouch: true });
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (!url.href.startsWith(base)) return route.abort();
      const file = path.resolve(root, url.pathname.slice("/ruma-site/".length) || "index.html");
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
      return route.fulfill({ path: file });
    });
    const page = await context.newPage();
    const requests = [];
    page.on("request", r => requests.push(r.url()));
    await page.goto(base + "index.html");
    await page.evaluate(() => RumaCart.ready);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(requests.some(url => /fonts\.googleapis|fonts\.gstatic/.test(url)), false);
    await page.locator(".contacts__map").scrollIntoViewIfNeeded();
    assert.equal(requests.some(url => url.includes("map-widget")), false);
    await page.locator("[data-map-src]").click();
    assert.equal(await page.locator(".contacts__map iframe").count(), 1);
    assert.equal(requests.some(url => url.includes("map-widget")), true);
    await page.goto(base + "menu.html#rolls");
    await page.locator(".roll-card").first().waitFor();
    await page.locator(".roll-card").first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector(".roll-card__img").naturalWidth > 0);
    assert.match(await page.locator(".roll-card__img").first().evaluate(i => i.currentSrc), /-(320|640)\.webp$/);
    assert.equal(requests.some(url => url.includes("-detail.webp")), false);
    await page.locator(".roll-card__open").first().click();
    await page.locator("#roll-gallery img").last().waitFor();
    assert.equal(requests.some(url => url.includes("-detail.webp")), true);
    console.log("PASS local fonts, click-to-load map, responsive cards and on-demand gallery");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const base = "https://ruma-test.invalid/ruma-site/";
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 440, height: 956 } });
    const requests = [], errors = [];
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (!url.href.startsWith(base)) return route.abort();
      requests.push({ path: url.pathname, type: route.request().resourceType() });
      const file = path.resolve(root, url.pathname.slice("/ruma-site/".length) || "index.html");
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
      // A slow response makes duplicate taps and abandoned navigations reproducible.
      if (file.endsWith("menu.html") && route.request().resourceType() === "fetch") await new Promise(r => setTimeout(r, 300));
      return route.fulfill({ path: file });
    });
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", msg => { if(msg.type()==="warning") console.log(msg.text()); });
    page.setDefaultTimeout(5000);
    await page.goto(base);
    await page.evaluate(() => { window.navigationMarker = "persistent"; window.homeNode = document.getElementById("main"); });
    await page.evaluate(() => {
      const menu = document.querySelector('.tabbar__item[data-key="menu"]');
      for (let i=0; i<30; i++) menu.click();
    });
    await page.waitForFunction(() => document.body.dataset.page === "menu");
    assert.equal(await page.evaluate(() => window.navigationMarker), "persistent");
    assert.equal(await page.locator(".tabbar").count(), 1);
    assert.equal(requests.filter(r => r.path.endsWith("menu.html")).length, 1);
    assert.equal(requests.filter(r => r.type === "document").length, 1);

    await page.getByRole('tab', {name:'Роллы',exact:true}).click();
    await page.locator('.roll-card__add').first().click();
    await page.waitForFunction(() => RumaCart.count() === 1);
    await page.waitForTimeout(350); // дождаться окончания появления списка и плашки корзины
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; scrollTo(0, 650); });
    const before = await page.evaluate(() => ({ y: scrollY, history: history.length, main: document.getElementById('main') }));
    await page.evaluate(() => {
      const menu = document.querySelector('.tabbar__item[data-key="menu"]');
      window.catalogueNode = document.getElementById('main');
      for (let i=0; i<60; i++) menu.click();
    });
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => scrollY), before.y, 'active menu repeated taps must not jump to top');
    assert.equal(await page.evaluate(() => history.length), before.history);
    assert.equal(requests.filter(r => r.path.endsWith('menu.html')).length, 1);

    await page.locator('.tabbar__item[data-key="contacts"]').click();
    await page.waitForFunction(() => document.body.dataset.page === 'home');
    assert.equal(await page.evaluate(() => document.getElementById('main') === homeNode), true);
    await page.waitForTimeout(900);
    const contactY = await page.evaluate(() => scrollY);
    const contactHistory = await page.evaluate(() => history.length);
    await page.evaluate(() => {
      const contact = document.querySelector('.tabbar__item[data-key="contacts"]');
      for(let i=0;i<50;i++) contact.click();
    });
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => scrollY), contactY);
    assert.equal(await page.evaluate(() => history.length), contactHistory);
    await page.locator('.tabbar__item[data-key="menu"]').click();
    await page.waitForFunction(() => document.body.dataset.page === 'menu');
    assert.equal(await page.evaluate(() => document.getElementById('main') === catalogueNode), true);
    assert.equal(await page.evaluate(() => RumaCart.count()), 1);
    assert.equal(await page.locator('#menu-tabs .is-active').getAttribute('data-tab'), 'rolls');
    await page.goBack();
    await page.waitForFunction(() => document.body.dataset.page === 'home');
    assert.equal(await page.evaluate(() => Math.abs(scrollY - Number(history.state.rumaScroll)) < 3), true);
    await page.goForward();
    await page.waitForFunction(() => document.body.dataset.page === 'menu');
    assert.equal(await page.evaluate(() => window.navigationMarker), 'persistent');
    assert.equal(await page.evaluate(() => RumaCart.count()), 1);
    assert.equal(await page.locator('.tabbar').count(), 1);

    // Interleaved taps leave the last requested view visible; no full-page reload.
    await page.evaluate(() => {
      for (let i=0; i<12; i++) {
        document.querySelector('.tabbar__item[data-key="home"]').click();
        document.querySelector('.tabbar__item[data-key="menu"]').click();
      }
    });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => document.body.dataset.page), 'menu');
    assert.equal(requests.filter(r => r.type === 'document').length, 1);
    assert.equal(requests.filter(r => r.path.endsWith('menu.html')).length, 1);
    for (const width of [320,390,440,1440]) {
      await page.setViewportSize({width,height:956});
      const labels = await page.locator('#menu-tabs .tab').evaluateAll(tabs => tabs.map(t => {
        const text = new Range(); text.selectNodeContents(t);
        return {size:getComputedStyle(t).fontSize, rows:text.getClientRects().length, fits:t.scrollWidth<=t.clientWidth+1};
      }));
      assert.equal(new Set(labels.map(t=>t.size)).size,1);
      assert.ok(labels.every(t=>t.rows===1 && t.fits), width+'px: labels should be one line');
    }
    assert.equal(await page.locator('.topbar__nav').evaluate(el=>getComputedStyle(el).userSelect), 'none');
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS navigation without reload, cached views, repeated taps, cart preservation, Back/Forward and single-line labels');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

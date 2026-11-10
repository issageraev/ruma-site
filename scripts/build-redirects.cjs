const fs = require("node:fs");
const path = require("node:path");
fs.mkdirSync("_pages", { recursive: true });
for (const name of ["index.html", "menu.html", "rolls.html", "404.html"]) {
  const page = name === "404.html" ? "index.html" : name;
  const target = "https://ruma.geraevinc.workers.dev/ruma-site/" + page;
  const html = '<!doctype html><html lang="ru"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="refresh" content="0;url=' + target + '">' +
    '<link rel="canonical" href="' + target + '"><title>RUMA — новый адрес</title>' +
    '<p>Сайт RUMA переехал. <a href="' + target + '">Открыть меню</a></p>' +
    '<script>location.replace(' + JSON.stringify(target) + '+location.search+location.hash)</script></html>';
  fs.writeFileSync(path.join("_pages", name), html);
}

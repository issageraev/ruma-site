#!/bin/sh
# Проставляет новую версию ?v= у css/js в index.html и menu.html,
# чтобы браузеры гостей сразу получили свежие файлы, а не кеш.
cd "$(dirname "$0")/.." || exit 1
V=$(date +%Y%m%d%H%M)
sed -i.bak -E "s/(\.(css|js))\?v=[0-9A-Za-z]+/\1?v=$V/g" index.html menu.html
rm -f index.html.bak menu.html.bak
echo "Версия файлов: $V"

#!/bin/bash
# ECHO live-site comprehensive test — https://echo-wheat-one.vercel.app
BASE="https://echo-wheat-one.vercel.app"
echo "=============================================="
echo " ECHO LIVE TEST — $BASE"
echo "=============================================="

echo ""
echo "=== [1] Homepage headers ==="
curl -s -D - -o /dev/null "$BASE/" | grep -iE "^(HTTP|x-vercel|cache-control|content-type|content-encoding|x-matched-path)" | head -12

echo ""
echo "=== [2] Homepage HTML sanity ==="
grep -c 'id="__next_error__"' /tmp/echo_home.html 2>/dev/null | xargs -I{} echo "next_error div count: {} (0 = good)"
grep -o 'lang="[a-z-]*"' /tmp/echo_home.html | head -1
grep -oE '/_next/static/[^"]+\.(woff2|css|js)' /tmp/echo_home.html | sort -u > /tmp/assets.txt
echo "unique asset refs found: $(wc -l < /tmp/assets.txt)"

echo ""
echo "=== [3] Static assets (up to 14) ==="
i=0
while read -r a; do
  i=$((i+1)); [ $i -gt 14 ] && break
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$a")
  ctype=$(curl -s -o /dev/null -w "%{content_type}" "$BASE$a")
  echo "$code  $ctype  $a"
done < /tmp/assets.txt

echo ""
echo "=== [4] PWA icons from manifest ==="
grep -oE '"src":"[^"]+"' /tmp/manifest.json | head -6
for icon in icon-192.png icon-512.png icon-maskable-512.png favicon.ico; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/$icon")
  echo "$code  /$icon"
done

echo ""
echo "=== [5] AI ASK (correct shape, arabic, search intent) ==="
curl -s -m 58 -X POST "$BASE/api/echo/ai/ask" \
  -H "Content-Type: application/json" \
  -d '{"lang":"ar","history":[{"role":"user","content":"رشحني فيلم زي Parasite بس أهدأ"}],"digest":{"librarySize":3,"ratedCount":2,"favouritesCount":1,"mix":{"anime":1,"movie":1,"series":1,"game":0,"book":0},"topGenres":["Thriller","Sci-Fi"],"recent":[{"title":"Parasite","status":"completed","rating":5}]}}' \
  -w "\n--> HTTP:%{http_code} TIME:%{time_total}s\n" | head -c 1200

echo ""
echo "=== [6] AI COMPANION (stats snapshot) ==="
curl -s -m 58 -X POST "$BASE/api/echo/ai/companion" \
  -H "Content-Type: application/json" \
  -d '{"lang":"en","stats":{"librarySize":12,"ratedCount":8,"favouritesCount":3,"avgRating":4.1,"mix":{"anime":4,"movie":4,"series":2,"game":1,"book":1},"topGenres":["Drama","Sci-Fi","Thriller"]},"topRated":[{"title":"Interstellar","mediaType":"movie","rating":5}],"recentAdds":[{"title":"Death Note","mediaType":"anime"}]}' \
  -w "\n--> HTTP:%{http_code} TIME:%{time_total}s\n" | head -c 900

echo ""
echo "=== [7] AI WEEKLY (digest) ==="
curl -s -m 58 -X POST "$BASE/api/echo/ai/weekly" \
  -H "Content-Type: application/json" \
  -d '{"lang":"en","stats":{"librarySize":12,"ratedCount":8,"avgRating":4.1,"mix":{"anime":4,"movie":4,"series":2,"game":1,"book":1},"topGenres":["Drama","Sci-Fi"]},"weekActivity":{"added":3,"rated":2,"newFavourites":1,"mostActiveDay":"Friday"},"picks":[{"title":"The Prestige","mediaType":"movie"}]}' \
  -w "\n--> HTTP:%{http_code} TIME:%{time_total}s\n" | head -c 900

echo ""
echo "=== [8] TRANSLATE — arabic passthrough + english batch ==="
curl -s -m 58 -X POST "$BASE/api/echo/translate" \
  -H "Content-Type: application/json" \
  -d '{"texts":["مسرحية عربية جاهزة","A young boy discovers he can bend the elements to his will."],"force":true}' \
  -w "\n--> HTTP:%{http_code} TIME:%{time_total}s\n" | head -c 700

echo ""
echo "=== [9] Bad requests (must be 400 not 500) ==="
for ep in ai/ask ai/companion ai/weekly translate; do
  code=$(curl -s -o /tmp/bad.json -w "%{http_code}" -X POST "$BASE/api/echo/$ep" -H "Content-Type: application/json" -d '{"junk":true}')
  echo "$code  /api/echo/$ep  -> $(head -c 80 /tmp/bad.json)"
done
code=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE/api/echo/ai/ask"); echo "$code  GET on ai/ask (expect 405)"

echo ""
echo "=== [10] 404 page ==="
code=$(curl -s -o /tmp/404.html -w "%{http_code}" "$BASE/this-page-does-not-exist")
echo "HTTP $code, size $(wc -c < /tmp/404.html) bytes (custom 404 renders the app)"

echo ""
echo "=== [11] Security headers / misc ==="
curl -s -D - -o /dev/null "$BASE/" | grep -iE "^(x-frame|x-content-type|strict-transport|referrer-policy|server|x-vercel-id)" | head -8

echo ""
echo "DONE."

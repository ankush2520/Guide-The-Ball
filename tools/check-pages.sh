#!/usr/bin/env bash
# Is GitHub Pages serving the real build?
#
# The repo's Pages source must be "GitHub Actions". While it is instead
# "Deploy from a branch", GitHub's legacy Jekyll builder republishes the
# repo root a few seconds after every Actions deploy, overwriting it with
# the Vite dev entry (index.html -> /src/main.tsx). That path is absolute,
# so it resolves off the /Guide-The-Ball/ sub-path and 404s -> blank page.
set -uo pipefail
REPO=ankush2520/Guide-The-Ball
SITE=https://ankush2520.github.io/Guide-The-Ball

# Which app performed the MOST RECENT deployment decides what is live.
# Counting historical legacy runs would report BROKEN forever even after
# the setting is fixed, so only the newest deployment is consulted.
curl -sS "https://api.github.com/repos/$REPO/deployments?per_page=1" | python3 -c '
import json, sys
d = json.load(sys.stdin)
if not isinstance(d, list) or not d:
    print("last deploy .. none found              ?"); raise SystemExit
app = (d[0].get("performed_via_github_app") or {}).get("slug", "?")
when = d[0]["created_at"]
label = {"github-actions": ("your workflow        ", "OK"),
         "github-pages":   ("legacy branch builder", "BROKEN")}.get(app, (app, "?"))
print(f"last deploy .. {label[0]}  {label[1]:6} ({when})")
'

if curl -sS "$SITE/" | grep -q 'src="/src/main.tsx"'; then
  echo "live html .... Vite dev entry          BROKEN"
else
  echo "live html .... built entry             OK"
fi

asset=$(curl -sS "$SITE/" | grep -o './assets/[^"]*\.js' | head -1)
if [ -n "$asset" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' "$SITE/${asset#./}")
  echo "live bundle .. HTTP $code                 $([ "$code" = 200 ] && echo OK || echo BROKEN)"
else
  echo "live bundle .. no bundle referenced    BROKEN"
fi

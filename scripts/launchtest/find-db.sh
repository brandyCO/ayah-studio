#!/usr/bin/env bash
# Finds the staging database's session pooler address and writes DB=... to $GITHUB_ENV (masked).
# Says plainly what is wrong: the access token cannot see the project, the ref is wrong, or the password.
set -uo pipefail
API=https://api.supabase.com/v1/projects/$REF
code=$(curl -s -o /tmp/proj.json -w '%{http_code}' -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$API")
if [ "$code" != 200 ]; then
  echo "::error::The Supabase API answered $code for project STAGING_REF. Either STAGING_REF is not the staging project's id (Project settings → General → Project ID), or the access token cannot see it: add a secret STAGING_ACCESS_TOKEN made at supabase.com/dashboard/account/tokens while signed in to the account that owns the staging project."
  exit 1
fi
REGION=$(python3 -c "import json; print(json.load(open('/tmp/proj.json')).get('region',''))")
STATUS=$(python3 -c "import json; print(json.load(open('/tmp/proj.json')).get('status',''))")
echo "Staging project found: region $REGION, status $STATUS"
HOSTS=$(curl -sf -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$API/config/database/pooler" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); d=d if isinstance(d,list) else [d]; print(' '.join(dict.fromkeys(x['db_host'] for x in d if x.get('db_host'))))" 2>/dev/null || true)
PW=$(python3 -c "import os,urllib.parse; print(urllib.parse.quote(os.environ['STAGING_DB_PASSWORD'].strip(), safe=''))")
last=""
for h in $HOSTS aws-0-$REGION.pooler.supabase.com aws-1-$REGION.pooler.supabase.com; do
  url="postgresql://postgres.$REF:$PW@$h:5432/postgres"
  echo "::add-mask::$url"
  if out=$(psql "$url" -Xqtc 'select 1' 2>&1); then
    echo "Connected through $h"; echo "DB=$url" >> "${GITHUB_ENV:-/dev/null}"; exit 0
  fi
  last=$(echo "$out" | sed "s/$PW/***/g" | tail -1); echo "$h: $last"
done
case "$last" in
  *password*) echo "::error::The staging database refused the password. Check STAGING_DB_PASSWORD (Project settings → Database → Reset database password).";;
  *) echo "::error::Could not reach the staging database: $last";;
esac
exit 1

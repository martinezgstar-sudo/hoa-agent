#!/usr/bin/env bash
# One-off verifier for data/utilities_palm_beach.csv (v3 Phase 2).
# Archived after use; the CSV in the repo is the frozen verified snapshot.
#
# Reads:  data/utilities_palm_beach.csv
# Writes: data/utilities_palm_beach.verified.csv (temp; owner promotes over source)
# Also:   an in-place fetch report in the same directory.
#
# Rules (per owner ruling 2026-09-08):
#   - Fetch every provider_url with curl -L behind a real-browser header set
#     (bare curl gets 403'd by CivicPlus WAFs used across PBC city sites).
#   - Drop the row if the fetch is not 200.
#   - Store the effective (post-redirect) URL back in the CSV.
#   - Keep provider_phone only if the digits appear on the landing page OR
#     one click deeper on a contact / customer-service / billing / utility
#     page. Skip mailto/tel/javascript hrefs. Also try /contact-us and
#     /contact on the same host as fallback.
#   - Stamp verified_at with the fetch time (ISO-8601 UTC).

set -uo pipefail

REPO="/Users/izzymartinez/Projects/hoa-agent-v3"
CSV_IN="$REPO/data/utilities_palm_beach.csv"
CSV_OUT="$REPO/data/utilities_palm_beach.verified.csv"
REPORT="$REPO/scripts/_archived/utilities-fetch-report.txt"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

digits() { printf '%s' "$1" | tr -cd 0-9; }

find_contact_links() {
  local html="$1" base="$2"
  local scheme_host base_dir
  scheme_host=$(printf '%s' "$base" | sed -E 's|^(https?://[^/]+).*|\1|')
  base_dir=$(printf '%s' "$base" | sed -E 's|(.*/).*|\1|')
  grep -oiE 'href="[^"]+"' "$html" \
    | sed -E 's/href="([^"]+)"/\1/i' \
    | grep -iE 'contact|customer-service|customer-care|billing|utility-services' \
    | grep -viE '^(mailto:|tel:|javascript:|#)' \
    | head -6 \
    | while IFS= read -r raw; do
        case "$raw" in
          http*) echo "$raw" ;;
          //*)   echo "https:$raw" ;;
          /*)    echo "${scheme_host}${raw}" ;;
          '#'*)  ;;
          *)     echo "${base_dir}${raw}" ;;
        esac
      done
}

fetch_url() {
  local url="$1" out="$2" meta http
  for _try in 1 2; do
    meta=$(curl -sSL -o "$out" \
         -A "$UA" \
         -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' \
         -H 'Accept-Language: en-US,en;q=0.9' \
         -H 'Accept-Encoding: gzip, deflate, br' \
         -H 'Sec-Fetch-Site: none' \
         -H 'Sec-Fetch-Mode: navigate' \
         -H 'Sec-Fetch-User: ?1' \
         -H 'Sec-Fetch-Dest: document' \
         -H 'Upgrade-Insecure-Requests: 1' \
         --compressed \
         --max-time 20 \
         -w "%{http_code}|%{url_effective}" "$url" 2>/dev/null \
      | tr -d ' \n\r')
    http=${meta%%|*}
    [ "$http" != "000" ] && break
    sleep 1
  done
  printf '%s' "$meta"
}

phone_on_file() {
  local file="$1" needle="$2"
  [ -z "$needle" ] && return 1
  local bare
  bare=$(tr -cd 0-9 < "$file")
  printf '%s' "$bare" | grep -q "$needle"
}

echo "== HOA Agent v3 utilities seed verification ==" > "$REPORT"
echo "Run: $NOW_ISO"                                 >> "$REPORT"
echo                                                  >> "$REPORT"

head -1 "$CSV_IN" > "$CSV_OUT"

tail -n +2 "$CSV_IN" | while IFS= read -r line; do
  IFS=',' read -r county city zip service pname pphone purl notes verified <<<"$line"

  landing="$TMP/landing.html"
  meta=$(fetch_url "$purl" "$landing")
  http=${meta%%|*}
  final=${meta##*|}

  {
    printf '\n[%s] %s / %s\n' "$service" "$pname" "$purl"
    printf '  fetch http=%s final=%s\n' "$http" "$final"
  } >> "$REPORT"

  if [ "$http" != "200" ]; then
    printf '  DROPPED (http=%s)\n' "$http" >> "$REPORT"
    continue
  fi

  needle=$(digits "$pphone")
  phone_source=""

  if phone_on_file "$landing" "$needle"; then
    phone_source="landing"
  fi

  if [ -z "$phone_source" ]; then
    contact_html="$TMP/contact.html"
    while IFS= read -r contact_url; do
      [ -z "$contact_url" ] && continue
      c_meta=$(fetch_url "$contact_url" "$contact_html")
      c_http=${c_meta%%|*}
      printf '  contact-try: %s -> %s\n' "$contact_url" "$c_http" >> "$REPORT"
      if [ "$c_http" = "200" ] && phone_on_file "$contact_html" "$needle"; then
        phone_source="contact($contact_url)"
        break
      fi
    done < <(find_contact_links "$landing" "$final")
  fi

  if [ -z "$phone_source" ]; then
    scheme_host=$(printf '%s' "$final" | sed -E 's|^(https?://[^/]+).*|\1|')
    for path in /contact-us/ /contact/ /contact-us /contact; do
      fb="$scheme_host$path"
      c_meta=$(fetch_url "$fb" "$TMP/fb.html")
      c_http=${c_meta%%|*}
      printf '  fallback-try: %s -> %s\n' "$fb" "$c_http" >> "$REPORT"
      if [ "$c_http" = "200" ] && phone_on_file "$TMP/fb.html" "$needle"; then
        phone_source="fallback($path)"
        break
      fi
    done
  fi

  out_phone="$pphone"
  if [ -z "$phone_source" ]; then
    out_phone=""
    printf '  PHONE BLANKED (proposed %s not found on landing, contact-links, or /contact-us fallback)\n' "$pphone" >> "$REPORT"
  else
    printf '  phone ok (source=%s)\n' "$phone_source" >> "$REPORT"
  fi

  printf '%s,%s,%s,%s,%s,%s,%s,%s,%s\n' \
         "$county" "$city" "$zip" "$service" "$pname" "$out_phone" "$final" "$notes" "$NOW_ISO" \
         >> "$CSV_OUT"
done

total=$(( $(wc -l < "$CSV_OUT") - 1 ))
input_total=$(( $(wc -l < "$CSV_IN") - 1 ))
{
  printf '\n== Summary ==\n'
  printf 'rows in input        : %s\n' "$input_total"
  printf 'rows kept (200 OK)   : %s\n' "$total"
  printf 'rows dropped         : %s\n' "$(( input_total - total ))"
  printf '\nPer-service breakdown of kept rows:\n'
  tail -n +2 "$CSV_OUT" | awk -F, '{print "  " $4}' | sort | uniq -c | awk '{printf "    %-8s = %s\n", $2, $1}'
  printf '\nRows with BLANK phone in the verified CSV:\n'
  awk -F, 'NR>1 && $6=="" {printf "  %-8s / %-20s / %-40s -> %s\n", $4, ($2 == "" ? "(county)" : $2), $5, $7}' "$CSV_OUT" || true
} >> "$REPORT"

cat "$REPORT"

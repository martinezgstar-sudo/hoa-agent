#!/usr/bin/env python3
"""
research-10-news.py
Search Google News + DDG for each community, AI-score with Claude,
insert relevant articles + recompute reputation score.
"""
import json, os, re, sys, time, urllib.parse, urllib.request, warnings
import requests
warnings.filterwarnings("ignore")
from dotenv import load_dotenv
load_dotenv(".env.local", override=True)

try:
    import anthropic
except ImportError:
    print("anthropic not installed"); sys.exit(1)

try:
    import feedparser
except ImportError:
    feedparser = None

URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
     "Content-Type": "application/json", "Prefer": "return=minimal"}
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

CLIENT = anthropic.Anthropic()


def fetch(url, timeout=12):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="ignore")
    except Exception:
        return ""


def google_news_rss(q):
    feed_url = f"https://news.google.com/rss/search?q={urllib.parse.quote_plus(q)}&hl=en-US&gl=US&ceid=US:en"
    if feedparser:
        body = fetch(feed_url)
        if not body: return []
        parsed = feedparser.parse(body)
        out = []
        for e in parsed.entries[:8]:
            out.append({
                "title": (e.get("title") or "")[:300],
                "url": (e.get("link") or "").strip(),
                "summary": (e.get("summary") or "")[:500],
                "published": (e.get("published") or e.get("updated") or "").strip(),
                "source": "google_news",
            })
        return out
    return []


def ddg_search(q, max_results=4):
    qenc = urllib.parse.quote_plus(q)
    html = fetch(f"https://html.duckduckgo.com/html/?q={qenc}")
    if not html: return []
    out = []
    for m in re.finditer(r'<a\s+class="result__a"\s+href="(/l/\?[^"]+)"[^>]*>([\s\S]*?)</a>', html):
        if len(out) >= max_results: break
        href, title = m.group(1), m.group(2)
        rm = re.search(r"uddg=(https?[^&]+)", href)
        url = urllib.parse.unquote(rm.group(1)) if rm else ""
        title_clean = re.sub(r"<[^>]+>", "", title).strip()
        idx = html.find(href)
        snip_m = re.search(r'class="result__snippet"[^>]*>([\s\S]*?)</a>', html[idx:idx+3000])
        snip = re.sub(r"<[^>]+>", "", snip_m.group(1)).strip() if snip_m else ""
        out.append({"title": title_clean, "url": url, "summary": snip, "source": "duckduckgo"})
    return out


def score_article(article, name, city):
    user = (
        f'Is this news article about "{name}" HOA in {city}, Florida?\n\n'
        f'Title: {article["title"][:200]}\n'
        f'Summary: {article.get("summary", "")[:300]}\n\n'
        'Score relevance 1-10. Indicate sentiment.\n\n'
        'Return JSON only:\n'
        '{"relevant": true|false, "score": 1-10, "sentiment": "positive"|"negative"|"neutral", "summary": "one sentence"}'
    )
    try:
        resp = CLIENT.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=150,
            system="You evaluate whether a news article is specifically about a named Florida HOA community. Return JSON only.",
            messages=[{"role": "user", "content": user}],
        )
        text = resp.content[0].text if resp.content else ""
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE)
        return json.loads(text)
    except Exception as e:
        return {"relevant": False, "score": 0, "sentiment": "neutral", "summary": f"err: {e}"}


def url_in_db(url):
    qn = urllib.parse.quote(url, safe="")
    r = requests.get(f"{URL}/rest/v1/news_items?select=id&url=eq.{qn}", headers=H)
    return r.status_code == 200 and len(r.json()) > 0


def insert_article(art, eval_):
    payload = {
        "title": art["title"][:500],
        "url": art["url"],
        "source": art.get("source", "wide_search")[:120],
        "published_date": art.get("published") or None,
        "ai_summary": eval_.get("summary", "")[:1000],
        "status": "approved",
        "admin_notes": f"research-10-news; sentiment={eval_.get('sentiment')}; score={eval_.get('score')}"[:500],
    }
    r = requests.post(f"{URL}/rest/v1/news_items", headers={**H, "Prefer": "return=representation"}, json=payload)
    if r.status_code in (200, 201):
        body = r.json()
        return body[0]["id"] if body else None
    return None


def link_community(community_id, news_id, sentiment, score):
    r = requests.post(f"{URL}/rest/v1/community_news",
                      headers=H,
                      json={
                          "community_id": community_id,
                          "news_item_id": news_id,
                          "match_confidence": min(1.0, score / 10.0),
                          "match_reason": f"AI matched ({sentiment}, score {score})",
                          "status": "approved",
                      })
    return r.status_code in (200, 201, 204)


def reputation_score(positive, negative, neutral):
    """Convert sentiment counts into 1-10 score."""
    total = positive + negative + neutral
    if total == 0: return None, None
    if negative >= 3 and positive == 0:
        return 2, "High Risk"
    if negative >= 2 and positive < negative:
        return 3, "High Risk"
    if negative >= 1 and positive < negative:
        return 5, "Under Scrutiny"
    if positive >= 1 and negative == 0 and total <= 2:
        return 7, "Mixed"
    if positive >= 3 and negative == 0:
        return 9, "Good Standing"
    if positive >= 1 and positive >= negative:
        return 7, "Mixed"
    return 5, "Under Scrutiny"


def main():
    targets = json.load(open("scripts/output/research-targets-10.json"))
    print(f"News research for {len(targets)} communities\n")

    all_results = []
    total_inserted = 0
    total_relevant = 0

    for c in targets:
        name = c["canonical_name"]
        city = c.get("city") or ""
        print(f"=== {name} ({city})")
        articles = []
        # 5 search sources
        articles.extend(google_news_rss(f'"{name}" Florida HOA'))
        articles.extend(ddg_search(f'"{name}" HOA news {city} Florida'))
        articles.extend(ddg_search(f'"{name}" HOA lawsuit OR dispute OR assessment OR complaint'))
        articles.extend(ddg_search(f'"{name}" site:palmbeachpost.com'))
        articles.extend(ddg_search(f'"{name}" site:sun-sentinel.com'))
        time.sleep(0.5)

        # Dedupe by URL
        seen = set()
        unique = []
        for a in articles:
            if a["url"] and a["url"] not in seen:
                seen.add(a["url"])
                unique.append(a)
        print(f"   Found {len(unique)} unique articles")

        # Score each
        relevant = 0
        new_inserted = 0
        sentiments = {"positive": 0, "negative": 0, "neutral": 0}
        for art in unique[:15]:  # cap at 15 to control cost/time
            if not art["title"] or not art["url"]: continue
            ev = score_article(art, name, city)
            if ev.get("relevant") and ev.get("score", 0) >= 6:
                relevant += 1
                sent = ev.get("sentiment", "neutral")
                sentiments[sent] = sentiments.get(sent, 0) + 1
                if not url_in_db(art["url"]):
                    new_id = insert_article(art, ev)
                    if new_id:
                        new_inserted += 1
                        link_community(c["id"], new_id, sent, ev["score"])
                        print(f'   + inserted [{sent}] "{art["title"][:60]}"')
            time.sleep(0.3)

        # Reputation score from sentiments
        rep_score, rep_label = reputation_score(sentiments["positive"], sentiments["negative"], sentiments["neutral"])
        if rep_score is not None:
            r = requests.patch(
                f"{URL}/rest/v1/communities?id=eq.{c['id']}&status=eq.published",
                headers=H,
                json={"news_reputation_score": rep_score, "news_reputation_label": rep_label, "news_reputation_updated_at": "now()"},
            )
            print(f"   Reputation: {rep_score}/10 ({rep_label}) — sentiments {sentiments}")

        all_results.append({
            "id": c["id"], "canonical_name": name,
            "articles_found": len(unique), "relevant": relevant,
            "new_inserted": new_inserted, "sentiments": sentiments,
            "reputation_score": rep_score, "reputation_label": rep_label,
        })
        total_inserted += new_inserted
        total_relevant += relevant
        print()

    with open("scripts/output/research-10-news-result.json", "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"=== TOTALS ===")
    print(f"  Relevant articles found: {total_relevant}")
    print(f"  New articles inserted:   {total_inserted}")


if __name__ == "__main__":
    main()

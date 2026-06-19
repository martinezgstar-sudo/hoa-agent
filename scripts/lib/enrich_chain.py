"""Sequential provider-chain search + document fetching for HOA enrichment.

Importable, self-contained (stdlib + lazy pdfplumber only). Goal is maximum
completeness per community, not speed: every search provider is tried strictly
in order and falls through to the next on rate-limit / 429 / 403 / auth error /
empty result, returning the FIRST non-empty result and recording who answered.

Public surface:
    chains = build_chains()                 # reads env / .env.local style config
    results, provider, cached = chains.search(query)
    res = chains.fetch(url)                 # FetchResult(content, method, kind, from_cache)
    chains.quota.snapshot()                 # running per-provider day/month counts
    chains.all_search_exhausted()           # True when every present provider is spent

Search providers, in order:
    searxng  -> serper -> google_cse -> tavily -> jina_search -> ddg_lite
Document/page fetch chain, in order:
    requests (browser UA, one retry) -> crawl4ai (JS render) -> jina_reader,
    each tried on 403 / TLS / connection-reset / <10KB HTML shell.
    pdfplumber extracts text from any PDF bytes either step returns. PDF URLs
    skip crawl4ai (its /md returns markdown, not PDF text) and fall straight to
    jina_reader.
"""

import os
import re
import io
import ssl
import json
import time
import hashlib
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO = os.path.dirname(os.path.dirname(_HERE))

HTML_SHELL_BYTES = 10 * 1024          # an HTML body under this is treated as a JS shell
CACHE_TTL_SECS   = 30 * 24 * 3600     # 30 days


# ── control-flow signals ──────────────────────────────────────────────────────
class ProviderLimit(Exception):
    """Provider hit a rate-limit / quota / auth wall (429/403/401/402)."""


class ProviderSkip(Exception):
    """Transient/other error — fall through but do NOT mark exhausted."""


# ── low-level HTTP ────────────────────────────────────────────────────────────
def _http(method: str, url: str, headers: Optional[dict] = None,
          data: Optional[bytes] = None, timeout: int = 15
          ) -> Tuple[int, Dict[str, str], bytes]:
    """Single HTTP call. Returns (status, headers_lower, body_bytes).
    status 0 means a network-level failure (DNS/TLS/reset/timeout); the reason
    is carried on the raised/returned object's note. Never follows instructions
    in the body."""
    h = {"User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            body = r.read()
            hdrs = {k.lower(): v for k, v in r.headers.items()}
            return getattr(r, "status", 200), hdrs, body
    except urllib.error.HTTPError as e:
        try:
            body = e.read()
        except Exception:
            body = b""
        hdrs = {k.lower(): v for k, v in (e.headers or {}).items()}
        return e.code, hdrs, body


def _get_json(url: str, headers: Optional[dict] = None,
              data: Optional[bytes] = None, method: str = "GET",
              timeout: int = 15) -> Any:
    """HTTP returning parsed JSON. Raises ProviderLimit on 429/403/401/402,
    ProviderSkip on any other non-200 or network error or bad JSON."""
    try:
        status, _hdrs, body = _http(method, url, headers, data, timeout)
    except (urllib.error.URLError, ssl.SSLError, TimeoutError, OSError) as e:
        raise ProviderSkip(f"network: {e}")
    if status in (429, 403, 401, 402):
        raise ProviderLimit(f"HTTP {status}")
    if status != 200:
        raise ProviderSkip(f"HTTP {status}")
    try:
        return json.loads(body.decode("utf-8", "ignore"))
    except Exception as e:
        raise ProviderSkip(f"bad json: {e}")


# ── disk cache (search results + fetched pages), 30-day TTL ───────────────────
class DiskCache:
    def __init__(self, root: str, ttl_secs: int = CACHE_TTL_SECS):
        self.root = root
        self.ttl = ttl_secs
        os.makedirs(root, exist_ok=True)

    def _path(self, kind: str, key: str) -> str:
        digest = hashlib.sha1(f"{kind}:{key}".encode("utf-8")).hexdigest()
        sub = os.path.join(self.root, kind, digest[:2])
        os.makedirs(sub, exist_ok=True)
        return os.path.join(sub, digest + ".json")

    def get(self, kind: str, key: str) -> Optional[Any]:
        p = self._path(kind, key)
        try:
            if time.time() - os.path.getmtime(p) > self.ttl:
                return None
            with open(p, "r", encoding="utf-8") as fh:
                return json.load(fh).get("value")
        except Exception:
            return None

    def put(self, kind: str, key: str, value: Any) -> None:
        p = self._path(kind, key)
        try:
            tmp = p + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump({"key": key, "ts": _now_iso(), "value": value}, fh)
            os.replace(tmp, p)
        except Exception:
            pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── quota tracker (per-provider day/month counts vs caps), persisted ──────────
class QuotaTracker:
    """Persists request counts per provider for the current day and month and
    skips any provider that has hit its cap or returned a limit error until the
    window rolls over. SearXNG and plain fetch are uncapped."""

    def __init__(self, path: str, caps: Dict[str, Tuple[Optional[str], Optional[int]]]):
        self.path = path
        self.caps = caps                       # provider -> (window 'day'|'month'|None, cap|None)
        self._runtime_exhausted: set = set()   # limit errors this process
        self.state = {"day": _today(), "month": _month(), "counts": {}}
        self._load()
        self._rollover()

    def _load(self) -> None:
        try:
            with open(self.path, "r", encoding="utf-8") as fh:
                self.state = json.load(fh)
        except Exception:
            pass
        self.state.setdefault("counts", {})

    def _save(self) -> None:
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(self.state, fh, indent=2)
            os.replace(tmp, self.path)
        except Exception:
            pass

    def _rollover(self) -> None:
        changed = False
        if self.state.get("day") != _today():
            self.state["day"] = _today()
            for c in self.state["counts"].values():
                c["day"] = 0
            changed = True
        if self.state.get("month") != _month():
            self.state["month"] = _month()
            for c in self.state["counts"].values():
                c["month"] = 0
            changed = True
        if changed:
            self._save()

    def _bucket(self, provider: str) -> Dict[str, int]:
        return self.state["counts"].setdefault(provider, {"day": 0, "month": 0})

    def allowed(self, provider: str) -> bool:
        self._rollover()
        if provider in self._runtime_exhausted:
            return False
        window, cap = self.caps.get(provider, (None, None))
        if cap is None or window is None:
            return True
        return self._bucket(provider).get(window, 0) < cap

    def record(self, provider: str) -> None:
        self._rollover()
        b = self._bucket(provider)
        b["day"] += 1
        b["month"] += 1
        self._save()

    def exhaust(self, provider: str) -> None:
        """Mark spent for the rest of the window (persisted) + this process."""
        self._runtime_exhausted.add(provider)
        window, cap = self.caps.get(provider, (None, None))
        if cap is not None and window is not None:
            self._bucket(provider)[window] = cap
            self._save()

    def snapshot(self, providers: Optional[List[str]] = None) -> Dict[str, Dict[str, Any]]:
        out = {}
        names = providers if providers is not None else list(self.caps.keys())
        for p in names:
            window, cap = self.caps.get(p, (None, None))
            b = self._bucket(p)
            out[p] = {
                "day": b["day"], "month": b["month"],
                "cap": cap, "window": window,
                "exhausted": not self.allowed(p),
            }
        return out


def _today() -> str:
    return date.today().isoformat()


def _month() -> str:
    return date.today().strftime("%Y-%m")


# ── search providers ──────────────────────────────────────────────────────────
# Each returns a list of (url, title, snippet). Raises ProviderLimit on a wall,
# ProviderSkip on a transient error, or returns [] when there is simply nothing.
def _norm(items: List[Tuple[str, str, str]]) -> List[Tuple[str, str, str]]:
    out, seen = [], set()
    for url, title, snip in items:
        if not url or not url.lower().startswith("http") or url in seen:
            continue
        seen.add(url)
        out.append((url, (title or "").strip(), (snip or "").strip()))
    return out


def p_searxng(query: str, cfg: dict) -> List[Tuple[str, str, str]]:
    base = cfg["searxng_url"].rstrip("/")
    url = f"{base}/search?" + urllib.parse.urlencode({"q": query, "format": "json"})
    data = _get_json(url, timeout=20)
    return _norm([(r.get("url", ""), r.get("title", ""), r.get("content", ""))
                  for r in (data.get("results") or [])])


def p_serper(query: str, cfg: dict) -> List[Tuple[str, str, str]]:
    body = json.dumps({"q": query, "num": 10}).encode()
    data = _get_json("https://google.serper.dev/search", method="POST", data=body,
                     headers={"X-API-KEY": cfg["serper_key"],
                              "Content-Type": "application/json"})
    return _norm([(r.get("link", ""), r.get("title", ""), r.get("snippet", ""))
                  for r in (data.get("organic") or [])])


def p_google_cse(query: str, cfg: dict) -> List[Tuple[str, str, str]]:
    url = "https://www.googleapis.com/customsearch/v1?" + urllib.parse.urlencode(
        {"key": cfg["cse_key"], "cx": cfg["cse_cx"], "q": query, "num": 10})
    data = _get_json(url)
    return _norm([(r.get("link", ""), r.get("title", ""), r.get("snippet", ""))
                  for r in (data.get("items") or [])])


def p_tavily(query: str, cfg: dict) -> List[Tuple[str, str, str]]:
    body = json.dumps({"api_key": cfg["tavily_key"], "query": query,
                       "max_results": 10}).encode()
    data = _get_json("https://api.tavily.com/search", method="POST", data=body,
                     headers={"Content-Type": "application/json"})
    return _norm([(r.get("url", ""), r.get("title", ""), r.get("content", ""))
                  for r in (data.get("results") or [])])


def p_jina_search(query: str, cfg: dict) -> List[Tuple[str, str, str]]:
    url = "https://s.jina.ai/" + urllib.parse.quote(query)
    headers = {"Accept": "application/json"}
    if cfg.get("jina_key"):
        headers["Authorization"] = f"Bearer {cfg['jina_key']}"
    data = _get_json(url, headers=headers, timeout=30)
    rows = data.get("data") if isinstance(data, dict) else data
    out = []
    for r in (rows or []):
        if isinstance(r, dict):
            out.append((r.get("url", ""), r.get("title", ""),
                        r.get("content") or r.get("description", "")))
    return _norm(out)


def p_ddg_lite(query: str, cfg: dict) -> List[Tuple[str, str, str]]:
    url = "https://lite.duckduckgo.com/lite/?" + urllib.parse.urlencode({"q": query})
    try:
        status, _h, body = _http("GET", url, timeout=15)
    except (urllib.error.URLError, ssl.SSLError, TimeoutError, OSError) as e:
        raise ProviderSkip(f"network: {e}")
    if status in (429, 403, 401):
        raise ProviderLimit(f"HTTP {status}")
    if status != 200:
        raise ProviderSkip(f"HTTP {status}")
    html = body.decode("utf-8", "ignore")
    out = []
    for href, title in re.findall(
            r'<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
            html, re.DOTALL | re.IGNORECASE):
        out.append((href, re.sub(r"<[^>]+>", "", title), ""))
    if not out:  # fallback: any external anchor
        for href in re.findall(r'href="(https?://[^"]+)"', html):
            if "duckduckgo" not in href:
                out.append((href, "", ""))
    return _norm(out)


SEARCH_ORDER = [
    ("searxng",     p_searxng),
    ("serper",      p_serper),
    ("google_cse",  p_google_cse),
    ("tavily",      p_tavily),
    ("jina_search", p_jina_search),
    ("ddg_lite",    p_ddg_lite),
]


# ── document / page fetch result ──────────────────────────────────────────────
class FetchResult:
    __slots__ = ("content", "method", "kind", "from_cache")

    def __init__(self, content: Optional[str], method: Optional[str],
                 kind: Optional[str], from_cache: bool = False):
        self.content = content          # html, markdown text, or extracted PDF text
        self.method = method            # "requests" | "jina-reader" | "cache" | None
        self.kind = kind                # "html" | "text" | "pdf_text" | None
        self.from_cache = from_cache

    @property
    def ok(self) -> bool:
        return bool(self.content)


_pdfplumber = None


def _ensure_pdfplumber():
    global _pdfplumber
    if _pdfplumber is not None:
        return _pdfplumber
    try:
        import pdfplumber  # noqa
        _pdfplumber = pdfplumber
    except Exception:
        _pdfplumber = False
    return _pdfplumber


def pdf_text_from_bytes(data: bytes, char_cap: int = 8000) -> str:
    pp = _ensure_pdfplumber()
    if not pp:
        return ""
    out, total, path = [], 0, None
    try:
        fd, path = tempfile.mkstemp(suffix=".pdf")
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        with pp.open(path) as pdf:
            for page in pdf.pages:
                txt = page.extract_text() or ""
                if txt:
                    out.append(txt)
                    total += len(txt)
                    if total >= char_cap:
                        break
    except Exception:
        return ""
    finally:
        if path:
            try:
                os.remove(path)
            except Exception:
                pass
    return re.sub(r"\s+", " ", " ".join(out)).strip()[:char_cap]


# ── chains ────────────────────────────────────────────────────────────────────
class Chains:
    def __init__(self, cfg: dict, quota: QuotaTracker, cache: DiskCache):
        self.cfg = cfg
        self.quota = quota
        self.cache = cache
        self.search_providers = [(n, fn) for n, fn in SEARCH_ORDER if cfg["present"].get(n)]

    # -- search chain --
    def present_search_names(self) -> List[str]:
        return [n for n, _ in self.search_providers]

    def all_search_exhausted(self) -> bool:
        return all(not self.quota.allowed(n) for n, _ in self.search_providers) \
            if self.search_providers else True

    def search(self, query: str) -> Tuple[List[Tuple[str, str, str]], Optional[str], bool]:
        """Returns (results, provider_name, from_cache). First non-empty wins."""
        cached = self.cache.get("search", query)
        if cached and cached.get("results"):
            return ([tuple(r) for r in cached["results"]], cached.get("provider"), True)
        for name, fn in self.search_providers:
            if not self.quota.allowed(name):
                continue
            try:
                results = fn(query, self.cfg)
            except ProviderLimit:
                self.quota.exhaust(name)
                continue
            except ProviderSkip:
                continue
            except Exception:
                continue
            self.quota.record(name)
            if results:
                self.cache.put("search", query,
                               {"provider": name, "results": [list(r) for r in results]})
                return results, name, False
        return [], None, False

    # -- fetch chain --
    def fetch(self, url: str, bm25_query: Optional[str] = None) -> FetchResult:
        """Fetch a page/PDF. When bm25_query is set and the crawl4ai tier is
        used, crawl4ai applies its built-in BM25 content filter server-side and
        returns only the relevant markdown. Cached by url (bm25 variants are
        cached under a distinct key so filtered/unfiltered never collide)."""
        cache_key = url if not bm25_query else url + "\x00bm25"
        cached = self.cache.get("page", cache_key)
        if cached and cached.get("content"):
            return FetchResult(cached["content"], cached.get("method"),
                               cached.get("kind"), from_cache=True)
        res = self._fetch_live(url, bm25_query)
        if res.ok:
            self.cache.put("page", cache_key, {"content": res.content,
                                               "method": res.method, "kind": res.kind})
        return res

    def _fetch_live(self, url: str, bm25_query: Optional[str] = None) -> FetchResult:
        looks_pdf = url.lower().split("?")[0].endswith(".pdf")
        plain_failed_reason = None
        # 1) plain requests, one retry
        for attempt in range(2):
            try:
                status, hdrs, body = _http("GET", url, timeout=15)
            except (urllib.error.URLError, ssl.SSLError, TimeoutError, OSError) as e:
                plain_failed_reason = f"network:{e}"
                continue  # retry / then fall to jina
            if status == 200:
                ct = (hdrs.get("content-type") or "").lower()
                is_pdf = "pdf" in ct or body[:5] == b"%PDF" or (looks_pdf and not ct.startswith("text/html"))
                if is_pdf:
                    text = pdf_text_from_bytes(body)
                    if text:
                        return FetchResult(text, "requests", "pdf_text")
                    plain_failed_reason = "pdf-unreadable"
                    break
                html = body.decode("utf-8", "ignore")
                if len(html) >= HTML_SHELL_BYTES:
                    return FetchResult(html, "requests", "html")
                plain_failed_reason = "html-shell"
                break
            if status == 403:
                plain_failed_reason = "http-403"
                break
            # 404/500/etc — do not escalate to fallbacks
            return FetchResult(None, None, None)
        # 2) Fallbacks for 403 / TLS / reset / <10KB shell / unreadable-pdf, in
        #    order: crawl4ai (JS render) -> jina_reader. PDFs skip crawl4ai
        #    because its /md endpoint returns markdown, not extracted PDF text.
        if not looks_pdf:
            res = self._crawl4ai(url, bm25_query)
            if res.ok:
                return res
        return self._jina_reader(url, looks_pdf)

    def _crawl4ai(self, url: str, bm25_query: Optional[str] = None) -> FetchResult:
        """JS-rendering fetch via a local crawl4ai server's /md endpoint.
        Returns the rendered markdown as page text (method='crawl4ai'). Any
        unreachability / non-200 / empty body returns an empty result so the
        caller falls through to jina_reader."""
        if not self.cfg["present"].get("crawl4ai"):
            return FetchResult(None, None, None)
        base = (self.cfg.get("crawl4ai_url") or "").rstrip("/")
        if not base:
            return FetchResult(None, None, None)
        headers = {"Content-Type": "application/json"}
        if self.cfg.get("crawl4ai_token"):
            headers["Authorization"] = f"Bearer {self.cfg['crawl4ai_token']}"
        payload = {"url": url}
        if bm25_query:
            # crawl4ai's built-in BM25 content filter: keep only markdown
            # relevant to the query terms, server-side.
            payload["f"] = "bm25"
            payload["q"] = bm25_query
        body = json.dumps(payload).encode()
        try:
            status, _h, resp = _http("POST", base + "/md", headers=headers,
                                     data=body, timeout=40)
        except (urllib.error.URLError, ssl.SSLError, TimeoutError, OSError):
            return FetchResult(None, None, None)
        if status != 200 or not resp:
            return FetchResult(None, None, None)
        try:
            data = json.loads(resp.decode("utf-8", "ignore"))
        except Exception:
            return FetchResult(None, None, None)
        md = (data.get("markdown") if isinstance(data, dict) else None) or ""
        if not isinstance(md, str) or not md.strip():
            return FetchResult(None, None, None)
        return FetchResult(md, "crawl4ai", "text")

    def _jina_reader(self, url: str, looks_pdf: bool) -> FetchResult:
        if not self.cfg["present"].get("jina_reader"):
            return FetchResult(None, None, None)
        headers = {"Accept": "text/plain"}
        if self.cfg.get("jina_key"):
            headers["Authorization"] = f"Bearer {self.cfg['jina_key']}"
        try:
            status, _h, body = _http("GET", "https://r.jina.ai/" + url,
                                     headers=headers, timeout=30)
        except (urllib.error.URLError, ssl.SSLError, TimeoutError, OSError):
            return FetchResult(None, None, None)
        if status != 200 or not body:
            return FetchResult(None, None, None)
        text = body.decode("utf-8", "ignore")
        return FetchResult(text, "jina-reader", "pdf_text" if looks_pdf else "text")


# ── config / factory ──────────────────────────────────────────────────────────
def _present(env: Dict[str, str]) -> Dict[str, bool]:
    return {
        "searxng":     bool(env.get("SEARXNG_URL", "http://localhost:8888")),
        "serper":      bool(env.get("SERPER_API_KEY")),
        "google_cse":  bool(env.get("GOOGLE_CSE_KEY") and env.get("GOOGLE_CSE_CX")),
        "tavily":      bool(env.get("TAVILY_API_KEY")),
        "jina_search": True,                       # works keyless (rate-limited)
        "ddg_lite":    True,
        "crawl4ai":    bool(env.get("CRAWL4AI_API_TOKEN")),  # local JS-render tier
        "jina_reader": True,                       # works keyless (rate-limited)
    }


def build_chains(env: Optional[Dict[str, str]] = None,
                 state_dir: Optional[str] = None) -> Chains:
    env = dict(env if env is not None else os.environ)
    state_dir = state_dir or env.get("ENRICH_STATE_DIR") or os.path.join(_REPO, ".enrich_state")
    cfg = {
        "searxng_url": env.get("SEARXNG_URL", "http://localhost:8888"),
        "serper_key":  env.get("SERPER_API_KEY", ""),
        "cse_key":     env.get("GOOGLE_CSE_KEY", ""),
        "cse_cx":      env.get("GOOGLE_CSE_CX", ""),
        "tavily_key":  env.get("TAVILY_API_KEY", ""),
        "jina_key":    env.get("JINA_API_KEY", ""),
        "crawl4ai_url":   env.get("CRAWL4AI_URL", "http://localhost:11235"),
        "crawl4ai_token": env.get("CRAWL4AI_API_TOKEN", ""),
        "present":     _present(env),
    }
    caps = {
        "searxng":     (None, None),
        "serper":      ("month", int(env.get("SERPER_MONTHLY_CAP", "2500"))),
        "google_cse":  ("day",   int(env.get("GOOGLE_CSE_DAILY_CAP", "100"))),
        "tavily":      ("month", int(env.get("TAVILY_MONTHLY_CAP", "1000"))),
        "jina_search": (None, None),
        "ddg_lite":    (None, None),
        "requests":    (None, None),
        "crawl4ai":    (None, None),
        "jina_reader": (None, None),
    }
    quota = QuotaTracker(os.path.join(state_dir, "quota.json"), caps)
    cache = DiskCache(os.path.join(state_dir, "cache"))
    return Chains(cfg, quota, cache)

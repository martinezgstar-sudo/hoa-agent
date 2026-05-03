/**
 * IndexNow protocol helper.
 *
 * Notifies Bing (and via Bing, ChatGPT search and Copilot) that URLs
 * have been added or updated. Yandex also supports it.
 *
 * Requires:
 *   - INDEXNOW_KEY env var (32-hex string)
 *   - public/<INDEXNOW_KEY>.txt file containing just the key (verification)
 *
 * Free, no API key signup needed beyond the verification file.
 */

const HOST = "www.hoa-agent.com"

export async function submitToIndexNow(urls: string[]): Promise<{ ok: boolean; submitted: number; error?: string }> {
  const key = process.env.INDEXNOW_KEY
  if (!key) return { ok: false, submitted: 0, error: "INDEXNOW_KEY not set" }
  if (!urls || urls.length === 0) return { ok: true, submitted: 0 }

  // IndexNow allows up to 10,000 URLs per request
  const batch = urls.slice(0, 10000)

  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: HOST,
        key,
        keyLocation: `https://${HOST}/${key}.txt`,
        urlList: batch,
      }),
    })
    return { ok: res.ok, submitted: batch.length, error: res.ok ? undefined : `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, submitted: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Submit a single URL — convenience wrapper. */
export async function submitOneToIndexNow(url: string): Promise<{ ok: boolean; error?: string }> {
  const r = await submitToIndexNow([url])
  return { ok: r.ok, error: r.error }
}

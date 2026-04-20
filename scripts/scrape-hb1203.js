import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const sb = createClient(
  'https://uacgzbojhjelzirvbphg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhY2d6Ym9qaGplbHppcnZicGhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMDM5NjEsImV4cCI6MjA5MDU3OTk2MX0.3_YOl9ZJO84ZZTfPJogsWzKQZ-7QyW9ExfNDDDFmyQw'
)

const FEE_PATTERNS = [
  /\$(\d{1,3}(?:,\d{3})?)\s*(?:\/|per)\s*mo/gi,
  /monthly\s+(?:fee|dues|assessment)[:\s]+\$\s*(\d{1,3}(?:,\d{3})?)/gi,
  /\$\s*(\d{1,3}(?:,\d{3})?)\s*per\s+month/gi,
  /annual\s+(?:fee|dues|assessment)[:\s]+\$\s*(\d{1,3}(?:,\d{3})?)/gi,
  /quarterly\s+(?:fee|dues|assessment)[:\s]+\$\s*(\d{1,3}(?:,\d{3})?)/gi,
]

const DOC_KEYWORDS = ['document', 'budget', 'financial', 'minutes', 'form', 'annual', 'report']
const AMENITY_KEYWORDS = ['pool','tennis','golf','gym','fitness','clubhouse','playground','gated','marina','boat','pickleball','basketball']

function extractFees(text) {
  const fees = []
  for (const pattern of FEE_PATTERNS) {
    const matches = [...text.matchAll(pattern)]
    for (const m of matches) {
      let amount = parseFloat(m[1].replace(',', ''))
      // Convert annual to monthly
      if (pattern.source.includes('annual')) amount = Math.round(amount / 12)
      // Convert quarterly to monthly
      if (pattern.source.includes('quarterly')) amount = Math.round(amount / 3)
      if (amount > 50 && amount < 5000) fees.push(amount)
    }
  }
  return fees
}

async function scrapeUrl(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)
    const text = await page.evaluate(() => document.body.innerText)
    const pdfs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href*=".pdf"]'))
        .map(l => ({ text: l.textContent.trim(), href: l.href }))
    )
    const docLinks = await page.evaluate((keywords) =>
      Array.from(document.querySelectorAll('a'))
        .filter(l => keywords.some(k => l.textContent.toLowerCase().includes(k) || l.href.toLowerCase().includes(k)))
        .map(l => ({ text: l.textContent.trim(), href: l.href }))
        .filter(l => l.href.startsWith('http'))
        .slice(0, 10)
    , DOC_KEYWORDS)
    return { text, pdfs, docLinks }
  } catch(e) {
    return { text: '', pdfs: [], docLinks: [] }
  }
}

async function scrapeCommunity(slug, name, url) {
  console.log('\nScraping: ' + name)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' })

  const result = { slug, canonical_name: name, website_url: url, documents_found: [], all_fees: [] }

  try {
    // Scrape homepage
    const home = await scrapeUrl(page, url)
    result.raw_text = home.text.substring(0, 3000)
    result.documents_found.push(...home.pdfs.slice(0, 5).map(p => p.text + ': ' + p.href))

    let fees = extractFees(home.text)
    result.all_fees.push(...fees)

    // Find and follow document/financial subpages
    const subpages = home.docLinks.filter(l => !l.href.includes('.pdf'))
    console.log('  Subpages to check: ' + subpages.length)

    for (const sub of subpages.slice(0, 4)) {
      console.log('  Checking: ' + sub.href)
      await new Promise(r => setTimeout(r, 1500))
      const subData = await scrapeUrl(page, sub.href)
      const subFees = extractFees(subData.text)
      result.all_fees.push(...subFees)
      result.documents_found.push(...subData.pdfs.slice(0, 5).map(p => p.text + ': ' + p.href))
      if (subData.pdfs.length > 0) {
        console.log('  PDFs on subpage: ' + subData.pdfs.length)
        subData.pdfs.slice(0, 3).forEach(p => console.log('    - ' + p.text.substring(0, 60) + ': ' + p.href.substring(0, 80)))
      }
    }

    // Set fee range
    if (result.all_fees.length > 0) {
      result.monthly_fee_min = Math.min(...result.all_fees)
      result.monthly_fee_max = Math.max(...result.all_fees)
      console.log('  Fees found: $' + result.monthly_fee_min + ' - $' + result.monthly_fee_max)
    }

    // Amenities
    const fullText = result.raw_text + ' ' + result.documents_found.join(' ')
    const found = AMENITY_KEYWORDS.filter(a => fullText.toLowerCase().includes(a))
    if (found.length > 0) {
      result.amenities = found.map(a => a[0].toUpperCase() + a.slice(1)).join('|')
      console.log('  Amenities: ' + result.amenities)
    }

    console.log('  Total PDFs found: ' + result.documents_found.length)

  } catch(err) {
    console.log('  Error: ' + err.message)
  } finally {
    await browser.close()
  }
  return result
}

async function main() {
  const { data: communities } = await sb.from('communities').select('slug,canonical_name,website_url').eq('status','published').not('website_url','is',null)
  console.log('Communities to scrape: ' + communities.length)
  const results = []

  for (const c of communities) {
    const result = await scrapeCommunity(c.slug, c.canonical_name, c.website_url)
    results.push(result)

    const updates = {}
    if (result.monthly_fee_min) {
      updates.monthly_fee_min = result.monthly_fee_min
      updates.monthly_fee_max = result.monthly_fee_max
      updates.confidence_score = 4
    }
    if (result.amenities) updates.amenities = result.amenities
    if (Object.keys(updates).length > 0) {
      await sb.from('communities').update(updates).eq('slug', result.slug)
      console.log('  DB updated: ' + Object.keys(updates).join(', '))
    }
    await new Promise(r => setTimeout(r, 3000))
  }

  writeFileSync('./scripts/scrape-results.json', JSON.stringify(results, null, 2))
  console.log('\nDone. Results saved to scripts/scrape-results.json')
}

main().catch(console.error)

export type AliExpressPageData = {
  html: string;
  state: any;
  product: any;
  skuRows: any[];
  propertyRows: any[];
};

function extractAssignedJson(html: string, marker: RegExp): any[] {
  const results: any[] = [];
  for (const match of html.matchAll(marker)) {
    const start = (match.index ?? 0) + match[0].length;
    let depth = 0, quoted = false, escaped = false, end = -1;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') quoted = false;
        continue;
      }
      if (ch === '"') quoted = true;
      else if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    if (end > start) {
      try { results.push(JSON.parse(html.slice(start, end))); } catch {}
    }
  }
  return results;
}

function walk(value: any, visit: (item: any) => void, seen = new Set<any>()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  visit(value);
  if (Array.isArray(value)) value.forEach(v => walk(v, visit, seen));
  else Object.values(value).forEach(v => walk(v, visit, seen));
}

function pickProduct(states: any[]): any {
  let best: any = null, bestScore = 0;
  for (const state of states) walk(state, item => {
    if (Array.isArray(item)) return;
    const score =
      (item.title || item.subject ? 2 : 0) +
      (item.priceModule || item.price || item.minPrice ? 2 : 0) +
      (item.skuModule || item.skuPriceList || item.skuPropertyList ? 3 : 0) +
      (item.imageModule || item.imagePathList || item.images ? 1 : 0);
    if (score > bestScore) { best = item; bestScore = score; }
  });
  return best;
}

export async function scrapeAliExpressPage(url: string): Promise<AliExpressPageData> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(25000),
    redirect: "follow",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("AliExpress returned HTTP " + response.status + ". It may be temporarily limiting automated requests. Try again later or use a product page accessible without signing in.");
  const html = (await response.text()).slice(0, 5000000);
  if (/captcha|verify you are human|访问验证|滑动验证/i.test(html) && html.length < 300000) {
    throw new Error("AliExpress presented an anti-bot verification page. The free self-hosted importer cannot bypass this check; try again later or use a different product link.");
  }

  const states: any[] = [];
  for (const marker of [
    /(?:window\.)?runParams\s*=\s*/g,
    /(?:window\.)?__INITIAL_STATE__\s*=\s*/g,
    /(?:window\.)?pageData\s*=\s*/g,
  ]) states.push(...extractAssignedJson(html, marker));

  const jsonLd: any[] = [];
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { jsonLd.push(JSON.parse(match[1])); } catch {}
  }
  states.push(...jsonLd);
  const product = pickProduct(states) || {};
  const skuModule = product.skuModule || product.sku_module || {};
  const priceModule = product.priceModule || product.price_module || product.priceInfo || {};
  const skuRows = Array.isArray(skuModule.skuPriceList) ? skuModule.skuPriceList :
    Array.isArray(product.skus) ? product.skus :
    Array.isArray(product.variants) ? product.variants : [];
  const propertyRows = Array.isArray(skuModule.productSKUPropertyList) ? skuModule.productSKUPropertyList :
    Array.isArray(skuModule.skuPropertyList) ? skuModule.skuPropertyList :
    Array.isArray(product.sku_properties) ? product.sku_properties : [];

  return { html, state: states, product: { ...product, priceModule, skuModule }, skuRows, propertyRows };
}

const API_URL =
  "https://ext-isztar4.mf.gov.pl/tariff/rest/goods-nomenclature/codes";
const PAGE_TIMEOUT_MS = 30_000;
const PAGE_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url) {
  let lastError = null;

  for (let attempt = 1; attempt <= PAGE_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "sme-sent-codes-sync/1.0",
        },
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < PAGE_RETRIES) {
        await sleep(attempt * 1000);
      }
    }
  }

  throw lastError;
}

function collectCodes(value, codes) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectCodes(item, codes));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value;
  if (typeof record.code === "string" && record.code.trim()) {
    codes.add(record.code.trim());
  }

  Object.values(record).forEach((nestedValue) => collectCodes(nestedValue, codes));
}

function resolveNextUrl(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (!payload.links || typeof payload.links !== "object") {
    return null;
  }

  if (typeof payload.links.next !== "string") {
    return null;
  }

  return payload.links.next.trim() || null;
}

async function fetchAllSentCodes(options = {}) {
  const codes = new Set();
  const onPage = typeof options.onPage === "function" ? options.onPage : null;
  let nextUrl = API_URL;
  let page = 1;

  while (nextUrl) {
    const payload = await fetchJsonWithRetry(nextUrl);
    collectCodes(payload, codes);

    if (onPage) {
      onPage({
        page,
        collectedCount: codes.size,
      });
    }

    nextUrl = resolveNextUrl(payload);
    page += 1;
  }

  return Array.from(codes).sort((left, right) => left.localeCompare(right, "pl"));
}

module.exports = {
  fetchAllSentCodes,
};


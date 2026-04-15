const DEFAULT_BASE_URL = "http://localhost:3000/";

function getBaseUrl() {
  const raw = String(window.bridge?.meta?.trainsApiUrl || DEFAULT_BASE_URL).trim();
  return raw.endsWith("/") ? raw : `${raw}/`;
}

export function getApiBaseUrl() {
  return getBaseUrl();
}

function buildUrl(pathname) {
  return new URL(String(pathname || "").replace(/^\/+/, ""), getBaseUrl()).toString();
}

function buildPagedUrl(pathname, page) {
  const url = new URL(String(pathname || "").replace(/^\/+/, ""), getBaseUrl());
  const normalizedPage = Math.max(1, Number(page) || 1);
  url.searchParams.set("page", String(normalizedPage));
  return url.toString();
}

async function requestJson(pathname) {
  const response = await fetch(buildUrl(pathname), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${pathname}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function requestPagedJson(pathname, page) {
  const response = await fetch(buildPagedUrl(pathname, page), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${pathname}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function pickArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  for (const key of ["items", "data", "rows", "operations", "routes", "stations", "carriers", "disruptions", "stops"]) {
    if (Array.isArray(value[key])) {
      return value[key];
    }
  }

  return [];
}

export async function fetchCollection(pathname) {
  return pickArray(await requestJson(pathname));
}

export async function fetchEntity(pathname) {
  return requestJson(pathname);
}

export async function fetchPagedCollection(pathname, page = 1) {
  const payload = await requestPagedJson(pathname, page);

  return {
    items: pickArray(payload),
    pagination: payload?.pagination || null,
    raw: payload,
  };
}

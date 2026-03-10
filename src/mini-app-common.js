const fs = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");

const MINI_APP_MANIFEST_NAME = "mini-app.json";
const MINI_APP_REGISTRY_ASSET_NAME = "sme-mini-app-registry.json";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeFileSegment(value, fallback) {
  const normalized = String(value || "").trim().replace(/[^a-z0-9._-]+/gi, "-");
  return normalized || fallback;
}

function buildMiniAppBundleFileName(id, version) {
  const safeId = sanitizeFileSegment(id, "mini-app");
  const safeVersion = sanitizeFileSegment(version, "0.0.0");
  return `sme-mini-app-${safeId}-${safeVersion}.tar.gz`;
}

function normalizeMiniAppManifest(manifest = {}, directoryPath, options = {}) {
  if (!isObject(manifest)) {
    return null;
  }

  const id = String(manifest.id || "").trim();
  const page = String(manifest.page || "index.html").trim();
  if (!id || !page) {
    return null;
  }

  const icon = String(manifest.icon || "").trim();
  const version = String(manifest.version || "0.0.0").trim() || "0.0.0";
  const pagePath = path.resolve(directoryPath, page);
  const iconPath = icon ? path.resolve(directoryPath, icon) : "";

  return {
    id,
    name: String(manifest.name || id).trim() || id,
    description: String(manifest.description || "").trim(),
    version,
    order: Number.isFinite(Number(manifest.order)) ? Number(manifest.order) : 999,
    source: String(options.source || "bundled").trim() || "bundled",
    directoryPath,
    manifestPath: path.join(directoryPath, MINI_APP_MANIFEST_NAME),
    page,
    pagePath,
    pageUrl: pathToFileURL(pagePath).href,
    icon,
    iconPath,
    iconUrl: iconPath ? pathToFileURL(iconPath).href : "",
  };
}

function sortMiniApps(left, right) {
  if ((left?.order ?? 999) !== (right?.order ?? 999)) {
    return (left?.order ?? 999) - (right?.order ?? 999);
  }

  return String(left?.name || left?.id || "").localeCompare(
    String(right?.name || right?.id || ""),
    "pl"
  );
}

async function readMiniAppManifest(directoryPath, options = {}) {
  const manifestPath = path.join(directoryPath, MINI_APP_MANIFEST_NAME);
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    return normalizeMiniAppManifest(manifest, directoryPath, options);
  } catch {
    return null;
  }
}

async function listMiniAppsFromRoot(rootPath, options = {}) {
  let entries = [];

  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT" && options.allowMissing !== false) {
      return [];
    }

    throw error;
  }

  const miniApps = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const directoryPath = path.join(rootPath, entry.name);
    const normalized = await readMiniAppManifest(directoryPath, options);
    if (normalized) {
      miniApps.push(normalized);
    }
  }

  return miniApps.sort(sortMiniApps);
}

function createMiniAppRegistryManifest({
  generatedAt,
  releaseTag,
  repository,
  miniApps = [],
}) {
  return {
    schemaVersion: 1,
    generatedAt: generatedAt || new Date().toISOString(),
    releaseTag: String(releaseTag || "").trim(),
    repository: repository || null,
    miniApps: Array.isArray(miniApps)
      ? miniApps
          .map((entry) => {
            const id = String(entry?.id || "").trim();
            if (!id) {
              return null;
            }

            const bundle = isObject(entry.bundle)
              ? {
                  name: String(entry.bundle.name || "").trim(),
                  downloadUrl: String(entry.bundle.downloadUrl || "").trim(),
                  sha256: String(entry.bundle.sha256 || "").trim().toLowerCase(),
                  size: Number(entry.bundle.size) || 0,
                  format: String(entry.bundle.format || "tar.gz").trim() || "tar.gz",
                }
              : null;

            return {
              id,
              name: String(entry.name || id).trim() || id,
              description: String(entry.description || "").trim(),
              version: String(entry.version || "0.0.0").trim() || "0.0.0",
              order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : 999,
              bundle,
            };
          })
          .filter(Boolean)
          .sort(sortMiniApps)
      : [],
  };
}

module.exports = {
  MINI_APP_MANIFEST_NAME,
  MINI_APP_REGISTRY_ASSET_NAME,
  buildMiniAppBundleFileName,
  createMiniAppRegistryManifest,
  listMiniAppsFromRoot,
  normalizeMiniAppManifest,
  readMiniAppManifest,
  sortMiniApps,
};

const path = require("path");
const fsSync = require("fs");
const fs = require("fs/promises");
const crypto = require("crypto");
const https = require("https");
const { spawn } = require("child_process");
const { app } = require("electron");
const {
  MINI_APP_REGISTRY_ASSET_NAME,
  listMiniAppsFromRoot,
  readMiniAppManifest,
} = require("../../mini-app-common");
const {
  buildLatestReleaseApiUrl,
  normalizeSha256,
  parseGitHubRepository,
} = require("../../update-common");

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getMiniAppRegistrySourceRootPath() {
  return path.join(app.getAppPath(), "module_registry", "apps");
}

function getMiniAppRegistryCachePath() {
  return path.join(app.getPath("appData"), "SME", "cache", MINI_APP_REGISTRY_ASSET_NAME);
}

function getMiniAppInstallTempRootPath() {
  return path.join(app.getPath("temp"), "SME-mini-apps");
}

function resolveCommand(command) {
  if (process.platform === "win32" && command === "tar") {
    return "tar.exe";
  }

  return command;
}

function runCommand(command, args, cwd) {
  const resolvedCommand = resolveCommand(command);

  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCommand, args, {
      cwd,
      env: process.env,
      stdio: "ignore",
      shell: false,
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with code ${code}.`));
    });
  });
}

function createMiniAppRegistryService({ packageJson, miniAppDiscoveryService }) {
  let registryCache = null;
  let registryCacheTime = 0;
  const REGISTRY_CACHE_TTL_MS = 30000;

  function getRepositoryInfo() {
    return parseGitHubRepository(packageJson);
  }

  function getUserAgent() {
    return `SME-MiniApps/${String(app.getVersion() || packageJson.version || "0.0.0").trim()}`;
  }

  function buildRequestHeaders(extraHeaders = {}) {
    return {
      "User-Agent": getUserAgent(),
      ...extraHeaders,
    };
  }

  function requestBuffer(url, headers = {}, redirectCount = 0) {
    if (redirectCount > 5) {
      return Promise.reject(new Error("Too many redirects while requesting mini-app registry."));
    }

    return new Promise((resolve, reject) => {
      const request = https.get(url, { headers: buildRequestHeaders(headers) }, (response) => {
        const statusCode = Number(response.statusCode) || 0;
        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          response.resume();
          resolve(
            requestBuffer(
              new URL(response.headers.location, url).toString(),
              headers,
              redirectCount + 1
            )
          );
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => {
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          const body = Buffer.concat(chunks);
          if (statusCode < 200 || statusCode >= 300) {
            const message = body.toString("utf8").slice(0, 240).trim();
            reject(
              new Error(
                message
                  ? `HTTP ${statusCode}: ${message}`
                  : `HTTP ${statusCode} while requesting ${url}`
              )
            );
            return;
          }

          resolve({
            body,
            headers: response.headers,
            statusCode,
          });
        });
      });

      request.on("error", reject);
    });
  }

  async function requestJson(url, headers = {}) {
    const response = await requestBuffer(url, headers);
    return JSON.parse(response.body.toString("utf8"));
  }

  async function saveRegistryCache(registry) {
    const cachePath = getMiniAppRegistryCachePath();
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  }

  async function readRegistryCache() {
    try {
      const cachePath = getMiniAppRegistryCachePath();
      return JSON.parse(await fs.readFile(cachePath, "utf8"));
    } catch {
      return null;
    }
  }

  function normalizeRegistryMiniAppEntry(entry = {}) {
    if (!isObject(entry)) {
      return null;
    }

    const id = String(entry.id || "").trim();
    if (!id) {
      return null;
    }

    const bundle = isObject(entry.bundle)
      ? {
          name: String(entry.bundle.name || "").trim(),
          downloadUrl: String(entry.bundle.downloadUrl || "").trim(),
          sha256: normalizeSha256(entry.bundle.sha256),
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
      source: "registry",
      iconUrl: String(entry.iconUrl || "").trim(),
      bundle,
      localSourceDirectory: String(entry.localSourceDirectory || "").trim(),
    };
  }

  async function listDevelopmentRegistryMiniApps() {
    const sourceRoot = getMiniAppRegistrySourceRootPath();
    const miniApps = await listMiniAppsFromRoot(sourceRoot, {
      source: "registry",
    });

    return miniApps.map((miniApp) => ({
      id: miniApp.id,
      name: miniApp.name,
      description: miniApp.description,
      version: miniApp.version,
      order: miniApp.order,
      source: "registry",
      iconUrl: miniApp.iconUrl,
      bundle: null,
      localSourceDirectory: miniApp.directoryPath,
    }));
  }

  async function fetchRemoteRegistry(options = {}) {
    const forceRefresh = Boolean(options.forceRefresh);
    if (!forceRefresh && registryCache && Date.now() - registryCacheTime < REGISTRY_CACHE_TTL_MS) {
      return registryCache;
    }

    const repository = getRepositoryInfo();
    if (!repository) {
      throw new Error("package.json.repository must point to GitHub for mini-app registry.");
    }

    try {
      const latestRelease = await requestJson(buildLatestReleaseApiUrl(repository), {
        Accept: "application/vnd.github+json",
      });
      const registryAsset = Array.isArray(latestRelease.assets)
        ? latestRelease.assets.find((asset) => asset.name === MINI_APP_REGISTRY_ASSET_NAME)
        : null;

      if (!registryAsset?.browser_download_url) {
        throw new Error(`Latest GitHub release does not include ${MINI_APP_REGISTRY_ASSET_NAME}.`);
      }

      const registry = await requestJson(registryAsset.browser_download_url, {
        Accept: "application/json",
      });
      const normalized = {
        schemaVersion: Number(registry?.schemaVersion) || 1,
        generatedAt:
          String(registry?.generatedAt || "").trim() ||
          String(latestRelease.published_at || latestRelease.created_at || "").trim(),
        releaseTag:
          String(registry?.releaseTag || "").trim() || String(latestRelease.tag_name || "").trim(),
        repository: registry?.repository || repository,
        miniApps: Array.isArray(registry?.miniApps)
          ? registry.miniApps.map(normalizeRegistryMiniAppEntry).filter(Boolean)
          : [],
      };

      registryCache = normalized;
      registryCacheTime = Date.now();
      await saveRegistryCache(normalized);
      return normalized;
    } catch (error) {
      const cachedRegistry = await readRegistryCache();
      if (cachedRegistry) {
        registryCache = {
          ...cachedRegistry,
          miniApps: Array.isArray(cachedRegistry?.miniApps)
            ? cachedRegistry.miniApps.map(normalizeRegistryMiniAppEntry).filter(Boolean)
            : [],
        };
        registryCacheTime = Date.now();
        return registryCache;
      }

      throw error;
    }
  }

  async function listRegistryMiniApps(options = {}) {
    if (!app.isPackaged) {
      return listDevelopmentRegistryMiniApps();
    }

    const registry = await fetchRemoteRegistry(options);
    return registry.miniApps;
  }

  function downloadArchive(bundle, destinationPath, redirectCount = 0) {
    if (redirectCount > 5) {
      return Promise.reject(new Error("Too many redirects while downloading mini-app archive."));
    }

    return new Promise((resolve, reject) => {
      const request = https.get(bundle.downloadUrl, { headers: buildRequestHeaders() }, async (response) => {
        const statusCode = Number(response.statusCode) || 0;
        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          response.resume();
          try {
            resolve(
              await downloadArchive(
                { ...bundle, downloadUrl: new URL(response.headers.location, bundle.downloadUrl).toString() },
                destinationPath,
                redirectCount + 1
              )
            );
          } catch (error) {
            reject(error);
          }
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          const chunks = [];
          response.on("data", (chunk) => {
            chunks.push(chunk);
          });
          response.on("end", () => {
            const message = Buffer.concat(chunks).toString("utf8").slice(0, 240).trim();
            reject(
              new Error(
                message
                  ? `HTTP ${statusCode}: ${message}`
                  : `HTTP ${statusCode} while downloading ${bundle.downloadUrl}`
              )
            );
          });
          return;
        }

        try {
          await fs.mkdir(path.dirname(destinationPath), { recursive: true });
          const fileStream = fsSync.createWriteStream(destinationPath);
          const hash = crypto.createHash("sha256");
          let settled = false;

          function settleError(error) {
            if (settled) {
              return;
            }

            settled = true;
            fileStream.destroy();
            fs.rm(destinationPath, { force: true }).catch(() => {});
            reject(error);
          }

          response.on("data", (chunk) => {
            hash.update(chunk);
          });
          response.on("error", settleError);
          fileStream.on("error", settleError);
          fileStream.on("finish", () => {
            if (settled) {
              return;
            }

            settled = true;
            const downloadedSha = hash.digest("hex");
            if (bundle.sha256 && normalizeSha256(downloadedSha) !== normalizeSha256(bundle.sha256)) {
              fs.rm(destinationPath, { force: true }).catch(() => {});
              reject(new Error(`Archive hash mismatch for mini-app ${bundle.name || "unknown"}.`));
              return;
            }

            resolve({
              destinationPath,
              sha256: downloadedSha,
            });
          });

          response.pipe(fileStream);
        } catch (error) {
          reject(error);
        }
      });

      request.on("error", reject);
    });
  }

  async function locateMiniAppDirectory(rootPath, expectedMiniAppId) {
    const rootMiniApp = await readMiniAppManifest(rootPath, { source: "installed" });
    if (rootMiniApp?.id === expectedMiniAppId) {
      return rootPath;
    }

    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const directoryPath = path.join(rootPath, entry.name);
      const miniApp = await readMiniAppManifest(directoryPath, { source: "installed" });
      if (miniApp?.id === expectedMiniAppId) {
        return directoryPath;
      }
    }

    return "";
  }

  async function stageDirectorySource(entry, stagingRoot) {
    const stagedPath = path.join(stagingRoot, entry.id);
    await fs.cp(entry.localSourceDirectory, stagedPath, {
      recursive: true,
      force: true,
    });
    return stagedPath;
  }

  async function stageArchiveSource(entry, stagingRoot) {
    if (!entry.bundle?.downloadUrl) {
      throw new Error(`Mini-app ${entry.id} does not define a downloadable bundle.`);
    }

    const bundlePath = path.join(stagingRoot, entry.bundle.name || `${entry.id}.tar.gz`);
    const extractRoot = path.join(stagingRoot, "extract");
    await downloadArchive(entry.bundle, bundlePath);
    await fs.mkdir(extractRoot, { recursive: true });
    await runCommand("tar", ["-xzf", bundlePath, "-C", extractRoot], stagingRoot);

    const locatedPath = await locateMiniAppDirectory(extractRoot, entry.id);
    if (!locatedPath) {
      throw new Error(`Installed archive for mini-app ${entry.id} does not contain ${entry.id}.`);
    }

    return locatedPath;
  }

  async function installMiniApp(registryEntry) {
    const entry = normalizeRegistryMiniAppEntry(registryEntry);
    if (!entry) {
      throw new Error("Mini-app registry entry is invalid.");
    }

    const stagingRoot = path.join(
      getMiniAppInstallTempRootPath(),
      `${entry.id}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    );
    const installedRoot = await miniAppDiscoveryService.ensureInstalledMiniAppsRoot();
    const targetPath = path.join(installedRoot, entry.id);

    await fs.mkdir(stagingRoot, { recursive: true });

    try {
      const stagedMiniAppPath = entry.localSourceDirectory
        ? await stageDirectorySource(entry, stagingRoot)
        : await stageArchiveSource(entry, stagingRoot);
      const stagedManifest = await readMiniAppManifest(stagedMiniAppPath, {
        source: "installed",
      });

      if (!stagedManifest || stagedManifest.id !== entry.id) {
        throw new Error(`Mini-app ${entry.id} failed manifest validation after install.`);
      }

      await fs.rm(targetPath, { recursive: true, force: true });
      await fs.cp(stagedMiniAppPath, targetPath, {
        recursive: true,
        force: true,
      });

      const installedMiniApp = await readMiniAppManifest(targetPath, {
        source: "installed",
      });
      if (!installedMiniApp) {
        throw new Error(`Mini-app ${entry.id} was copied but manifest cannot be read.`);
      }

      return installedMiniApp;
    } finally {
      await fs.rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
    }
  }

  return {
    installMiniApp,
    listRegistryMiniApps,
  };
}

module.exports = {
  createMiniAppRegistryService,
  getMiniAppRegistryCachePath,
  getMiniAppRegistrySourceRootPath,
};

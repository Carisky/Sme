const path = require("path");
const fsSync = require("fs");
const fs = require("fs/promises");
const crypto = require("crypto");
const https = require("https");
const { spawn } = require("child_process");
const { app } = require("electron");
const {
  RELEASE_MANIFEST_NAME,
  buildLatestReleaseApiUrl,
  compareVersions,
  hashDirectory,
  normalizeProductName,
  normalizeSha256,
  parseGitHubRepository,
} = require("../../update-common");

function createUpdateService({ windowController, catalogService, packageJson }) {
  let releaseManifestCache = null;
  let releaseManifestCacheTime = 0;
  let lastEvaluatedGate = null;
  const RELEASE_MANIFEST_CACHE_TTL_MS = 30000;

  function getRepositoryInfo() {
    return parseGitHubRepository(packageJson);
  }

  function getProductName() {
    return normalizeProductName(packageJson).replace(/\s+/g, "") || "SilesDoc";
  }

  function getAppVersion() {
    return String(app.getVersion() || packageJson.version || "0.0.0").trim();
  }

  function buildRequestHeaders(extraHeaders = {}) {
    return {
      "User-Agent": `${getProductName()}-Updater/${getAppVersion()}`,
      ...extraHeaders,
    };
  }

  function sendUpdateStatus(payload) {
    windowController.send("update:status", payload);
  }

  function formatByteCount(value) {
    const bytes = Math.max(Number(value) || 0, 0);
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${bytes} B`;
  }

  function requestBuffer(url, headers = {}, redirectCount = 0) {
    if (redirectCount > 5) {
      return Promise.reject(new Error("Too many redirects while requesting update metadata."));
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

  function downloadFileWithProgress(url, destinationPath, onProgress, redirectCount = 0) {
    if (redirectCount > 5) {
      return Promise.reject(new Error("Too many redirects while downloading update installer."));
    }

    return new Promise((resolve, reject) => {
      const request = https.get(url, { headers: buildRequestHeaders() }, async (response) => {
        const statusCode = Number(response.statusCode) || 0;
        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          response.resume();
          try {
            resolve(
              await downloadFileWithProgress(
                new URL(response.headers.location, url).toString(),
                destinationPath,
                onProgress,
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
                  : `HTTP ${statusCode} while downloading ${url}`
              )
            );
          });
          return;
        }

        try {
          await fs.mkdir(path.dirname(destinationPath), { recursive: true });
          const fileStream = fsSync.createWriteStream(destinationPath);
          const hash = crypto.createHash("sha256");
          const totalBytes =
            Number.parseInt(String(response.headers["content-length"] || "0"), 10) || 0;
          let receivedBytes = 0;
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
            receivedBytes += chunk.length;
            hash.update(chunk);
            if (typeof onProgress === "function") {
              onProgress({
                receivedBytes,
                totalBytes,
              });
            }
          });

          response.on("error", settleError);
          fileStream.on("error", settleError);
          fileStream.on("finish", () => {
            if (settled) {
              return;
            }

            settled = true;
            resolve({
              destinationPath,
              receivedBytes,
              totalBytes,
              sha256: hash.digest("hex"),
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

  async function fetchLatestReleaseManifest(options = {}) {
    const forceRefresh = Boolean(options.forceRefresh);
    const repository = getRepositoryInfo();
    if (!repository) {
      throw new Error("package.json.repository nie jest skonfigurowane dla wydan GitHub.");
    }

    const cacheAge = Date.now() - releaseManifestCacheTime;
    if (!forceRefresh && releaseManifestCache && cacheAge < RELEASE_MANIFEST_CACHE_TTL_MS) {
      return releaseManifestCache;
    }

    const latestRelease = await requestJson(buildLatestReleaseApiUrl(repository), {
      Accept: "application/vnd.github+json",
    });
    const manifestAsset = Array.isArray(latestRelease.assets)
      ? latestRelease.assets.find((asset) => asset.name === RELEASE_MANIFEST_NAME)
      : null;

    if (!manifestAsset?.browser_download_url) {
      throw new Error(`Najnowsze wydanie GitHub nie zawiera ${RELEASE_MANIFEST_NAME}.`);
    }

    const manifest = await requestJson(manifestAsset.browser_download_url, {
      Accept: "application/json",
    });
    releaseManifestCache = {
      ...manifest,
      repository: manifest.repository || repository,
      releaseTag: manifest.releaseTag || latestRelease.tag_name || "",
      publishedAt:
        manifest.publishedAt || latestRelease.published_at || latestRelease.created_at || "",
      releaseUrl: latestRelease.html_url || "",
    };
    releaseManifestCacheTime = Date.now();
    return releaseManifestCache;
  }

  async function computeLocalAppSha256() {
    return hashDirectory(app.getAppPath());
  }

  async function persistVerifiedReleaseState(manifest, localAppSha256) {
    const record = {
      version: String(manifest.version || "").trim(),
      releaseTag: String(manifest.releaseTag || "").trim(),
      appSha256: normalizeSha256(localAppSha256),
      installerSha256: normalizeSha256(manifest.assets?.installer?.sha256),
      verifiedAt: new Date().toISOString(),
    };

    await catalogService.saveVerifiedRelease(record);
    return catalogService.loadVerifiedRelease();
  }

  async function evaluateUpdateGate(options = {}) {
    const forceRefresh = Boolean(options.forceRefresh);
    const localVersion = getAppVersion();

    if (!app.isPackaged) {
      lastEvaluatedGate = {
        locked: false,
        status: "development",
        localVersion,
        remoteVersion: "",
        message: "Aktualizacje sa wylaczone w trybie developerskim.",
        detail: "",
        allowInstall: false,
        allowRetry: false,
        manifest: null,
      };
      return lastEvaluatedGate;
    }

    let verifiedRelease = null;
    let localAppSha256 = "";

    try {
      verifiedRelease = await catalogService.loadVerifiedRelease();
    } catch {
      verifiedRelease = null;
    }

    try {
      const manifest = await fetchLatestReleaseManifest({ forceRefresh });
      const remoteVersion = String(manifest.version || "").trim();
      const versionComparison = compareVersions(remoteVersion, localVersion);

      if (versionComparison > 0) {
        lastEvaluatedGate = {
          locked: true,
          status: "update-required",
          localVersion,
          remoteVersion,
          message: `Wersja ${remoteVersion} jest juz na serwerze. Ta kopia programu musi zostac zaktualizowana.`,
          detail: "Kliknij Zaktualizuj, aby pobrac najnowszy instalator.",
          allowInstall: true,
          allowRetry: true,
          manifest,
        };
        return lastEvaluatedGate;
      }

      if (versionComparison < 0) {
        lastEvaluatedGate = {
          locked: false,
          status: "local-newer-than-remote",
          localVersion,
          remoteVersion,
          message: `Lokalna wersja ${localVersion} jest nowsza niz wydanie ${remoteVersion}.`,
          detail: "",
          allowInstall: false,
          allowRetry: false,
          manifest,
        };
        return lastEvaluatedGate;
      }

      localAppSha256 = await computeLocalAppSha256();
      if (normalizeSha256(localAppSha256) !== normalizeSha256(manifest.appSha256)) {
        lastEvaluatedGate = {
          locked: true,
          status: "integrity-mismatch",
          localVersion,
          remoteVersion,
          localAppSha256,
          message:
            "Wersja programu zgadza sie z serwerem, ale hash lokalnej aplikacji nie zgadza sie z manifestem wydania.",
          detail: "Wymagana jest ponowna instalacja z aktualnego wydania.",
          allowInstall: true,
          allowRetry: true,
          manifest,
        };
        return lastEvaluatedGate;
      }

      const persistedRelease = await persistVerifiedReleaseState(manifest, localAppSha256);
      if (
        String(persistedRelease?.version || "").trim() !== remoteVersion ||
        normalizeSha256(persistedRelease?.appSha256) !== normalizeSha256(manifest.appSha256)
      ) {
        lastEvaluatedGate = {
          locked: true,
          status: "verification-persist-failed",
          localVersion,
          remoteVersion,
          localAppSha256,
          message:
            "Nie udalo sie zapisac i potwierdzic wersji aplikacji w lokalnej bazie danych.",
          detail: "Uruchom aktualizacje ponownie.",
          allowInstall: true,
          allowRetry: true,
          manifest,
        };
        return lastEvaluatedGate;
      }

      lastEvaluatedGate = {
        locked: false,
        status: "up-to-date",
        localVersion,
        remoteVersion,
        localAppSha256,
        message: `Wersja ${localVersion} jest aktualna.`,
        detail: "",
        allowInstall: false,
        allowRetry: false,
        manifest,
      };
      return lastEvaluatedGate;
    } catch (error) {
      if (!localAppSha256) {
        try {
          localAppSha256 = await computeLocalAppSha256();
        } catch {
          localAppSha256 = "";
        }
      }

      if (
        verifiedRelease &&
        String(verifiedRelease.version || "").trim() === localVersion &&
        normalizeSha256(verifiedRelease.appSha256) === normalizeSha256(localAppSha256)
      ) {
        lastEvaluatedGate = {
          locked: false,
          status: "offline-verified",
          localVersion,
          remoteVersion: String(verifiedRelease.version || "").trim(),
          localAppSha256,
          message:
            "Nie udalo sie polaczyc z serwerem aktualizacji. Uzywam ostatniej potwierdzonej wersji lokalnej.",
          detail: error.message,
          allowInstall: false,
          allowRetry: false,
          manifest: null,
        };
        return lastEvaluatedGate;
      }

      lastEvaluatedGate = {
        locked: true,
        status: "server-unavailable",
        localVersion,
        remoteVersion: "",
        localAppSha256,
        message: "Nie udalo sie potwierdzic wersji aplikacji na serwerze.",
        detail: error.message,
        allowInstall: false,
        allowRetry: true,
        manifest: null,
      };
      return lastEvaluatedGate;
    }
  }

  function getCachedUpdateGate() {
    return lastEvaluatedGate;
  }

  async function launchInstaller(installerPath) {
    const child = spawn(installerPath, [], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    setTimeout(() => {
      app.quit();
    }, 200);
  }

  async function downloadAndInstallLatestRelease() {
    if (!app.isPackaged) {
      throw new Error("Instalator aktualizacji jest dostepny tylko w zbudowanej aplikacji.");
    }

    sendUpdateStatus({
      phase: "checking",
      message: "Sprawdzanie manifestu aktualizacji.",
    });

    const gate = await evaluateUpdateGate({ forceRefresh: true });
    const installer = gate.manifest?.assets?.installer;
    if (!installer?.downloadUrl || !installer?.sha256 || !installer?.name) {
      throw new Error("Manifest wydania nie zawiera kompletnego opisu instalatora.");
    }

    const downloadDir = path.join(app.getPath("temp"), `${getProductName()}-updates`);
    const destinationPath = path.join(downloadDir, installer.name);
    await fs.rm(destinationPath, { force: true });

    sendUpdateStatus({
      phase: "downloading",
      receivedBytes: 0,
      totalBytes: Number(installer.size) || 0,
      percent: 0,
      message: "Pobieranie instalatora aktualizacji.",
    });

    const downloadResult = await downloadFileWithProgress(
      installer.downloadUrl,
      destinationPath,
      ({ receivedBytes, totalBytes }) => {
        const expectedBytes = totalBytes || Number(installer.size) || 0;
        const percent =
          expectedBytes > 0 ? Math.round((receivedBytes / expectedBytes) * 100) : 0;
        sendUpdateStatus({
          phase: "downloading",
          receivedBytes,
          totalBytes: expectedBytes,
          percent,
          message:
            expectedBytes > 0
              ? `Pobrano ${formatByteCount(receivedBytes)} z ${formatByteCount(expectedBytes)}.`
              : `Pobrano ${formatByteCount(receivedBytes)}.`,
        });
      }
    );

    sendUpdateStatus({
      phase: "verifying",
      message: "Sprawdzanie hash pobranego instalatora.",
    });

    if (normalizeSha256(downloadResult.sha256) !== normalizeSha256(installer.sha256)) {
      await fs.rm(destinationPath, { force: true });
      throw new Error("Hash pobranego instalatora nie zgadza sie z manifestem wydania.");
    }

    sendUpdateStatus({
      phase: "launching",
      message: "Uruchamianie instalatora aktualizacji.",
    });

    await launchInstaller(destinationPath);
    return {
      started: true,
    };
  }

  return {
    downloadAndInstallLatestRelease,
    evaluateUpdateGate,
    getCachedUpdateGate,
  };
}

module.exports = {
  createUpdateService,
};

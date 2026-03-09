const path = require("path");
const fsSync = require("fs");
const fs = require("fs/promises");
const crypto = require("crypto");
const https = require("https");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const packageJson = require("./package.json");
const {
  buildStateFromAppSettings,
  createEmptyState,
  normalizeState,
  sanitizeFileName,
  suggestProjectName,
} = require("./src/core");
const { importSourceWorkbook } = require("./src/excel");
const {
  disconnectOreCatalog,
  listCustomsOffices,
  listOriginCountries,
  listOreKinds,
  loadAppSettings,
  loadVerifiedRelease,
  saveCustomsOffice,
  saveAppSettings,
  saveVerifiedRelease,
  saveOriginCountry,
} = require("./src/ore-catalog");
const {
  RELEASE_MANIFEST_NAME,
  buildLatestReleaseApiUrl,
  compareVersions,
  hashDirectory,
  normalizeSha256,
  parseGitHubRepository,
} = require("./src/update-common");

let mainWindow;
const execFileAsync = promisify(execFile);
let releaseManifestCache = null;
let releaseManifestCacheTime = 0;
const RELEASE_MANIFEST_CACHE_TTL_MS = 30000;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1180,
    minHeight: 820,
    backgroundColor: "#e6e0d2",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "app", "index.html"));
}

async function chooseProjectPath(suggestedName) {
  const defaultName = `${sanitizeFileName(suggestedName || "projekt-sme")}.sme.json`;
  return dialog.showSaveDialog(mainWindow, {
    title: "Zapisz projekt SME",
    defaultPath: path.join(app.getPath("documents"), defaultName),
    filters: [{ name: "SME Project", extensions: ["json"] }],
  });
}

async function writeProjectFile(filePath, state) {
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    state: normalizeState(state),
  };

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function createPdfFileName(state) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${suggestProjectName(state)}-${timestamp}.pdf`;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sendPrintStatus(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("print:status", payload);
}

function sendUpdateStatus(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("update:status", payload);
}

async function getDefaultWindowsPrinterInfo() {
  if (process.platform !== "win32") {
    return null;
  }

  const script = [
    "$printer = Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 Name, ColorSupported",
    "if ($printer) { $printer | ConvertTo-Json -Compress }",
  ].join("; ");

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      {
        windowsHide: true,
      }
    );

    const raw = String(stdout || "").trim();
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return {
      name: parsed.Name || "",
      colorSupported:
        typeof parsed.ColorSupported === "boolean" ? parsed.ColorSupported : null,
    };
  } catch {
    return null;
  }
}

async function listWindowsPrintJobs() {
  if (process.platform !== "win32") {
    return [];
  }

  const script = [
    "$jobs = Get-CimInstance Win32_PrintJob | Select-Object Name, Document, JobId, PagesPrinted, TotalPages, JobStatus, Status",
    "if ($jobs) { $jobs | ConvertTo-Json -Compress }",
  ].join("; ");

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      {
        windowsHide: true,
      }
    );

    const raw = String(stdout || "").trim();
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function filterJobsForPrinter(jobs, printerName) {
  const normalizedPrinterName = String(printerName || "").toLowerCase();
  if (!normalizedPrinterName) {
    return jobs;
  }

  return jobs.filter((job) =>
    String(job?.Name || "")
      .toLowerCase()
      .startsWith(`${normalizedPrinterName},`)
  );
}

async function monitorPrintQueue(printerName, fallbackPageCount) {
  if (process.platform !== "win32") {
    return {
      printedPages: fallbackPageCount,
      totalPages: fallbackPageCount,
      monitored: false,
    };
  }

  const jobsBefore = new Set(
    filterJobsForPrinter(await listWindowsPrintJobs(), printerName).map((job) => job.Name)
  );

  let trackedJobName = "";
  let lastPrintedPages = 0;
  let lastTotalPages = fallbackPageCount;
  const startedAt = Date.now();

  while (Date.now() - startedAt < 45000) {
    const jobs = filterJobsForPrinter(await listWindowsPrintJobs(), printerName);
    const currentJob =
      jobs.find((job) => job.Name === trackedJobName) ||
      jobs.find((job) => !jobsBefore.has(job.Name)) ||
      null;

    if (currentJob) {
      trackedJobName = currentJob.Name;
      const totalPages = Number(currentJob.TotalPages) || lastTotalPages || fallbackPageCount;
      const printedPages = Number(currentJob.PagesPrinted) || 0;

      lastPrintedPages = printedPages;
      lastTotalPages = totalPages;

      sendPrintStatus({
        phase: "printing",
        printerName,
        printedPages,
        totalPages,
        message:
          totalPages > 0
            ? `Wydrukowano ${printedPages} z ${totalPages} stron.`
            : "Dokument jest przetwarzany w kolejce drukarki.",
      });
    } else if (trackedJobName) {
      return {
        printedPages: lastTotalPages || fallbackPageCount,
        totalPages: lastTotalPages || fallbackPageCount,
        monitored: true,
      };
    }

    await sleep(900);
  }

  return {
    printedPages: lastPrintedPages || fallbackPageCount,
    totalPages: lastTotalPages || fallbackPageCount,
    monitored: Boolean(trackedJobName),
  };
}

async function resolveDefaultPrinter(webContents) {
  const printers = await webContents.getPrintersAsync();
  const systemDefault = await getDefaultWindowsPrinterInfo();

  const fallbackPrinter =
    printers.find(
      (printer) =>
        printer?.isDefault === true ||
        printer?.options?.default === true ||
        printer?.options?.default === "true" ||
        printer?.options?.["is-default"] === true ||
        printer?.options?.["is-default"] === "true"
    ) || null;

  const printerName = systemDefault?.name || fallbackPrinter?.name || "";
  const colorSupported =
    systemDefault?.colorSupported === false ? false : true;

  return {
    printerName,
    colorSupported,
  };
}

async function printCurrentPreviewToDefaultPrinter(state) {
  if (!mainWindow) {
    throw new Error("Okno aplikacji nie jest gotowe do wydruku.");
  }

  const normalizedState = normalizeState(state);
  const printer = await resolveDefaultPrinter(mainWindow.webContents);
  const fallbackPageCount = Number(normalizedState.print?.pageCount) || 0;

  sendPrintStatus({
    phase: "spooling",
    printerName: printer.printerName || "domyslna drukarka systemowa",
    printedPages: 0,
    totalPages: fallbackPageCount,
    message: "Trwa wysylanie dokumentu do kolejki drukarki.",
  });

  const printResult = await new Promise((resolve, reject) => {
    mainWindow.webContents.print(
      {
        silent: true,
        printBackground: true,
        color: printer.colorSupported,
        landscape: false,
        pageSize: "A4",
      },
      (success, failureReason) => {
        if (success) {
          resolve({ success: true });
          return;
        }

        reject(new Error(failureReason || "Nie udalo sie wydrukowac dokumentu."));
      }
    );
  });

  const queueResult = await monitorPrintQueue(
    printer.printerName || "domyslna drukarka systemowa",
    fallbackPageCount
  );

  let pdfPath = null;
  let pdfError = null;
  if (normalizedState.print.savePdfAfterPrint) {
    try {
      sendPrintStatus({
        phase: "pdf",
        printerName: printer.printerName || "domyslna drukarka systemowa",
        printedPages: queueResult.totalPages || fallbackPageCount,
        totalPages: queueResult.totalPages || fallbackPageCount,
        message: "Druk zakonczony, trwa zapisywanie kopii PDF.",
      });

      const outputDir = normalizedState.print.pdfOutputDir;
      if (!outputDir) {
        throw new Error(
          "Wlaczono zapis PDF po wydruku, ale nie ustawiono folderu docelowego."
        );
      }

      await fs.mkdir(outputDir, { recursive: true });
      const pdfBuffer = await mainWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: "A4",
        preferCSSPageSize: true,
      });
      pdfPath = path.join(outputDir, createPdfFileName(normalizedState));
      await fs.writeFile(pdfPath, pdfBuffer);
    } catch (error) {
      pdfError = error.message;
    }
  }

  return {
    ...printResult,
    printerName: printer.printerName || "domyslna drukarka systemowa",
    colorMode: printer.colorSupported ? "color" : "grayscale",
    pdfPath,
    pdfError,
    printedPages: queueResult.printedPages || fallbackPageCount,
    totalPages: queueResult.totalPages || fallbackPageCount,
  };
}

function getRepositoryInfo() {
  return parseGitHubRepository(packageJson);
}

function getAppVersion() {
  return String(app.getVersion() || packageJson.version || "0.0.0").trim();
}

function buildRequestHeaders(extraHeaders = {}) {
  return {
    "User-Agent": `SME-Updater/${getAppVersion()}`,
    ...extraHeaders,
  };
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
      if (
        statusCode >= 300 &&
        statusCode < 400 &&
        response.headers.location
      ) {
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
      if (
        statusCode >= 300 &&
        statusCode < 400 &&
        response.headers.location
      ) {
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
    throw new Error("package.json.repository is not configured for GitHub releases.");
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
    throw new Error(
      `Latest GitHub release does not contain ${RELEASE_MANIFEST_NAME}.`
    );
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

  await saveVerifiedRelease(record);
  return loadVerifiedRelease();
}

async function evaluateUpdateGate(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const localVersion = getAppVersion();

  if (!app.isPackaged) {
    return {
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
  }

  let verifiedRelease = null;
  let localAppSha256 = "";

  try {
    verifiedRelease = await loadVerifiedRelease();
  } catch {
    verifiedRelease = null;
  }

  try {
    const manifest = await fetchLatestReleaseManifest({ forceRefresh });
    const remoteVersion = String(manifest.version || "").trim();
    const versionComparison = compareVersions(remoteVersion, localVersion);

    if (versionComparison > 0) {
      return {
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
    }

    if (versionComparison < 0) {
      return {
        locked: false,
        status: "local-newer-than-remote",
        localVersion,
        remoteVersion,
        message: `Lokalna wersja ${localVersion} jest nowsza niz release ${remoteVersion}.`,
        detail: "",
        allowInstall: false,
        allowRetry: false,
        manifest,
      };
    }

    localAppSha256 = await computeLocalAppSha256();
    if (normalizeSha256(localAppSha256) !== normalizeSha256(manifest.appSha256)) {
      return {
        locked: true,
        status: "integrity-mismatch",
        localVersion,
        remoteVersion,
        localAppSha256,
        message:
          "Wersja programu zgadza sie z serwerem, ale hash lokalnej aplikacji nie zgadza sie z manifestem release.",
        detail: "Wymagana jest ponowna instalacja z aktualnego release.",
        allowInstall: true,
        allowRetry: true,
        manifest,
      };
    }

    const persistedRelease = await persistVerifiedReleaseState(manifest, localAppSha256);
    if (
      String(persistedRelease?.version || "").trim() !== remoteVersion ||
      normalizeSha256(persistedRelease?.appSha256) !== normalizeSha256(manifest.appSha256)
    ) {
      return {
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
    }

    return {
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
      return {
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
    }

    return {
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
  }
}

async function launchInstaller(installerPath) {
  const child = spawn(installerPath, [], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
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
    throw new Error("Manifest release nie zawiera kompletnego opisu instalatora.");
  }

  const downloadDir = path.join(app.getPath("temp"), "SME-updates");
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
      const percent = expectedBytes > 0 ? Math.round((receivedBytes / expectedBytes) * 100) : 0;
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
    throw new Error("Hash pobranego instalatora nie zgadza sie z manifestem release.");
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

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

ipcMain.handle("app:bootstrap", async () => {
  let appSettings = {};
  let oreKinds = [];
  let customsOffices = [];
  let originCountries = [];
  let catalogError = null;
  let updateGate = null;

  try {
    appSettings = await loadAppSettings();
    oreKinds = await listOreKinds();
    customsOffices = await listCustomsOffices();
    originCountries = await listOriginCountries();
  } catch (error) {
    catalogError = `Nie udalo sie odczytac slownikow aplikacji: ${error.message}`;
  }

  updateGate = await evaluateUpdateGate();

  return {
    state: createEmptyState(buildStateFromAppSettings(appSettings)),
    oreKinds,
    customsOffices,
    originCountries,
    catalogError,
    updateGate,
  };
});

ipcMain.handle("project:open", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Otwórz projekt SME",
    properties: ["openFile"],
    filters: [{ name: "SME Project", extensions: ["json"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const raw = await fs.readFile(filePath, "utf8");
  const payload = JSON.parse(raw);

  return {
    canceled: false,
    filePath,
    state: normalizeState(payload.state || payload),
  };
});

ipcMain.handle("project:save", async (_event, state, currentPath) => {
  let targetPath = currentPath;

  if (!targetPath) {
    const saveDialog = await chooseProjectPath(suggestProjectName(state));
    if (saveDialog.canceled || !saveDialog.filePath) {
      return { canceled: true };
    }

    targetPath = saveDialog.filePath;
  }

  await writeProjectFile(targetPath, state);
  return { canceled: false, filePath: targetPath };
});

ipcMain.handle("project:saveAs", async (_event, state) => {
  const saveDialog = await chooseProjectPath(suggestProjectName(state));
  if (saveDialog.canceled || !saveDialog.filePath) {
    return { canceled: true };
  }

  await writeProjectFile(saveDialog.filePath, state);
  return { canceled: false, filePath: saveDialog.filePath };
});

ipcMain.handle("source:import", async (_event, currentState) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Importuj plik źródłowy Excel",
    properties: ["openFile"],
    filters: [{ name: "Excel", extensions: ["xls", "xlsx", "xlsm"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  return {
    canceled: false,
    filePath,
    state: importSourceWorkbook(filePath, currentState),
  };
});

ipcMain.handle("catalog:save-customs-office", async (_event, office) => {
  return saveCustomsOffice(office);
});

ipcMain.handle("catalog:save-origin-country", async (_event, country) => {
  return saveOriginCountry(country);
});

ipcMain.handle("settings:save", async (_event, settings) => {
  return saveAppSettings(settings);
});

ipcMain.handle("dialog:choose-directory", async (_event, defaultPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Wybierz folder dla PDF po wydruku",
    defaultPath: defaultPath || app.getPath("documents"),
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  return {
    canceled: false,
    filePath: result.filePaths[0],
  };
});

ipcMain.handle("print:to-default-printer", async (_event, state) => {
  return printCurrentPreviewToDefaultPrinter(state);
});

ipcMain.handle("update:check", async () => {
  return evaluateUpdateGate({ forceRefresh: true });
});

ipcMain.handle("update:download-and-install", async () => {
  return downloadAndInstallLatestRelease();
});

ipcMain.on("window:set-title", (_event, title) => {
  if (mainWindow) {
    mainWindow.setTitle(title);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  disconnectOreCatalog().catch(() => {});
});

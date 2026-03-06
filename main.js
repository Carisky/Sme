const path = require("path");
const fs = require("fs/promises");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const {
  createEmptyState,
  normalizeState,
  sanitizeFileName,
  suggestProjectName,
} = require("./src/core");
const { SAMPLE_WORKBOOK_PATH } = require("./src/constants");
const { importSourceWorkbook, readTemplateWorkbook } = require("./src/excel");
const {
  disconnectOreCatalog,
  listCustomsOffices,
  listOreKinds,
  saveCustomsOffice,
} = require("./src/ore-catalog");

let mainWindow;
const execFileAsync = promisify(execFile);

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

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

ipcMain.handle("app:bootstrap", async () => {
  let oreKinds = [];
  let customsOffices = [];
  let catalogError = null;

  try {
    oreKinds = await listOreKinds();
    customsOffices = await listCustomsOffices();
  } catch (error) {
    catalogError = `Nie udalo sie odczytac slownikow aplikacji: ${error.message}`;
  }

  try {
    return {
      state: readTemplateWorkbook(SAMPLE_WORKBOOK_PATH),
      source: SAMPLE_WORKBOOK_PATH,
      oreKinds,
      customsOffices,
      catalogError,
    };
  } catch (error) {
    return {
      state: createEmptyState(),
      oreKinds,
      customsOffices,
      catalogError,
      error: `Nie udało się odczytać szablonu Trade_N.xls: ${error.message}`,
    };
  }
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

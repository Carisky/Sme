const path = require("path");
const fs = require("fs/promises");
const os = require("os");
const { pathToFileURL } = require("url");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { BrowserWindow } = require("electron");
const { normalizeState, suggestProjectName } = require("../../core");

const execFileAsync = promisify(execFile);

function createPdfFileName(state) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${suggestProjectName(state)}-${timestamp}.pdf`;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

async function createTemporaryPrintPdf(state, pdfBuffer) {
  const tempDir = path.join(os.tmpdir(), "sme-print-jobs");
  await fs.mkdir(tempDir, { recursive: true });

  const tempPdfPath = path.join(tempDir, createPdfFileName(state));
  await fs.writeFile(tempPdfPath, pdfBuffer);
  return tempPdfPath;
}

function scheduleTemporaryFileCleanup(filePath, delayMs = 120000) {
  if (!filePath) {
    return;
  }

  const cleanupTimer = setTimeout(() => {
    fs.unlink(filePath).catch(() => {});
  }, delayMs);

  if (typeof cleanupTimer.unref === "function") {
    cleanupTimer.unref();
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

function createPrintStatusSender(windowController) {
  return (payload) => {
    windowController.send("print:status", payload);
  };
}

async function capturePrinterJobNames(printerName) {
  return new Set(filterJobsForPrinter(await listWindowsPrintJobs(), printerName).map((job) => job.Name));
}

async function monitorPrintQueue(
  windowController,
  printerName,
  fallbackPageCount,
  jobsBeforeSnapshot = null
) {
  if (process.platform !== "win32") {
    return {
      printedPages: fallbackPageCount,
      totalPages: fallbackPageCount,
      monitored: false,
    };
  }

  const sendPrintStatus = createPrintStatusSender(windowController);
  const jobsBefore = jobsBeforeSnapshot || (await capturePrinterJobNames(printerName));

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

    await sleep(500);
  }

  return {
    printedPages: lastPrintedPages || fallbackPageCount,
    totalPages: lastTotalPages || fallbackPageCount,
    monitored: Boolean(trackedJobName),
  };
}

async function printPdfWithElectron(pdfPath, printer) {
  const pdfWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 1024,
    backgroundColor: "#ffffff",
    webPreferences: {
      sandbox: false,
      plugins: true,
    },
  });

  try {
    await pdfWindow.loadURL(pathToFileURL(pdfPath).href);
    await sleep(1200);

    await new Promise((resolve, reject) => {
      pdfWindow.webContents.print(
        {
          silent: true,
          printBackground: true,
          color: printer.colorSupported,
          landscape: false,
          pageSize: "A4",
          deviceName: printer.printerName || undefined,
          margins: {
            marginType: "none",
          },
        },
        (success, failureReason) => {
          if (success) {
            resolve();
            return;
          }

          reject(new Error(failureReason || "Nie udalo sie wydrukowac dokumentu PDF."));
        }
      );
    });
  } finally {
    if (!pdfWindow.isDestroyed()) {
      pdfWindow.destroy();
    }
  }
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
  const colorSupported = systemDefault?.colorSupported === false ? false : true;

  return {
    printerName,
    colorSupported,
  };
}

function createPrintService({ windowController }) {
  const sendPrintStatus = createPrintStatusSender(windowController);

  async function printCurrentPreviewToDefaultPrinter(state) {
    const mainWindow = windowController.getMainWindow();
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
      message: "Trwa przygotowanie PDF do wydruku.",
    });

    const pdfBuffer = await mainWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
      preferCSSPageSize: true,
    });

    let pdfPath = null;
    let pdfError = null;
    let printPdfPath = null;
    let shouldCleanupPrintPdf = false;

    if (normalizedState.print.savePdfAfterPrint) {
      try {
        const outputDir = normalizedState.print.pdfOutputDir;
        if (!outputDir) {
          throw new Error(
            "Wlaczono zapis PDF po wydruku, ale nie ustawiono folderu docelowego."
          );
        }

        await fs.mkdir(outputDir, { recursive: true });
        pdfPath = path.join(outputDir, createPdfFileName(normalizedState));
        await fs.writeFile(pdfPath, pdfBuffer);
        printPdfPath = pdfPath;
      } catch (error) {
        pdfError = error.message;
      }
    }

    if (!printPdfPath) {
      printPdfPath = await createTemporaryPrintPdf(normalizedState, pdfBuffer);
      shouldCleanupPrintPdf = true;
    }

    sendPrintStatus({
      phase: "spooling",
      printerName: printer.printerName || "domyslna drukarka systemowa",
      printedPages: 0,
      totalPages: fallbackPageCount,
      message: "Trwa wysylanie gotowego PDF do drukarki.",
    });

    const monitoredPrinterName = printer.printerName || "";
    const queueMonitorPromise = monitorPrintQueue(
      windowController,
      monitoredPrinterName,
      fallbackPageCount,
      await capturePrinterJobNames(monitoredPrinterName)
    );

    await printPdfWithElectron(printPdfPath, printer);

    const queueResult = await queueMonitorPromise;

    if (shouldCleanupPrintPdf) {
      scheduleTemporaryFileCleanup(printPdfPath);
    }

    return {
      success: true,
      printerName: printer.printerName || "domyslna drukarka systemowa",
      colorMode: printer.colorSupported ? "color" : "grayscale",
      pdfPath,
      pdfError,
      printedPages: queueResult.printedPages || fallbackPageCount,
      totalPages: queueResult.totalPages || fallbackPageCount,
    };
  }

  return {
    printCurrentPreviewToDefaultPrinter,
  };
}

module.exports = {
  createPrintService,
};

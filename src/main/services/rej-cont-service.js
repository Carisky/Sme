const { dialog } = require("electron");
const {
  createRejContPrismaClient,
  getRejContPrismaClient,
} = require("../../rej-cont/prisma");
const {
  createContainer,
  importContainers,
  listContainers,
} = require("../../rej-cont/store");
const {
  extractContainerNumbersFromWorkbook,
  inspectImportWorkbook,
} = require("../../rej-cont/excel-import");
const { updateContainers } = require("../../rej-cont/update-controller");

function isMissingContainerTableError(error) {
  const message = String(error?.message || "");
  return error?.code === "P2021" || /container/i.test(message) && /exist|does not/i.test(message);
}

function createRejContService({ windowController } = {}) {
  function getPrisma() {
    return getRejContPrismaClient();
  }

  function publishImportStatus(payload = {}) {
    if (!windowController?.send) {
      return;
    }

    windowController.send("rej-cont:status", {
      action: "import",
      ...payload,
    });
  }

  async function listDbContainers(options = {}) {
    try {
      return await listContainers(getPrisma(), options);
    } catch (error) {
      if (isMissingContainerTableError(error)) {
        throw new Error(
          "Tabela Container nie istnieje jeszcze w bazie rej-cont. Uruchom migracje rej-cont."
        );
      }

      throw error;
    }
  }

  async function saveDbContainer(record = {}) {
    try {
      return await createContainer(getPrisma(), {
        ...record,
        sourceKind: "MANUAL",
      });
    } catch (error) {
      if (isMissingContainerTableError(error)) {
        throw new Error(
          "Tabela Container nie istnieje jeszcze w bazie rej-cont. Uruchom migracje rej-cont."
        );
      }

      throw error;
    }
  }

  async function inspectImportFromDialog() {
    if (!windowController?.getMainWindow) {
      throw new Error("Okno aplikacji rej-cont nie jest gotowe.");
    }

    const result = await dialog.showOpenDialog(windowController.getMainWindow(), {
      title: "Wybierz plik Excel do importu kontenerow",
      properties: ["openFile"],
      filters: [{ name: "Excel", extensions: ["xlsx", "xlsm", "xls"] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    return {
      canceled: false,
      filePath,
      workbook: inspectImportWorkbook(filePath),
    };
  }

  async function importFromWorkbook(request = {}) {
    try {
      const extraction = extractContainerNumbersFromWorkbook(request.filePath, {
        sheetName: request.sheetName,
        columnIndex: request.columnIndex,
        terminalColumnIndex: request.terminalColumnIndex,
      });
      publishImportStatus({
        type: "progress",
        stage: "prepare",
        progress: 0,
        processedCount: 0,
        totalCount: extraction.uniqueCount,
        chunkIndex: 0,
        chunkCount: 0,
        createdCount: 0,
        existingCount: 0,
        message: `Przygotowano ${extraction.uniqueCount} kontenerow do importu. Terminal rozpoznano dla ${extraction.terminalResolvedCount}.`,
      });
      const imported = await importContainers(getPrisma(), {
        containers: extraction.containers,
        userProfile: request.userProfile,
        sourceKind: "IMPORT",
        sourceFileName: extraction.fileName,
        sourceSheetName: extraction.sheetName,
        chunkSize: 25,
        onProgress(payload) {
          publishImportStatus({
            type: "progress",
            ...payload,
          });
        },
      });

      publishImportStatus({
        type: "completed",
        stage: "done",
        progress: 100,
        processedCount: imported.importedCount,
        totalCount: imported.importedCount,
        chunkIndex: imported.chunkCount,
        chunkCount: imported.chunkCount,
        createdCount: imported.createdCount,
        existingCount: imported.existingCount,
        message: `Import zakonczony: ${imported.importedCount} kontenerow, nowe ${imported.createdCount}, istniejace ${imported.existingCount}, terminal rozpoznano dla ${imported.terminalResolvedCount}.`,
      });

      return {
        ...imported,
        filePath: extraction.filePath,
        fileName: extraction.fileName,
        columnIndex: extraction.columnIndex,
        columnLetter: extraction.columnLetter,
        header: extraction.header,
        terminalColumnIndex: extraction.terminalColumnIndex,
        terminalColumnLetter: extraction.terminalColumnLetter,
        terminalHeader: extraction.terminalHeader,
        extractedRows: extraction.totalRows,
        extractedNonEmptyCount: extraction.nonEmptyCount,
        extractedMatchedCount: extraction.matchedCount,
        extractedDuplicateCount: extraction.duplicateCount,
        extractedInvalidCount: extraction.invalidCount,
        extractedUniqueCount: extraction.uniqueCount,
        extractedTerminalResolvedCount: extraction.terminalResolvedCount,
      };
    } catch (error) {
      publishImportStatus({
        type: "failed",
        message: error.message,
      });
      if (isMissingContainerTableError(error)) {
        throw new Error(
          "Tabela Container nie istnieje jeszcze w bazie rej-cont. Uruchom migracje rej-cont."
        );
      }

      throw error;
    }
  }

  async function updateDbContainers(options = {}) {
    try {
      return await updateContainers(getPrisma(), options);
    } catch (error) {
      if (isMissingContainerTableError(error)) {
        throw new Error(
          "Tabela Container nie istnieje jeszcze w bazie rej-cont. Uruchom migracje rej-cont."
        );
      }

      throw error;
    }
  }

  return {
    createPrismaClient: createRejContPrismaClient,
    importFromWorkbook,
    inspectImportFromDialog,
    listDbContainers,
    saveDbContainer,
    updateDbContainers,
  };
}

module.exports = {
  createRejContService,
};

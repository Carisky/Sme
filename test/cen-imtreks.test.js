const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const fssync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const XLSX = require("xlsx");
const {
  exportCenImtreksComparisonWorkbook,
  exportCenImtreksRowsWorkbook,
  extractCenImtreksComparisonSelection,
  importCenImtreksWorkbook,
  inspectCenImtreksComparisonWorkbook,
} = require("../mini_apps/cen-imtreks/core/excel.cjs");
const { lookupContainers } = require("../src/wct-cen-lookup");
const {
  getProjectByName,
  listLookupRecords,
  repairLookupT1Values,
  saveLookupRecords,
  saveProjectState,
} = require("../src/cen-imtreks-db");

function resolveSampleWorkbookPath() {
  const samplesDir = path.join(__dirname, "..", "samples", "files");
  const fileName = fssync
    .readdirSync(samplesDir)
    .find((entry) => /^Rejestr zlecen 2026_/i.test(entry));
  if (!fileName) {
    throw new Error("Nie znaleziono pliku probki IMTREKS.");
  }

  return path.join(samplesDir, fileName);
}

async function main() {
  const progressEvents = [];
  const chunkResults = [];
  const lookupResult = await lookupContainers(
    ["ABCU1234567", "MSKU1234567", "TGHU1234567"],
    {
      chunkSize: 2,
      fetchImpl: async (_url, options) => {
        const requestedContainers = JSON.parse(String(options.body || "{}")).containers || [];
        return {
          ok: true,
          headers: {
            get: () => "application/json",
          },
          json: async () => ({
            map: Object.fromEntries(
              requestedContainers.map((containerNumber) => [
                containerNumber,
                {
                  cen: `CEN-${containerNumber}`,
                },
              ])
            ),
          }),
        };
      },
      onProgress: (payload) => {
        progressEvents.push(payload);
      },
      onChunkResult: (payload) => {
        chunkResults.push({
          chunkIndex: payload.chunkIndex,
          containers: payload.containers,
          size: payload.map.size,
        });
      },
    }
  );

  assert.equal(lookupResult.map.size, 3);
  assert.equal(progressEvents.filter((entry) => entry.phase === "start-chunk").length, 2);
  assert.equal(progressEvents.filter((entry) => entry.phase === "end-chunk").length, 2);
  assert.equal(progressEvents[0].processedContainers, 0);
  assert.equal(progressEvents.at(-1).processedContainers, 3);
  assert.equal(chunkResults.length, 2);
  assert.deepEqual(chunkResults[0].containers, ["ABCU1234567", "MSKU1234567"]);
  assert.equal(chunkResults[1].size, 1);

  const workbookPath = resolveSampleWorkbookPath();
  const importedState = importCenImtreksWorkbook(workbookPath);

  assert.deepEqual(
    importedState.sheets.map((sheet) => sheet.name),
    ["Stycze\u0144", "Luty", "Marzec"]
  );
  assert.equal(importedState.activeSheetId, importedState.sheets[0].id);
  assert.ok(importedState.sheets[0].rows.length > 100);
  assert.equal(importedState.sheets[0].rows[0].orderDate, "02.01.2026");
  assert.equal(importedState.sheets[0].rows[0].vesselDate, "02.01.2026");
  assert.equal(importedState.sheets[0].rows[0].containerNumber, "MRSU7575929");
  assert.equal(importedState.sheets[0].rows[0].customsOffice, "GDANSK DCT");
  assert.equal(importedState.sheets[0].rows[0].t1, "26PL322080NS2MCHM7");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sme-cen-imtreks-"));
  const dbPath = path.join(tempDir, "cen-imtreks.sqlite");

  try {
    const exportFilePath = path.join(tempDir, "widoczne-wiersze.xlsx");
    const exportSummary = exportCenImtreksRowsWorkbook(
      exportFilePath,
      [
        {
          sequenceNumber: "5",
          orderDate: "02.03.2026",
          vesselDate: "17.03.2026",
          folderName: "DCT GDANSK PF",
          containerNumber: "temu 3675786",
          blNumber: "CHN3033488",
          customsOffice: "GDANSK DCT",
          status: "iug",
          remarks: "WIORIN",
          sourceRowNumber: "6",
        },
      ],
      {
        sheetName: "Marzec",
      }
    );
    assert.equal(exportSummary.rowCount, 1);
    assert.equal(exportSummary.sheetName, "Marzec");

    const exportedWorkbook = XLSX.readFile(exportFilePath);
    const exportedSheet = exportedWorkbook.Sheets[exportedWorkbook.SheetNames[0]];
    const exportedRows = XLSX.utils.sheet_to_json(exportedSheet, { header: 1, defval: "" });
    assert.deepEqual(exportedRows[0], [
      "Lp.",
      "Data zlecenia",
      "Data statku",
      "Folder",
      "Container",
      "BL",
      "UC",
      "Status",
      "Stop",
      "T1",
      "Faktura",
      "Uwagi",
      "Src",
    ]);
    assert.equal(exportedRows[1][0], "5");
    assert.equal(exportedRows[1][4], "TEMU3675786");
    assert.equal(exportedRows[1][12], "6");

    const comparisonWorkbookPath = path.join(tempDir, "comparison-source.xlsx");
    const comparisonWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      comparisonWorkbook,
      XLSX.utils.aoa_to_sheet([
        ["Container Number", "Opis"],
        ["TRHU9692566", "match"],
        [" msku 1234567 ", "manual"],
        ["Brak", "ignore"],
        ["MSKU1234567", "duplicate"],
      ]),
      "Baza"
    );
    XLSX.utils.book_append_sheet(
      comparisonWorkbook,
      XLSX.utils.aoa_to_sheet([
        ["Kod", "Kontener"],
        ["1", "OOLU1111111"],
      ]),
      "Arkusz2"
    );
    XLSX.writeFile(comparisonWorkbook, comparisonWorkbookPath);

    const comparisonWorkbookInfo = inspectCenImtreksComparisonWorkbook(comparisonWorkbookPath);
    assert.equal(comparisonWorkbookInfo.selectedSheetName, "Baza");
    assert.equal(comparisonWorkbookInfo.selectedColumnKey, "A");
    assert.equal(comparisonWorkbookInfo.sheets[0].columns[0].header, "Container Number");

    const comparisonSelection = extractCenImtreksComparisonSelection(
      comparisonWorkbookPath,
      "Baza",
      "A"
    );
    assert.equal(comparisonSelection.comparison.sheetName, "Baza");
    assert.equal(comparisonSelection.comparison.columnKey, "A");
    assert.deepEqual(comparisonSelection.comparison.containers, [
      "MSKU1234567",
      "TRHU9692566",
    ]);

    const comparisonExportPath = path.join(tempDir, "do-faktur.xlsx");
    const comparisonExportSummary = exportCenImtreksComparisonWorkbook(
      comparisonExportPath,
      [
        {
          containerNumber: "TRHU9692566",
          statusLabel: "Do faktur",
          hasComparisonMatch: false,
          rowCount: 2,
          sheetLabel: "Luty, Marzec",
        },
        {
          containerNumber: "MSKU1234567",
          statusLabel: "Jest w bazie",
          hasComparisonMatch: true,
          rowCount: 1,
          sheetLabel: "Styczen",
        },
      ],
      {
        sheetName: "Do faktur",
      }
    );
    assert.equal(comparisonExportSummary.rowCount, 2);
    const comparisonExportedWorkbook = XLSX.readFile(comparisonExportPath);
    const comparisonExportedSheet =
      comparisonExportedWorkbook.Sheets[comparisonExportedWorkbook.SheetNames[0]];
    const comparisonExportedRows = XLSX.utils.sheet_to_json(comparisonExportedSheet, {
      header: 1,
      defval: "",
    });
    assert.deepEqual(comparisonExportedRows[0], [
      "Container",
      "Status",
      "W bazie",
      "Wierszy projektu",
      "Arkusze",
    ]);
    assert.equal(comparisonExportedRows[1][0], "TRHU9692566");
    assert.equal(comparisonExportedRows[1][2], "NIE");
    assert.equal(comparisonExportedRows[2][2], "TAK");

    const created = await saveProjectState(dbPath, {
      projectName: "IM Alpha",
      sourceFileName: path.basename(workbookPath),
      activeSheetId: "sheet-luty",
      view: {
        searchTerm: "TRHU",
        vesselDateMode: "list",
        vesselDateFrom: "2026-02-01",
        vesselDateTo: "2026-02-05",
        vesselDateSelected: ["2026-02-02", "2026-02-04"],
        hasT1: "without",
        status: "YARD",
        forceUpdate: true,
      },
      invoiceComparison: {
        filePath: comparisonWorkbookPath,
        fileName: path.basename(comparisonWorkbookPath),
        sheetName: "Baza",
        columnKey: "A",
        columnHeader: "Container Number",
        containers: ["trhu9692566", " msku 1234567 "],
      },
      sheets: [
        {
          id: "sheet-styczen",
          name: "Stycze\u0144",
          rows: [
            {
              containerNumber: " msku 1234567 ",
              t1: "T1-1",
            },
          ],
        },
        {
          id: "sheet-luty",
          name: "Luty",
          rows: [
            {
              containerNumber: "TRHU9692566",
              status: "YARD",
            },
          ],
        },
      ],
    });

    assert.ok(created.project.id > 0);
    assert.equal(created.project.projectName, "IM Alpha");
    assert.equal(created.project.rowCount, 2);
    assert.equal(created.state.activeSheetId, "sheet-luty");
    assert.equal(created.state.sheets[0].rows[0].containerNumber, "MSKU1234567");
    assert.equal(created.state.view.vesselDateMode, "list");
    assert.deepEqual(created.state.view.vesselDateSelected, ["2026-02-02", "2026-02-04"]);
    assert.equal(created.state.invoiceComparison.sheetName, "Baza");
    assert.deepEqual(created.state.invoiceComparison.containers, [
      "MSKU1234567",
      "TRHU9692566",
    ]);

    const reopened = await getProjectByName(dbPath, "im alpha");
    assert.ok(reopened);
    assert.equal(reopened.project.id, created.project.id);
    assert.equal(reopened.state.sheets.length, 2);
    assert.equal(reopened.state.sheets[1].name, "Luty");
    assert.equal(reopened.state.sheets[1].rows[0].containerNumber, "TRHU9692566");
    assert.equal(reopened.state.view.searchTerm, "TRHU");
    assert.equal(reopened.state.view.vesselDateMode, "list");
    assert.deepEqual(reopened.state.view.vesselDateSelected, ["2026-02-02", "2026-02-04"]);
    assert.equal(reopened.state.view.hasT1, "without");
    assert.equal(reopened.state.view.status, "YARD");
    assert.equal(reopened.state.view.forceUpdate, true);
    assert.equal(reopened.state.invoiceComparison.fileName, "comparison-source.xlsx");
    assert.deepEqual(reopened.state.invoiceComparison.containers, [
      "MSKU1234567",
      "TRHU9692566",
    ]);

    await saveLookupRecords(
      dbPath,
      [
        {
          containerNumber: "ABCU1111111",
          cen: "26PL322080NS2MCHM7",
          tState: "READY",
          stop: "N",
        },
        {
          containerNumber: "ABCU2222222",
          cen: "PL12345",
          tState: "READY",
          stop: "N",
        },
        {
          containerNumber: "ABCU3333333",
          cen: "26123PLXYZ",
          tState: "READY",
          stop: "N",
        },
        {
          containerNumber: "ABCU4444444",
          cen: "12plabc",
          tState: "READY",
          stop: "N",
        },
        {
          containerNumber: "ABCU5555555",
          cen: "",
          tState: "READY",
          stop: "N",
        },
      ],
      "lookup"
    );

    const repairSummary = await repairLookupT1Values(dbPath);
    assert.equal(repairSummary.scannedCount, 4);
    assert.equal(repairSummary.clearedCount, 2);

    const lookupRecords = await listLookupRecords(dbPath, {
      limit: 50,
    });
    const recordsByContainer = new Map(
      lookupRecords.map((record) => [record.containerNumber, record])
    );
    assert.equal(recordsByContainer.get("ABCU1111111")?.cen, "26PL322080NS2MCHM7");
    assert.equal(recordsByContainer.get("ABCU2222222")?.cen, "");
    assert.equal(recordsByContainer.get("ABCU3333333")?.cen, "");
    assert.equal(recordsByContainer.get("ABCU4444444")?.cen, "12plabc");
    assert.equal(recordsByContainer.get("ABCU5555555")?.cen, "");

    const secondRepairSummary = await repairLookupT1Values(dbPath);
    assert.equal(secondRepairSummary.scannedCount, 2);
    assert.equal(secondRepairSummary.clearedCount, 0);

    await assert.rejects(
      () =>
        saveProjectState(
          dbPath,
          {
            projectName: "IM Alpha",
          },
          {
            createOnly: true,
          }
        ),
      /juz istnieje/
    );

    console.log("cen-imtreks tests passed");
  } finally {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        break;
      } catch (error) {
        if (error?.code !== "EBUSY") {
          throw error;
        }

        if (attempt === 4) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const fssync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { importCenImtreksWorkbook } = require("../mini_apps/cen-imtreks/core/excel.cjs");
const { lookupContainers } = require("../src/wct-cen-lookup");
const { getProjectByName, saveProjectState } = require("../src/cen-imtreks-db");

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
  assert.equal(importedState.sheets[0].rows[0].containerNumber, "MRSU7575929");
  assert.equal(importedState.sheets[0].rows[0].customsOffice, "GDANSK DCT");
  assert.equal(importedState.sheets[0].rows[0].t1, "26PL322080NS2MCHM7");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sme-cen-imtreks-"));
  const dbPath = path.join(tempDir, "cen-imtreks.sqlite");

  try {
    const created = await saveProjectState(dbPath, {
      projectName: "IM Alpha",
      sourceFileName: path.basename(workbookPath),
      activeSheetId: "sheet-luty",
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

    const reopened = await getProjectByName(dbPath, "im alpha");
    assert.ok(reopened);
    assert.equal(reopened.project.id, created.project.id);
    assert.equal(reopened.state.sheets.length, 2);
    assert.equal(reopened.state.sheets[1].name, "Luty");
    assert.equal(reopened.state.sheets[1].rows[0].containerNumber, "TRHU9692566");

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

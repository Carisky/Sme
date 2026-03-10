const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  getProjectByName,
  listProjectSummaries,
  saveProjectState,
} = require("../src/wct-cen-db");

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sme-wct-cen-"));
  const dbPath = path.join(tempDir, "shared.sqlite");

  try {
    const created = await saveProjectState(dbPath, {
      projectName: "Alpha",
      sourceFileName: "FPL_63 PLAN.xlsx",
      rows: [
        {
          containerNumber: " mscu 1234567 ",
          cen: "CEN-1",
        },
      ],
    });

    assert.ok(created.project.id > 0);
    assert.equal(created.project.projectName, "Alpha");
    assert.equal(created.state.dbPath, dbPath);
    assert.equal(created.state.rows.length, 1);
    assert.equal(created.state.rows[0].containerNumber, "MSCU1234567");

    const listed = await listProjectSummaries(dbPath, {
      search: "alp",
      limit: 10,
    });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].projectName, "Alpha");
    assert.equal(listed[0].rowCount, 1);

    const updated = await saveProjectState(
      dbPath,
      {
        ...created.state,
        projectName: "Alpha Renamed",
        rows: [
          ...created.state.rows,
          {
            containerNumber: "TGHU9692566",
            stop: "STOP-2",
          },
        ],
      },
      {
        projectId: created.project.id,
      }
    );

    assert.equal(updated.project.id, created.project.id);
    assert.equal(updated.project.projectName, "Alpha Renamed");
    assert.equal(updated.state.rows.length, 2);

    const reopened = await getProjectByName(dbPath, "alpha renamed");
    assert.ok(reopened);
    assert.equal(reopened.project.id, created.project.id);
    assert.equal(reopened.state.rows.length, 2);
    assert.equal(reopened.state.rows[1].containerNumber, "TGHU9692566");

    await assert.rejects(
      () =>
        saveProjectState(
          dbPath,
          {
            projectName: "Alpha Renamed",
          },
          {
            createOnly: true,
          }
        ),
      /juz istnieje/
    );

    console.log("wct-cen db tests passed");
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

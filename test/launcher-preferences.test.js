const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function main() {
  const moduleUrl = pathToFileURL(
    path.resolve(__dirname, "..", "app", "launcher-preferences.mjs")
  ).href;
  const {
    countVisibleMiniApps,
    filterVisibleMiniApps,
    normalizeLauncherVisibility,
  } = await import(moduleUrl);

  assert.deepEqual(normalizeLauncherVisibility(), {
    hiddenMiniAppIds: [],
  });
  assert.deepEqual(
    normalizeLauncherVisibility({
      hiddenMiniAppIds: [" sme ", "", "wct-cen", "sme", null],
    }),
    {
      hiddenMiniAppIds: ["sme", "wct-cen"],
    }
  );

  const miniApps = [
    { id: "sme", name: "SME" },
    { id: "wct-cen", name: "WCT CEN" },
    { id: "cen-imtreks", name: "CEN IMTREKS" },
  ];

  assert.deepEqual(
    filterVisibleMiniApps(miniApps, {
      hiddenMiniAppIds: ["wct-cen"],
    }).map((entry) => entry.id),
    ["sme", "cen-imtreks"]
  );
  assert.equal(
    countVisibleMiniApps(miniApps, {
      hiddenMiniAppIds: ["sme", "cen-imtreks"],
    }),
    1
  );

  console.log("launcher preferences tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

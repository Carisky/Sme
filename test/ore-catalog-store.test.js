const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  createOreCatalogClient,
  deleteOreKind,
  saveOreKind,
  seedDefaultOreKinds,
} = require("../src/ore-catalog-store");

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sme-ore-catalog-"));
  const dbPath = path.join(tempDir, "catalog.sqlite");
  const prisma = createOreCatalogClient(dbPath);

  try {
    await seedDefaultOreKinds(prisma);

    const seededKinds = await prisma.oreKind.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    assert.ok(seededKinds.length > 0);

    const updated = await saveOreKind(prisma, {
      id: seededKinds[0].id,
      name: "Test ore kind renamed",
      defaultOreType: "aglomerowana",
      sortOrder: seededKinds[0].sortOrder,
    });
    assert.equal(updated.id, seededKinds[0].id);
    assert.equal(updated.name, "Test ore kind renamed");

    await seedDefaultOreKinds(prisma);

    const renamed = await prisma.oreKind.findUnique({
      where: { id: updated.id },
    });
    assert.equal(renamed.name, "Test ore kind renamed");
    assert.equal(renamed.defaultOreType, "aglomerowana");

    await prisma.oreKind.deleteMany();
    await seedDefaultOreKinds(prisma);
    assert.equal(await prisma.oreKind.count(), 0);

    const created = await saveOreKind(prisma, {
      name: "Custom ore kind",
      defaultOreType: "nieaglomerowana",
      sortOrder: 0,
    });
    assert.match(created.key, /^custom-custom-ore-kind/);

    await deleteOreKind(prisma, created.id);
    assert.equal(await prisma.oreKind.count(), 0);

    console.log("ore catalog store tests passed");
  } finally {
    await prisma.$disconnect();
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

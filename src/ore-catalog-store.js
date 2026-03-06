const { pathToFileURL } = require("url");
const { PrismaLibSql } = require("@prisma/adapter-libsql");
const { PrismaClient } = require("@prisma/client");
const DEFAULT_ORE_KINDS = require("./default-ore-kinds");

function createOreCatalogClient(databasePath) {
  const adapter = new PrismaLibSql({
    url: pathToFileURL(databasePath).href,
  });

  return new PrismaClient({ adapter });
}

async function ensureOreKindTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OreKind" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "key" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "defaultOreType" TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "OreKind_key_key" ON "OreKind"("key")'
  );
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "OreKind_name_key" ON "OreKind"("name")'
  );
}

async function seedDefaultOreKinds(prisma) {
  await ensureOreKindTable(prisma);

  for (const [index, oreKind] of DEFAULT_ORE_KINDS.entries()) {
    await prisma.oreKind.upsert({
      where: { key: oreKind.key },
      update: {
        name: oreKind.name,
        defaultOreType: oreKind.defaultOreType ?? null,
        sortOrder: index,
      },
      create: {
        key: oreKind.key,
        name: oreKind.name,
        defaultOreType: oreKind.defaultOreType ?? null,
        sortOrder: index,
      },
    });
  }
}

module.exports = {
  createOreCatalogClient,
  seedDefaultOreKinds,
};

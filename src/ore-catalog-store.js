const { pathToFileURL } = require("url");
const { PrismaLibSql } = require("@prisma/adapter-libsql");
const { PrismaClient } = require("@prisma/client");
const DEFAULT_ORE_KINDS = require("./default-ore-kinds");
const DEFAULT_CUSTOMS_OFFICES = require("./default-customs-offices");

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

async function ensureCustomsOfficeTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CustomsOffice" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "addressLine1" TEXT NOT NULL,
      "addressLine2" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "CustomsOffice_code_key" ON "CustomsOffice"("code")'
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

async function seedDefaultCustomsOffices(prisma) {
  await ensureCustomsOfficeTable(prisma);

  for (const [index, office] of DEFAULT_CUSTOMS_OFFICES.entries()) {
    await prisma.customsOffice.upsert({
      where: { code: office.code },
      update: {
        name: office.name,
        addressLine1: office.addressLine1,
        addressLine2: office.addressLine2,
        sortOrder: index,
      },
      create: {
        code: office.code,
        name: office.name,
        addressLine1: office.addressLine1,
        addressLine2: office.addressLine2,
        sortOrder: index,
      },
    });
  }
}

async function saveCustomsOffice(prisma, office) {
  await ensureCustomsOfficeTable(prisma);

  const payload = {
    code: String(office?.code || "").trim(),
    name: String(office?.name || "").trim(),
    addressLine1: String(office?.addressLine1 || "").trim(),
    addressLine2: String(office?.addressLine2 || "").trim(),
    sortOrder: Number.isFinite(Number(office?.sortOrder))
      ? Number(office.sortOrder)
      : 0,
  };

  if (!payload.code || !payload.name || !payload.addressLine1 || !payload.addressLine2) {
    throw new Error("Kod, nazwa i dwa wiersze adresu urzedu sa wymagane.");
  }

  if (office?.id) {
    return prisma.customsOffice.update({
      where: { id: Number(office.id) },
      data: payload,
    });
  }

  return prisma.customsOffice.create({
    data: payload,
  });
}

module.exports = {
  createOreCatalogClient,
  saveCustomsOffice,
  seedDefaultCustomsOffices,
  seedDefaultOreKinds,
};

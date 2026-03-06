const path = require("path");
const {
  createOreCatalogClient,
  seedDefaultOreKinds,
} = require("../src/ore-catalog-store");

function createPrismaClient() {
  const databasePath = path.join(__dirname, "dev.db");
  return createOreCatalogClient(databasePath);
}

async function main() {
  const prisma = createPrismaClient();

  try {
    await seedDefaultOreKinds(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

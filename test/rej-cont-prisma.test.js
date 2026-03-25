const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  createRejContPrismaClient,
  getRejContDatabaseUrl,
} = require("../src/rej-cont/prisma");
const {
  initializeRejContRuntimeEnv,
  resetRejContRuntimeEnvCache,
  resolveRejContEnvFilePath,
} = require("../src/rej-cont/env");

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sme-rej-cont-"));
  const testUrl = "postgresql://test_user:test_pass@127.0.0.1:5432/rej_cont_test?schema=public";
  const prodUrl = "postgresql://prod_user:prod_pass@127.0.0.1:5432/rej_cont_prod?schema=public";
  const originalEnv = {
    POSTGRES_DATABASE_URL: process.env.POSTGRES_DATABASE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
  };

  try {
    await fs.writeFile(path.join(tempDir, ".env.test"), `POSTGRES_DATABASE_URL=${testUrl}\n`, "utf8");
    await fs.writeFile(path.join(tempDir, ".env"), `POSTGRES_DATABASE_URL=${prodUrl}\n`, "utf8");

    resetRejContRuntimeEnvCache();
    assert.equal(
      resolveRejContEnvFilePath({
        projectRoot: tempDir,
        cwd: tempDir,
        execDir: tempDir,
        packaged: false,
      }),
      path.join(tempDir, ".env.test")
    );

    resetRejContRuntimeEnvCache();
    assert.equal(
      resolveRejContEnvFilePath({
        projectRoot: tempDir,
        cwd: tempDir,
        execDir: tempDir,
        packaged: true,
      }),
      path.join(tempDir, ".env")
    );

    resetRejContRuntimeEnvCache();
    initializeRejContRuntimeEnv({
      projectRoot: tempDir,
      cwd: tempDir,
      execDir: tempDir,
      packaged: false,
      cache: false,
    });
    assert.equal(
      getRejContDatabaseUrl({
        env: {
          projectRoot: tempDir,
          cwd: tempDir,
          execDir: tempDir,
          packaged: false,
          cache: false,
        },
      }),
      testUrl
    );

    resetRejContRuntimeEnvCache();
    initializeRejContRuntimeEnv({
      projectRoot: tempDir,
      cwd: tempDir,
      execDir: tempDir,
      packaged: true,
      cache: false,
    });
    assert.equal(
      getRejContDatabaseUrl({
        env: {
          projectRoot: tempDir,
          cwd: tempDir,
          execDir: tempDir,
          packaged: true,
          cache: false,
        },
      }),
      prodUrl
    );

    const prisma = createRejContPrismaClient({
      datasourceUrl: testUrl,
    });
    assert.equal(typeof prisma.$disconnect, "function");
    await prisma.$disconnect();

    console.log("rej-cont prisma tests passed");
  } finally {
    resetRejContRuntimeEnvCache();

    if (originalEnv.POSTGRES_DATABASE_URL === undefined) {
      delete process.env.POSTGRES_DATABASE_URL;
    } else {
      process.env.POSTGRES_DATABASE_URL = originalEnv.POSTGRES_DATABASE_URL;
    }

    if (originalEnv.DATABASE_URL === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalEnv.DATABASE_URL;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

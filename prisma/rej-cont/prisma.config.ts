import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";
import { getRejContDatasourceUrl } from "../config-utils";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(configDirectory, "..", "..");

export default defineConfig({
  schema: "schema.prisma",
  migrations: {
    path: "migrations",
  },
  datasource: {
    url: getRejContDatasourceUrl(projectRoot),
  },
});

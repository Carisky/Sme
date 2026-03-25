-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Terminal" AS ENUM ('BCT', 'DCT', 'GCT');

-- CreateTable
CREATE TABLE "Container" (
    "id" SERIAL NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "mrn" VARCHAR(40) NOT NULL,
    "stop" VARCHAR(255) NOT NULL,
    "lastRefreshTime" TIMESTAMP(0) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "terminalName" "Terminal" NOT NULL,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

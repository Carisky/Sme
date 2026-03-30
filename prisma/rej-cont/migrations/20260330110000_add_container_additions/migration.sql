-- CreateEnum
CREATE TYPE "ContainerAdditionSourceKind" AS ENUM ('MANUAL', 'IMPORT');

-- CreateTable
CREATE TABLE "ContainerAddition" (
    "id" SERIAL NOT NULL,
    "containerId" INTEGER NOT NULL,
    "fullName" VARCHAR(120) NOT NULL,
    "department" VARCHAR(120) NOT NULL,
    "sourceKind" "ContainerAdditionSourceKind" NOT NULL DEFAULT 'MANUAL',
    "sourceFileName" VARCHAR(255),
    "sourceSheetName" VARCHAR(120),
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContainerAddition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContainerAddition_containerId_idx" ON "ContainerAddition"("containerId");

-- AddForeignKey
ALTER TABLE "ContainerAddition"
ADD CONSTRAINT "ContainerAddition_containerId_fkey"
FOREIGN KEY ("containerId") REFERENCES "Container"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

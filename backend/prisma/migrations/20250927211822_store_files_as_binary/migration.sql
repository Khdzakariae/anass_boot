/*
  Warnings:

  - You are about to drop the column `motivation_letter_path` on the `ausbildung` table. All the data in the column will be lost.
  - You are about to drop the column `filePath` on the `documents` table. All the data in the column will be lost.
  - Added the required column `fileData` to the `documents` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ausbildung" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT 'N/A',
    "start_date" TEXT NOT NULL DEFAULT 'N/A',
    "vacancies" TEXT NOT NULL DEFAULT 'N/A',
    "phones" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT 'N/A',
    "emails" TEXT NOT NULL,
    "motivation_letter" BLOB,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "source" TEXT NOT NULL DEFAULT 'ausbildung',
    "requirements" TEXT DEFAULT 'N/A',
    "salary" TEXT DEFAULT 'N/A',
    "benefits" TEXT DEFAULT 'N/A',
    "duration" TEXT DEFAULT 'N/A',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ausbildung_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ausbildung" ("benefits", "created_at", "description", "duration", "emails", "id", "institution", "location", "phones", "requirements", "salary", "source", "start_date", "status", "title", "updated_at", "url", "userId", "vacancies") SELECT "benefits", "created_at", "description", "duration", "emails", "id", "institution", "location", "phones", "requirements", "salary", "source", "start_date", "status", "title", "updated_at", "url", "userId", "vacancies" FROM "ausbildung";
DROP TABLE "ausbildung";
ALTER TABLE "new_ausbildung" RENAME TO "ausbildung";
CREATE UNIQUE INDEX "ausbildung_url_userId_key" ON "ausbildung"("url", "userId");
CREATE TABLE "new_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileData" BLOB NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_documents" ("createdAt", "fileSize", "filename", "id", "mimeType", "originalName", "updatedAt", "userId") SELECT "createdAt", "fileSize", "filename", "id", "mimeType", "originalName", "updatedAt", "userId" FROM "documents";
DROP TABLE "documents";
ALTER TABLE "new_documents" RENAME TO "documents";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

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
    "motivation_letter_path" TEXT,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "source" TEXT NOT NULL DEFAULT 'ausbildung',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ausbildung_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ausbildung" ("created_at", "description", "emails", "id", "institution", "location", "motivation_letter_path", "phones", "start_date", "status", "title", "updated_at", "url", "userId", "vacancies") SELECT "created_at", "description", "emails", "id", "institution", "location", "motivation_letter_path", "phones", "start_date", "status", "title", "updated_at", "url", "userId", "vacancies" FROM "ausbildung";
DROP TABLE "ausbildung";
ALTER TABLE "new_ausbildung" RENAME TO "ausbildung";
CREATE UNIQUE INDEX "ausbildung_url_userId_key" ON "ausbildung"("url", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

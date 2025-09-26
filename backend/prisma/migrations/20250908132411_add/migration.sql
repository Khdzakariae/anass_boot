-- CreateTable
CREATE TABLE "ausbildung" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT 'N/A',
    "start_date" TEXT NOT NULL DEFAULT 'N/A',
    "vacancies" TEXT NOT NULL DEFAULT 'N/A',
    "description" TEXT NOT NULL DEFAULT 'N/A',
    "emails" TEXT NOT NULL,
    "phones" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "motivation_letter_path" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ausbildung_url_key" ON "ausbildung"("url");

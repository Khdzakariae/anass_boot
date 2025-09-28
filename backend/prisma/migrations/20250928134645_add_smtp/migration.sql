-- CreateTable
CREATE TABLE "user_integrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "geminiApiKey" TEXT,
    "geminiModel" TEXT DEFAULT 'gemini-1.5-flash',
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "smtpHost" TEXT DEFAULT 'smtp.gmail.com',
    "smtpPort" INTEGER DEFAULT 465,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "user_integrations_userId_key" ON "user_integrations"("userId");

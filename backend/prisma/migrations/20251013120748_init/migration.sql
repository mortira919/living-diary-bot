-- CreateTable
CREATE TABLE "User" (
    "firebaseUid" TEXT NOT NULL PRIMARY KEY,
    "telegramChatId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC'
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- CreateTable
CREATE TABLE "User" (
    "firebaseUid" TEXT NOT NULL PRIMARY KEY,
    "telegramChatId" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

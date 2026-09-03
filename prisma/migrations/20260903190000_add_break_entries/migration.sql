-- CreateTable
CREATE TABLE "break_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "breakStart" TIMESTAMP(3) NOT NULL,
    "breakEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "break_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "break_entries_userId_breakStart_idx" ON "break_entries"("userId", "breakStart");

-- AddForeignKey
ALTER TABLE "break_entries" ADD CONSTRAINT "break_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

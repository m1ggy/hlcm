-- CreateTable
CREATE TABLE "timesheet_break_deductions" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "minutesPerDay" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timesheet_break_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timesheet_break_deductions_userId_idx" ON "timesheet_break_deductions"("userId");

-- AddForeignKey
ALTER TABLE "timesheet_break_deductions" ADD CONSTRAINT "timesheet_break_deductions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_break_deductions" ADD CONSTRAINT "timesheet_break_deductions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


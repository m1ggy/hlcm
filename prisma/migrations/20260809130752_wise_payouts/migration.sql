-- CreateTable
CREATE TABLE "wise_recipients" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "legalType" TEXT NOT NULL,
    "wiseAccountId" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wise_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wise_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "sourceCurrency" TEXT NOT NULL,
    "sourceAmount" DOUBLE PRECISION NOT NULL,
    "targetCurrency" TEXT NOT NULL,
    "targetAmount" DOUBLE PRECISION NOT NULL,
    "wiseQuoteId" TEXT NOT NULL,
    "wiseTransferId" TEXT,
    "status" TEXT NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wise_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wise_recipients_userId_key" ON "wise_recipients"("userId");

-- CreateIndex
CREATE INDEX "wise_transactions_userId_idx" ON "wise_transactions"("userId");

-- AddForeignKey
ALTER TABLE "wise_recipients" ADD CONSTRAINT "wise_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wise_transactions" ADD CONSTRAINT "wise_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wise_transactions" ADD CONSTRAINT "wise_transactions_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

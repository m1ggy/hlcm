-- CreateEnum
CREATE TYPE "LoginDeviceType" AS ENUM ('DESKTOP', 'MOBILE', 'TABLET');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mobileLoginBlocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "login_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "method" TEXT NOT NULL,
    "reason" TEXT,
    "deviceType" "LoginDeviceType" NOT NULL,
    "browser" TEXT,
    "os" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_events_userId_createdAt_idx" ON "login_events"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

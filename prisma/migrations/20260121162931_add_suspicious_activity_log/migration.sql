-- CreateTable
CREATE TABLE "suspicious_activity_logs" (
    "id" TEXT NOT NULL,
    "hashed_ip" TEXT NOT NULL,
    "activity_type" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suspicious_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suspicious_activity_logs_hashed_ip_idx" ON "suspicious_activity_logs"("hashed_ip");

-- CreateIndex
CREATE INDEX "suspicious_activity_logs_timestamp_idx" ON "suspicious_activity_logs"("timestamp");

-- CreateIndex
CREATE INDEX "suspicious_activity_logs_activity_type_idx" ON "suspicious_activity_logs"("activity_type");

/*
  Warnings:

  - You are about to drop the `CheckIn` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Goal` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Task` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."CheckIn" DROP CONSTRAINT "CheckIn_goalId_fkey";

-- DropForeignKey
ALTER TABLE "public"."CheckIn" DROP CONSTRAINT "CheckIn_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Goal" DROP CONSTRAINT "Goal_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Task" DROP CONSTRAINT "Task_goalId_fkey";

-- DropTable
DROP TABLE "public"."CheckIn";

-- DropTable
DROP TABLE "public"."Goal";

-- DropTable
DROP TABLE "public"."Task";

-- DropTable
DROP TABLE "public"."User";

-- DropEnum
DROP TYPE "public"."GoalStatus";

-- DropEnum
DROP TYPE "public"."TaskStatus";

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."streaks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "streaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."goals" (
    "id" UUID NOT NULL,
    "streak_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "unit" TEXT,
    "per_day_target" DECIMAL(10,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."log_entries" (
    "id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "local_date" DATE NOT NULL,
    "value" DECIMAL(10,2),
    "done" BOOLEAN,
    "note" VARCHAR(280),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(6),

    CONSTRAINT "log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE INDEX "streaks_user_id_idx" ON "public"."streaks"("user_id");

-- CreateIndex
CREATE INDEX "goals_streak_id_idx" ON "public"."goals"("streak_id");

-- CreateIndex
CREATE INDEX "log_entries_goal_id_idx" ON "public"."log_entries"("goal_id");

-- CreateIndex
CREATE UNIQUE INDEX "log_entries_goal_id_local_date_key" ON "public"."log_entries"("goal_id", "local_date");

-- AddForeignKey
ALTER TABLE "public"."streaks" ADD CONSTRAINT "streaks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."goals" ADD CONSTRAINT "goals_streak_id_fkey" FOREIGN KEY ("streak_id") REFERENCES "public"."streaks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."log_entries" ADD CONSTRAINT "log_entries_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "goals"
ADD CONSTRAINT goals_type_check
CHECK ("type" IN ('binary', 'count'));


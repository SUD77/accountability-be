/*
  Warnings:

  - You are about to drop the column `streak_id` on the `goals` table. All the data in the column will be lost.
  - You are about to drop the column `edited_at` on the `log_entries` table. All the data in the column will be lost.
  - You are about to drop the `streaks` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `membership_id` to the `goals` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `goals` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `updated_at` to the `log_entries` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."GoalType" AS ENUM ('binary', 'count');

-- CreateEnum
CREATE TYPE "public"."GroupVisibility" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "public"."GroupStatus" AS ENUM ('draft', 'scheduled', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."MembershipRole" AS ENUM ('owner', 'member');

-- CreateEnum
CREATE TYPE "public"."MembershipStatus" AS ENUM ('active', 'left', 'removed');

-- CreateEnum
CREATE TYPE "public"."InviteStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

-- DropForeignKey
ALTER TABLE "public"."goals" DROP CONSTRAINT "goals_streak_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."streaks" DROP CONSTRAINT "streaks_user_id_fkey";

-- DropIndex
DROP INDEX "public"."goals_streak_id_idx";

-- AlterTable
ALTER TABLE "public"."goals" DROP COLUMN "streak_id",
ADD COLUMN     "membership_id" UUID NOT NULL,
DROP COLUMN "type",
ADD COLUMN     "type" "public"."GoalType" NOT NULL;

-- AlterTable
ALTER TABLE "public"."log_entries" DROP COLUMN "edited_at",
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;

-- DropTable
DROP TABLE "public"."streaks";

-- CreateTable
CREATE TABLE "public"."streak_groups" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "public"."GroupStatus" NOT NULL DEFAULT 'scheduled',
    "visibility" "public"."GroupVisibility" NOT NULL DEFAULT 'private',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "streak_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."group_memberships" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "public"."MembershipRole" NOT NULL DEFAULT 'member',
    "status" "public"."MembershipStatus" NOT NULL DEFAULT 'active',
    "member_timezone" TEXT NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."invites" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "inviter_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "public"."InviteStatus" NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_by_user_id" UUID,
    "accepted_at" TIMESTAMPTZ(6),

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "streak_groups_owner_id_idx" ON "public"."streak_groups"("owner_id");

-- CreateIndex
CREATE INDEX "group_memberships_group_id_idx" ON "public"."group_memberships"("group_id");

-- CreateIndex
CREATE INDEX "group_memberships_user_id_idx" ON "public"."group_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_memberships_group_id_user_id_key" ON "public"."group_memberships"("group_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "public"."invites"("token");

-- CreateIndex
CREATE INDEX "invites_group_id_idx" ON "public"."invites"("group_id");

-- CreateIndex
CREATE INDEX "invites_email_idx" ON "public"."invites"("email");

-- CreateIndex
CREATE INDEX "audit_events_entity_idx" ON "public"."audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "goals_membership_id_idx" ON "public"."goals"("membership_id");

-- AddForeignKey
ALTER TABLE "public"."streak_groups" ADD CONSTRAINT "streak_groups_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."group_memberships" ADD CONSTRAINT "group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."streak_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."group_memberships" ADD CONSTRAINT "group_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invites" ADD CONSTRAINT "invites_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."streak_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invites" ADD CONSTRAINT "invites_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invites" ADD CONSTRAINT "invites_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."goals" ADD CONSTRAINT "goals_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "public"."group_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

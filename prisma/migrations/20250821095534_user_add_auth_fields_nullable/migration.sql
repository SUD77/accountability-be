-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "display_name" TEXT,
ADD COLUMN     "last_login_at" TIMESTAMPTZ(6),
ADD COLUMN     "password_hash" TEXT;

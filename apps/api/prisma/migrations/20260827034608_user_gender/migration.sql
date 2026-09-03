-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "gender" "Gender";

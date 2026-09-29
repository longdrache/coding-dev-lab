-- AlterTable
--
-- Migration **additive**: chỉ thêm cột, không đụng dòng nào. `@default(false)`
-- nên 56 bài đã có sẵn trong DB tự động là bài thường — không cần backfill, không
-- cần ghi đè dữ liệu, và lần chạy lại trên DB đã có cột cũng chỉ cần bỏ qua.
--
-- Không có index: cột này chỉ được đọc cùng lúc với `slug`/`id` (đã unique) nên
-- một index riêng chỉ tốn ghi thêm mà không làm query nào nhanh hơn.
ALTER TABLE "Problem" ADD COLUMN     "isVip" BOOLEAN NOT NULL DEFAULT false;

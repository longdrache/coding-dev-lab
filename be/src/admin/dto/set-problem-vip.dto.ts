import { IsBoolean } from 'class-validator';

/**
 * Body của `PATCH /api/admin/problems/:slug/vip` — cờ VIP của **một bài có sẵn**.
 *
 * Cố ý tách khỏi `CreateProblemDto` và không nhét `isVip` vào đó. Ba lý do, đều
 * đã có tiền lệ trong repo:
 *
 * 1. `PUT /problems/:slug` dùng chung `CreateProblemDto` và ghi đè gần hết cột
 *    của bài. Nếu `isVip` nằm trong DTO đó thì nó đi vào **mọi** lần sửa bài, kể
 *    cả lúc admin không đụng tới cờ — cờ VIP trở thành thứ có thể bị ghi đè
 *    ngoài ý muốn bởi một form không liên quan.
 * 2. Bề mặt quyền: đổi cờ VIP là hành động phân phối nội dung, tách riêng thì
 *    ai đó gỡ nó khỏi form tạo/sửa bài cũng không đụng tới quyền này.
 * 3. `create-problem.dto.ts` đang có thay đổi cục bộ chưa commit của chủ repo;
 *    sửa vào đó là trộn hai việc vào một commit.
 *
 * `@IsBoolean()` — không phải `@Transform(() => Boolean)`. Người dùng cuối hay
 * gửi `isVip: "false"` từ form: `"false"` là chuỗi **truthy**, nên ép kiểu sẽ biến
 * lệnh "gỡ cờ VIP" thành "bật cờ VIP". Từ chối thành 400 an toàn hơn nhiều.
 */
export class SetProblemVipDto {
  @IsBoolean({ message: 'isVip phải là boolean (true/false), không phải chuỗi' })
  isVip!: boolean;
}

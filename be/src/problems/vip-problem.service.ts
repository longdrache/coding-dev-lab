import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.ts';
import type { UserRole } from '../auth/auth.types.ts';
import { assertVipProblemAllowed, readIsVipFlag } from './vip-problem.policy.ts';

/**
 * Cổng hỏi "slug này có phải bài VIP không, và người đang xem có mở được không".
 *
 * Tách thành service riêng vì **ba** module ngoài `problems` cũng phải hỏi
 * (`submissions`, `progress`), mà `ProblemsService` thì gắn chặt với `Judge0Service`
 * nên không phải ở đâu cũng import được. Seam này chỉ cần `DatabaseService`.
 *
 * `assertSlugAllowed` **fail-closed**: slug không tồn tại trả `false` chứ không
 * ném, vì "không có bài" là câu trả lời của `404` chứ không phải của chính sách
 * VIP — nếu ném ở đây thì một slug sai bị báo nhầm là bài khoá.
 */
@Injectable()
export class VipProblemService {
  constructor(private readonly db: DatabaseService) {}

  async isVipSlug(slug: string): Promise<boolean> {
    const row = await this.db.problem.findUnique({
      where: { slug },
      select: { isVip: true },
    });
    return readIsVipFlag(row?.isVip);
  }

  /**
   * @throws 403 `problem_vip_only` khi slug là bài VIP và `role` trong token không
   * phải `vip`/`admin`. `role` lấy từ claim trong access token — xem
   * `vip-problem.policy.ts` để biết vì sao cấm đọc `vipExpiresAt` ở đây.
   */
  async assertSlugAllowed(
    slug: string,
    role: UserRole | null | undefined,
  ): Promise<void> {
    assertVipProblemAllowed(await this.isVipSlug(slug), role);
  }
}

/**
 * Sinh cặp khóa RSA dùng một lần cho job Playwright e2e trên CI.
 *
 * Vì sao cần: server thật (`pnpm start`) ký access token bằng
 * `ADMIN_JWT_PRIVATE_KEY` (`be/src/auth/tokens.ts` — thiếu là
 * `POST /api/auth/login` trả 500). Suite `be/test/api.e2e-spec.ts` tự sinh
 * khóa trong tiến trình nên không cần env, nhưng Playwright bắn HTTP vào
 * server thật nên bắt buộc phải cấp qua env.
 *
 * Vì sao sinh mới mỗi lần chạy thay vì dùng secret cố định: key này chỉ sống
 * trong một job CI, không ký bất cứ thứ gì cần xác minh lâu dài — token hết
 * hạn sau 15 phút. Không cần quản lý secret, không lo lộ.
 *
 * Cách dùng trong CI (ghi vào `$GITHUB_ENV` để các step sau dùng):
 *   node scripts/gen-ci-jwt-keys.mjs >> "$GITHUB_ENV"
 *
 * Định dạng multiline theo quy ước của GitHub Actions:
 *   ADMIN_JWT_PRIVATE_KEY<<EOF
 *   <PEM pkcs8>
 *   EOF
 */
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicExponent: 0x10001,
});

const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

process.stdout.write(`ADMIN_JWT_PRIVATE_KEY<<EOF\n${privPem}EOF\n`);
process.stdout.write(`ADMIN_JWT_PUBLIC_KEY<<EOF\n${pubPem}EOF\n`);

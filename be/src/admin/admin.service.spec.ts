import { AdminService } from './admin.service.ts';

describe('AdminService login', () => {
  it('rejects bad password', async () => {
    process.env.ADMIN_EMAIL = 'a@a.com';
    process.env.ADMIN_PASSWORD = 'secret';
    process.env.JWT_SECRET = 'test-secret-32-chars-long-xxxxxx';
    const s = new AdminService();
    await expect(s.login('a@a.com', 'wrong')).rejects.toThrow();
  });
});

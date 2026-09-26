import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.ts';
import { AppService } from './app.service.ts';
import { ClerkAuthGuard } from './auth/clerk-auth.guard.ts';
import { RolesGuard } from './auth/roles.guard.ts';
import { AdminGuard } from './admin/admin.guard.ts';
import { AdminService } from './admin/admin.service.ts';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        ClerkAuthGuard,
        RolesGuard,
        AdminGuard,
        { provide: AdminService, useValue: {} },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});

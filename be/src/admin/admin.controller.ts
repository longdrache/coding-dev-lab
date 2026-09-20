import {
  Body,
  Controller,
  Post,
  Res,
  UseGuards,
  Get,
  Req,
  Delete,
  Param,
  Put,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service.ts';
import { AdminGuard } from './admin.guard.ts';
import { CreateProblemDto } from './dto/create-problem.dto.ts';
import type { Response, Request } from 'express';

@Controller('api/admin')
export class AdminController {
  constructor(private svc: AdminService) {}

  @Post('login')
  async login(@Body() b: { email: string; password: string }, @Res({ passthrough: true }) res: Response) {
    const token = await this.svc.login(b.email, b.password);
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    return { ok: true };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('admin_token', { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@Req() req: Request) {
    return (req as any).admin;
  }

  @Get('stats')
  @UseGuards(AdminGuard)
  getStats() {
    return this.svc.getStats();
  }

  @Get('qna')
  @UseGuards(AdminGuard)
  listQna() {
    return this.svc.listQna();
  }

  @Delete('qna/:id')
  @UseGuards(AdminGuard)
  deleteQna(@Param('id') id: string) {
    return this.svc.deleteQna(id);
  }

  @Get('users')
  @UseGuards(AdminGuard)
  listUsers(@Req() req: Request) {
    const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const q = url.searchParams.get("q") ?? url.searchParams.get("query") ?? undefined;
    return this.svc.listUsers({ limit, offset, query: q });
  }

  @Get('problems')
  @UseGuards(AdminGuard)
  listProblems() {
    return this.svc.listProblems();
  }

  @Get('problems/:slug')
  @UseGuards(AdminGuard)
  getProblem(@Param('slug') slug: string) {
    return this.svc.getProblem(slug);
  }

  @Post('problems')
  @UseGuards(AdminGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }))
  createProblem(@Body() dto: CreateProblemDto) {
    return this.svc.createProblem(dto);
  }

  @Delete('problems/:slug')
  @UseGuards(AdminGuard)
  deleteProblem(@Param('slug') slug: string) {
    return this.svc.deleteProblem(slug);
  }

  @Put('problems/:slug')
  @UseGuards(AdminGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }))
  updateProblem(@Param('slug') slug: string, @Body() dto: CreateProblemDto) {
    return this.svc.updateProblem(slug, dto);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Judge0Service } from './judge0.service.ts';
import type {
  BatchSubmissionItem,
  CreateSubmissionInput,
} from './judge0.service.ts';
import { ClerkAuthGuard } from './auth/clerk-auth.guard.ts';
import { Roles } from './auth/roles.decorator.ts';
import { RolesGuard } from './auth/roles.guard.ts';

const MAX_BATCH_SIZE = 10;
const MAX_SOURCE_CODE_LENGTH = 64_000;

function assertValidItem(item: BatchSubmissionItem) {
  if (!item?.source_code || typeof item?.language_id !== 'number') {
    throw new BadRequestException(
      'mỗi submission cần language_id và source_code',
    );
  }
  if (item.source_code.length > MAX_SOURCE_CODE_LENGTH) {
    throw new BadRequestException(
      `source_code tối đa ${MAX_SOURCE_CODE_LENGTH} ký tự`,
    );
  }
}

@Controller('api/submissions')
@UseGuards(ClerkAuthGuard, RolesGuard)
@Roles('user', 'admin', 'vip')
export class Judge0Controller {
  constructor(private readonly judge0Service: Judge0Service) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createSubmission(@Body() body: CreateSubmissionInput) {
    if (!body?.source_code || typeof body.language_id !== 'number') {
      throw new BadRequestException('language_id và source_code là bắt buộc');
    }
    assertValidItem(body);

    return this.judge0Service.createSubmission(body);
  }

  @Post('batch')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createBatchSubmissions(@Body() body: { submissions?: BatchSubmissionItem[] }) {
    const submissions = body?.submissions;
    if (!Array.isArray(submissions) || submissions.length === 0) {
      throw new BadRequestException('submissions phải là mảng không rỗng');
    }
    if (submissions.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(
        `tối đa ${MAX_BATCH_SIZE} submissions mỗi batch`,
      );
    }
    for (const item of submissions) {
      assertValidItem(item);
    }

    return this.judge0Service.createBatchSubmissions(submissions);
  }

  @Get('batch')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  getBatchSubmissions(@Query('tokens') tokens?: string) {
    const list = (tokens ?? '')
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean);
    if (list.length === 0) {
      throw new BadRequestException('tokens là bắt buộc');
    }
    if (list.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(
        `tối đa ${MAX_BATCH_SIZE} tokens mỗi lần`,
      );
    }

    return this.judge0Service.getBatchSubmissions(list);
  }

  @Get(':token')
  getSubmission(@Param('token') token: string) {
    return this.judge0Service.getSubmission(token);
  }
}

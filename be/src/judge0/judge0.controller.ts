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
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '../common/throttle.guard.ts';
import { Judge0Service } from './judge0.service.ts';
import type {
  BatchSubmissionItem,
  CreateSubmissionInput,
} from './judge0.service.ts';
import { AuthGuard } from '../auth/auth.guard.ts';
import { Roles } from '../auth/roles.decorator.ts';
import { RolesGuard } from '../auth/roles.guard.ts';

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

@ApiTags('judge0')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('api/submissions')
@UseGuards(AuthGuard)
export class Judge0Controller {
  constructor(private readonly judge0Service: Judge0Service) {}

  @Post()
  @ApiOperation({ summary: 'Chạy thử 1 submission trên Judge0 (không lưu lịch sử)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['language_id', 'source_code'],
      properties: {
        language_id: { type: 'number', example: 71, description: '71 = Python 3.' },
        source_code: { type: 'string', example: 'print(1)', description: 'Tối đa 64.000 ký tự.' },
        stdin: { type: 'string', example: '' },
      },
    },
  })
  @ApiResponse({ status: 201, description: '`{ token }` để poll.' })
  @ApiResponse({ status: 400, description: 'Thiếu/sai language_id, source_code, hoặc quá dài.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  @ApiResponse({ status: 429, description: 'Quá 20 req/phút.' })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createSubmission(@Body() body: CreateSubmissionInput) {
    if (!body?.source_code || typeof body.language_id !== 'number') {
      throw new BadRequestException('language_id và source_code là bắt buộc');
    }
    assertValidItem(body);

    return this.judge0Service.createSubmission(body);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Chạy thử tối đa 10 submissions một batch' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['submissions'],
      properties: {
        submissions: {
          type: 'array',
          maxItems: 10,
          items: {
            type: 'object',
            required: ['language_id', 'source_code'],
            properties: {
              language_id: { type: 'number', example: 71 },
              source_code: { type: 'string', example: 'print(1)' },
              stdin: { type: 'string', example: '' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Mảng `{ token }` theo đúng thứ tự gửi.' })
  @ApiResponse({ status: 400, description: 'Mảng rỗng, quá 10, hoặc item thiếu/sai trường.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  @ApiResponse({ status: 429, description: 'Quá 20 req/phút.' })
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
  @ApiOperation({ summary: 'Poll kết quả batch (tối đa 10 tokens)' })
  @ApiQuery({ name: 'tokens', type: String, example: 't1,t2', description: 'Danh sách token cách nhau bằng dấu phẩy.' })
  @ApiResponse({ status: 200, description: '`{ submissions[] }` kèm stdout/stderr/status từng cái.' })
  @ApiResponse({ status: 400, description: 'Thiếu tokens hoặc quá 10.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  @ApiResponse({ status: 429, description: 'Quá 100 req/phút.' })
  // Xem ghi chú ở `auth.controller.ts` (`refresh`): 120/phút từng là code chết vì
  // khi tầng đó biến mất.
  @Throttle({ default: { limit: 100, ttl: 60_000 } })
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
  @ApiOperation({ summary: 'Lấy kết quả 1 submission theo token' })
  @ApiParam({ name: 'token', type: String, example: 't1' })
  @ApiResponse({ status: 200, description: 'Submission kèm stdout/stderr/status.' })
  @ApiResponse({ status: 401, description: 'Thiếu/sai phiên đăng nhập.' })
  @ApiResponse({ status: 404, description: 'Token không tồn tại trên Judge0.' })
  getSubmission(@Param('token') token: string) {
    return this.judge0Service.getSubmission(token);
  }
}

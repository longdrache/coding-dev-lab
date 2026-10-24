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
  @ApiOperation({ summary: 'Run a single submission on Judge0 without saving it to history' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['language_id', 'source_code'],
      properties: {
        language_id: { type: 'number', example: 71, description: '71 = Python 3.' },
        source_code: { type: 'string', example: 'print(1)', description: 'Maximum 64,000 characters.' },
        stdin: { type: 'string', example: '' },
      },
    },
  })
  @ApiResponse({ status: 201, description: '`{ token }` to poll for the result.' })
  @ApiResponse({ status: 400, description: 'language_id or source_code is missing or invalid, or the source code exceeds the size limit.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded: 20 requests per minute.' })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createSubmission(@Body() body: CreateSubmissionInput) {
    if (!body?.source_code || typeof body.language_id !== 'number') {
      throw new BadRequestException('language_id và source_code là bắt buộc');
    }
    assertValidItem(body);

    return this.judge0Service.createSubmission(body);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Run up to 10 submissions in a batch' })
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
  @ApiResponse({ status: 201, description: 'Array of `{ token }` values in the same order as the submitted items.' })
  @ApiResponse({ status: 400, description: 'The array is empty, contains more than 10 items, or an item has missing or invalid fields.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded: 20 requests per minute.' })
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
  @ApiOperation({ summary: 'Poll batch results (up to 10 tokens)' })
  @ApiQuery({ name: 'tokens', type: String, example: 't1,t2', description: 'Comma-separated list of submission tokens.' })
  @ApiResponse({ status: 200, description: '`{ submissions[] }` with stdout, stderr, and status for each submission.' })
  @ApiResponse({ status: 400, description: 'The tokens parameter is missing or contains more than 10 tokens.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded: 100 requests per minute.' })
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
  @ApiOperation({ summary: 'Get a submission result by token' })
  @ApiParam({ name: 'token', type: String, example: 't1' })
  @ApiResponse({ status: 200, description: 'Submission result, including stdout, stderr, and status.' })
  @ApiResponse({ status: 401, description: 'Session is missing or invalid.' })
  @ApiResponse({ status: 404, description: 'The token does not exist on Judge0.' })
  getSubmission(@Param('token') token: string) {
    return this.judge0Service.getSubmission(token);
  }
}

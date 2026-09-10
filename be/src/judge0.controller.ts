import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { Judge0Service } from './judge0.service.js';
import type { CreateSubmissionInput } from './judge0.service.js';

@Controller('api/submissions')
export class Judge0Controller {
  constructor(private readonly judge0Service: Judge0Service) {}

  @Post()
  createSubmission(@Body() body: CreateSubmissionInput) {
    if (!body?.source_code || typeof body.language_id !== 'number') {
      throw new BadRequestException('language_id và source_code là bắt buộc');
    }

    return this.judge0Service.createSubmission(body);
  }

  @Get(':token')
  getSubmission(@Param('token') token: string) {
    return this.judge0Service.getSubmission(token);
  }
}

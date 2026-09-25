import { Module } from '@nestjs/common';
import { Judge0Service } from './judge0.service.ts';
import { Judge0Controller } from './judge0.controller.ts';


@Module({
controllers:[Judge0Controller],
  providers: [Judge0Service],
  
})
export class Judge0Module {}

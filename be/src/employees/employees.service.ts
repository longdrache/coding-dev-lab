import { Injectable } from '@nestjs/common';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { Prisma } from '../generated/prisma/client.ts';
import { DatabaseService } from '../database/database.service.ts';

@Injectable()
export class EmployeesService {
  constructor(private readonly databaseService: DatabaseService) {}
  create(createEmployeeDto: Prisma.UserCreateInput) {
    return this.databaseService.user.create({
      data: createEmployeeDto,
    });
  }

  findAll() {
    return this.databaseService.user.findMany();
  }

  findOne(id: number) {
    return `This action returns a #${id} employee`;
  }

  update(id: number, updateEmployeeDto: UpdateEmployeeDto) {
    return `This action updates a #${id} employee`;
  }

  remove(id: number) {
    return `This action removes a #${id} employee`;
  }
}

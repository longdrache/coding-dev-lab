import {
  IsString,
  IsNotEmpty,
  Matches,
  IsIn,
  IsOptional,
  IsArray,
  ValidateNested,
  IsObject,
  IsInt,
  Min,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TestDto {
  @IsString()
  @IsNotEmpty({ message: 'input không được rỗng' })
  input!: string;

  @IsString()
  // output được phép rỗng (ví dụ bài không yêu cầu in gì)
  output!: string;
}

export class CreateProblemDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must match /^[a-z0-9-]+$/',
  })
  slug!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsString()
  @IsIn(['Dễ', 'Trung bình', 'Khó'], {
    message: 'difficulty must be one of Dễ, Trung bình, Khó',
  })
  difficulty!: 'Dễ' | 'Trung bình' | 'Khó';

  @IsString()
  @IsNotEmpty({ message: 'topic should not be empty' })
  topic!: string;

  @IsArray()
  @ArrayMinSize(3, { message: 'tests phải có đúng 3 test visible' })
  @ArrayMaxSize(3, { message: 'tests phải có đúng 3 test visible' })
  @ValidateNested({ each: true })
  @Type(() => TestDto)
  tests!: { input: string; output: string }[];

  @IsArray()
  @ArrayMinSize(10, { message: 'hiddenTests phải có đúng 10 test ẩn' })
  @ArrayMaxSize(10, { message: 'hiddenTests phải có đúng 10 test ẩn' })
  @ValidateNested({ each: true })
  @Type(() => TestDto)
  hiddenTests!: { input: string; output: string }[];

  @IsOptional()
  @IsObject()
  starterCodes?: Record<string,string>;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Type(() => Number)
  timeLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Type(() => Number)
  memoryLimit?: number;

  // Optional full fields with defaults for Problem model
  @IsOptional()
  @IsString()
  inputFormat?: string;

  @IsOptional()
  @IsString()
  outputFormat?: string;

  @IsOptional()
  @IsArray()
  constraints?: string[] | unknown;

  @IsOptional()
  @IsArray()
  examples?: unknown[];
}

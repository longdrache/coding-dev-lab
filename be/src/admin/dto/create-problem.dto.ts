export class CreateProblemDto {
  slug!: string;
  title!: string;
  description!: string;
  difficulty!: 'Dễ' | 'Trung bình' | 'Khó';
  topic!: string;
  tests!: { input: string; output: string }[];
  hiddenTests?: { input: string; output: string }[];
  starterCodes?: Record<string, string>;
  timeLimit?: number;
  memoryLimit?: number;
}

import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class AppService implements OnModuleInit {
  onModuleInit() {
    console.log(process.env.DISABLE_RATE_LIMIT);
  }
  getHello(): string {
    return 'Hello World!';
  }
}

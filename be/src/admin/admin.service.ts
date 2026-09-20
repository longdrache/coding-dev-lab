import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminService {
  async verifyLogin(_e: string, _p: string) {
    return false;
  }

  signJwt() {
    return '';
  }

  verifyJwt(_t: string) {
    return null;
  }
}

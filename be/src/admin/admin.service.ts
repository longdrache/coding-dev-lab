import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AdminService {
  async login(email: string, password: string): Promise<string> {
    const expEmail = process.env.ADMIN_EMAIL;
    const hash = process.env.ADMIN_PASSWORD_HASH;
    const plain = process.env.ADMIN_PASSWORD;
    const secret = process.env.JWT_SECRET;
    if (!expEmail || !secret) throw new UnauthorizedException('Missing admin env');
    if (email !== expEmail) throw new UnauthorizedException('Sai tài khoản');
    let ok = false;
    if (hash) ok = await bcrypt.compare(password, hash);
    else if (plain) ok = password === plain;
    else throw new UnauthorizedException('Missing password env');
    if (!ok) throw new UnauthorizedException('Sai mật khẩu');
    return jwt.sign({ sub: 'admin', role: 'admin' }, secret, { expiresIn: '7d' });
  }

  verifyJwt(token: string): any {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new UnauthorizedException('Missing JWT secret');
    return jwt.verify(token, secret) as any;
  }

  // stubs kept for backward compat with scaffold (unused but referenced in plan)
  async verifyLogin(_e: string, _p: string) {
    return false;
  }

  signJwt() {
    return '';
  }
}

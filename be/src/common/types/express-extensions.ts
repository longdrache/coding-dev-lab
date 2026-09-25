import 'express';

declare global {
  namespace Express {
    interface Request {
      body: any;
      rawBody?: Buffer;
      url: string;
      headers: any;
      cookies: Record<string, string>;
      cookie: Record<string, string>;
    }

    interface Response {
      cookie(name: string, value: string, options?: CookieOptions): this;
      clearCookie(name: string, options?: CookieOptions): this;
    }

    interface CookieOptions {
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'lax' | 'strict' | 'none';
      maxAge?: number;
      path?: string;
      domain?: string;
      signed?: boolean;
    }
  }
}
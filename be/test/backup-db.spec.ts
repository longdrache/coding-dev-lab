import { afterEach, describe, expect, it } from 'vitest';
import { buildDumpSql, buildInsert, resolveDsn, toSqlLiteral } from '../scripts/backup-db.ts';

describe('toSqlLiteral', () => {
  it('NULL cho null va undefined', () => {
    expect(toSqlLiteral(null)).toBe('NULL');
    expect(toSqlLiteral(undefined)).toBe('NULL');
  });

  it('so, boolean, bigint ra dung dang', () => {
    expect(toSqlLiteral(42)).toBe('42');
    expect(toSqlLiteral(-1.5)).toBe('-1.5');
    expect(toSqlLiteral(0)).toBe('0');
    expect(toSqlLiteral(true)).toBe('TRUE');
    expect(toSqlLiteral(false)).toBe('FALSE');
    expect(toSqlLiteral(10n)).toBe('10');
  });

  it('NaN/Infinity bi tu choi thay vi ghi SQL hong', () => {
    expect(() => toSqlLiteral(NaN)).toThrow();
    expect(() => toSqlLiteral(Infinity)).toThrow();
  });

  it('nhay don duoc nhan doi - chong SQL injection qua du lieu', () => {
    expect(toSqlLiteral("O'Brien")).toBe("'O''Brien'");
    expect(toSqlLiteral("'; DROP TABLE \"User\"; --")).toBe(
      "'''; DROP TABLE \"User\"; --'",
    );
  });

  it('backslash escape de khong hong khi bo standard_conforming_strings', () => {
    expect(toSqlLiteral('a\\b')).toBe("'a\\\\b'");
  });

  it('Date thanh ISO, Buffer thanh hex', () => {
    expect(toSqlLiteral(new Date('2026-01-02T03:04:05.000Z'))).toBe("'2026-01-02T03:04:05.000Z'");
    expect(toSqlLiteral(Buffer.from([0xde, 0xad]))).toBe("'\\xdead'");
  });

  it('mang thanh literal mang cua Postgres; phan tu chuoi luon duoc boc nhay kép', () => {
    // Postgres chap nhan ca hai dang, nhung boc nhay la an toan hon: gia tri chua
    // dau phay hay khoang trang se khong lam hong mang.
    expect(toSqlLiteral(['a', 'b'])).toBe('\'{"a","b"}\'');
    expect(toSqlLiteral(['a,b', 'c'])).toBe('\'{"a,b","c"}\'');
    expect(toSqlLiteral([1, null, true])).toBe('\'{1,NULL,t}\'');
  });
});

describe('buildInsert', () => {
  const cols = ['id', 'email', 'active'];

  it('ghep cot va gia tri dung thu tu', () => {
    expect(buildInsert('User', cols, { id: 1, email: 'a@b.co', active: true })).toBe(
      `INSERT INTO "User" ("id", "email", "active") VALUES (1, 'a@b.co', TRUE);`,
    );
  });

  it('cot thua khong duoc ghi vao SQL', () => {
    expect(buildInsert('User', cols, { id: 1, email: 'a@b.co', active: true, secret: 'x' })).not.toContain(
      'secret',
    );
  });

  it('thieu cot bi bat ngay thay vi sinh INSERT hong', () => {
    expect(() => buildInsert('User', cols, { id: 1, email: 'a@b.co' })).toThrow(/Thieu cot "active"/);
  });

  it('bang khong co cot bi tu choi', () => {
    expect(() => buildInsert('User', [], { id: 1 })).toThrow();
  });
});

describe('buildDumpSql', () => {
  it('ghi mot INSERT cho moi dong va tom tat so dong', () => {
    const sql = buildDumpSql([
      { table: 'User', columns: ['id'], rows: [{ id: 1 }, { id: 2 }] },
      { table: 'Problem', columns: ['id'], rows: [{ id: 9 }] },
    ]);
    expect(sql).toContain(`INSERT INTO "User" ("id") VALUES (1);`);
    expect(sql).toContain(`INSERT INTO "User" ("id") VALUES (2);`);
    expect(sql).toContain(`INSERT INTO "Problem" ("id") VALUES (9);`);
    expect(sql).toContain('-- TONG: 3 dong tren 2 bang');
  });

  it('bang rong van ghi duong danh de thay bang nao dang rong', () => {
    const sql = buildDumpSql([{ table: 'User', columns: ['id'], rows: [] }]);
    expect(sql).toContain('-- User: 0 dong');
    expect(sql).toContain('-- TONG: 0 dong tren 1 bang');
  });
});

describe('resolveDsn', () => {
  const OLD = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD };
  });

  it('uu tien DATABASE_URL_UNPOOLED', () => {
    delete process.env.DATABASE_URL;
    process.env.DATABASE_URL_UNPOOLED = 'postgresql://u:p@db.example.com:5432/neondb';
    expect(resolveDsn()).toBe('postgresql://u:p@db.example.com:5432/neondb');
  });

  it('tu choi host pooler - pg_dump va dump deu khong dung duoc', () => {
    delete process.env.DATABASE_URL_UNPOOLED;
    process.env.DATABASE_URL = 'postgresql://u:p@ep-x-y-pooler.aws.neon.tech/neondb';
    expect(() => resolveDsn()).toThrow(/pooler/);
  });

  it('khong co DSN nao thi bao loi ro rang', () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_UNPOOLED;
    expect(() => resolveDsn()).toThrow(/Thieu DATABASE_URL_UNPOOLED/);
  });
});

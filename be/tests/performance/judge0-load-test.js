import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '60s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:4000';
const EMAIL = __ENV.TEST_EMAIL || 'k6@test.com';
const PASSWORD = __ENV.TEST_PASSWORD || 'k6test123';

let token = null;


export default function () {
    const login = http.post(`${BASE}/api/auth/login`, JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
    }), { headers: { 'Content-Type': 'application/json' } });
    token = login.cookies?.gocode_access?.value || null;
  

  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `gocode_access=${token}`,
  };

  const submit = http.post(`${BASE}/api/submissions`, JSON.stringify({
    language_id: 71,
    source_code: 'print("hello")',
  }), { headers });
  console.log(`Submit status: ${submit.status}`);
  check(submit, { 'submit 200': (r) => r.status === 201 });

  if (submit.status === 201) {
    const body = submit.json();
    const tokens = body?.tokens || (body?.token ? [body.token] : []);
    if (tokens.length > 0) {
      const poll = http.get(`${BASE}/api/submissions/batch?tokens=${tokens.join(',')}`, { headers });
      console.log(`Poll status: ${poll.status}`);
      check(poll, { 'poll 200': (r) => r.status === 200 });
    }
  }

  sleep(2);
}

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
const EMAIL = __ENV.TEST_EMAIL || 'user@gocode.loca';
const PASSWORD = __ENV.TEST_PASSWORD || 'password123';

let token = null;

export default function () {
  const login = http.post(`${BASE}/api/auth/login`, JSON.stringify({
    email: EMAIL,
    password: PASSWORD,
  }), { headers: { 'Content-Type': 'application/json' } });
  token = login.cookies?.session?.[0]?.value || null;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  const submissions = Array.from({ length: 1 }, (_, i) => ({
    language_id: 71,
    source_code: `print("hello ${i}")`,
  }));

  const submit = http.post(`${BASE}/api/submissions/batch`, JSON.stringify({
    submissions,
  }), { headers });
  console.log(`Batch submit status: ${submit.status}`);
  check(submit, { 'batch submit 200': (r) => r.status === 200 });

  if (submit.status === 200) {
    const body = submit.json();
    const tokens = body?.tokens || [];
    if (tokens.length > 0) {
      const poll = http.get(`${BASE}/api/submissions/batch?tokens=${tokens.join(',')}`, { headers });
      console.log(`Batch poll status: ${poll.status}`);
      check(poll, { 'batch poll 200': (r) => r.status === 200 });
    }
  }

  sleep(2);
}

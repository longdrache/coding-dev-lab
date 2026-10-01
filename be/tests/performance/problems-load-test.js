import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 30,
  duration: '120s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:4000';
const SLUGS = ['two-sum', 'valid-palindrome', 'first-unique-char', 'valid-parentheses', 'binary-search'];

export default function () {
  if (Math.random() < 0.8) {
    const r = http.get(`${BASE}/api/problems`);
    check(r, { 'list 200': (x) => x.status === 200 });
  } else {
    const slug = SLUGS[Math.floor(Math.random() * SLUGS.length)];
    const r = http.get(`${BASE}/api/problems/${slug}`);
    check(r, { 'detail 200': (x) => x.status === 200 });
  }
  sleep(1.5);
}

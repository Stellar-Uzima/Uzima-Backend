import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 50 }, 
    { duration: '30s', target: 0 }, 
  ],
  thresholds: {
    'http_req_failed': ['rate<0.01'],   
    'http_req_duration': ['p(95)<500'], 
    'http_reqs': ['rate>50'],           
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // Authentication
  const loginPayload = JSON.stringify({
    email: 'testuser@uzima.com', // Change if your local DB requires a specific email
    password: 'password123',     // Change if your local DB requires a specific password
  });

  const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'Authentication' } 
  });

  check(loginRes, { 'login successful': (r) => r.status === 200 || r.status === 201 });

  const token = loginRes.json('accessToken');
  const authHeaders = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  // Task Reads
  const tasksRes = http.get(`${BASE_URL}/tasks`, Object.assign({}, authHeaders, {
    tags: { name: 'TaskReads' }
  }));
  check(tasksRes, { 'tasks fetched': (r) => r.status === 200 });

  sleep(1);

  // Wallet Reads
  const walletRes = http.get(`${BASE_URL}/wallet`, Object.assign({}, authHeaders, {
    tags: { name: 'WalletReads' }
  }));
  check(walletRes, { 'wallet fetched': (r) => r.status === 200 });

  sleep(1);
}
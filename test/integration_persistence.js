// =============================================================
// integration_persistence.js — 저장/계정 실소켓 통합 테스트
//   격리 포트(3011) + 격리 데이터 폴더에서 서버를 직접 띄워:
//     로그인(자동가입) → 레벨업 → 접속종료(저장) → 서버 재시작 → 재로그인 시 레벨 유지
//   그리고 틀린 비번 거부까지 검증한다. (운영 서버/데이터와 완전 분리)
//
//   사전: npm install --no-save socket.io-client
//   실행: node test/integration_persistence.js
// =============================================================

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3011;
const URL = `http://localhost:${PORT}`;
const DATA_DIR = '/tmp/mmo_test_data';
const NICK = '통합테스트';
const PW = 'secret123';

let failures = 0;
const ok = (m, c, extra = '') => {
  if (c) console.log('✓', m);
  else {
    console.error('✗ FAIL:', m, extra);
    failures++;
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitHealth(timeoutMs = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      http
        .get(`${URL}/health`, (res) => {
          res.resume();
          resolve();
        })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) reject(new Error('server not ready'));
          else setTimeout(tick, 200);
        });
    };
    tick();
  });
}

function startServer() {
  const child = spawn('node', ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), MMO_DATA_DIR: DATA_DIR },
    stdio: 'ignore',
  });
  return child;
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) return resolve();
    child.on('exit', () => resolve());
    child.kill('SIGTERM'); // graceful shutdown → 저장 후 종료
    setTimeout(resolve, 2000); // 안전장치
  });
}

// 로그인 → init 또는 joinError 중 먼저 오는 것 반환
function connectAndJoin(nick, pw) {
  return new Promise((resolve, reject) => {
    const socket = io(URL, { forceNew: true, transports: ['websocket', 'polling'] });
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      resolve({ socket, ...result });
    };
    socket.on('init', (data) => done({ init: data }));
    socket.on('joinError', (e) => done({ error: e }));
    socket.on('connect', () => socket.emit('join', { nick, password: pw }));
    socket.on('connect_error', (e) => {
      if (!settled) {
        settled = true;
        reject(e);
      }
    });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('join timeout'));
      }
    }, 6000);
  });
}

// 몬스터 위치를 따라가며 공격해 목표 레벨까지 성장
function grindToLevel(socket, targetLevel, maxMs = 20000) {
  return new Promise((resolve) => {
    let monsters = [];
    let stats = { level: 1, exp: 0 };
    socket.on('monstersUpdate', (list) => (monsters = list));
    socket.on('expGained', (d) => (stats = d));
    socket.on('levelUp', (d) => (stats = d));

    const start = Date.now();
    const loop = setInterval(() => {
      if (stats.level >= targetLevel || Date.now() - start > maxMs) {
        clearInterval(loop);
        return resolve(stats);
      }
      const m = monsters.find((x) => x.alive);
      if (m) {
        // 몬스터 바로 왼쪽으로 이동 보고 후 오른쪽 공격 → 확실히 사거리 안
        socket.emit('move', { x: m.x - 20, y: 664, vx: 0, vy: 0, dir: 'right', anim: 'idle' });
        socket.emit('attack', { dir: 'right' });
      }
    }, 400);
  });
}

(async () => {
  // 격리 데이터 폴더 초기화
  fs.rmSync(DATA_DIR, { recursive: true, force: true });

  console.log('\n[1] 서버 기동 (격리 포트/데이터)');
  let server = startServer();
  await waitHealth();
  ok('격리 서버 기동됨', true);

  console.log('\n[2] 신규 로그인(자동 가입)');
  const a = await connectAndJoin(NICK, PW);
  ok('로그인 성공(init 수신)', !!a.init && !a.error, JSON.stringify(a.error || {}));
  ok('신규 계정 시작 레벨 1', a.init && a.init.self.level === 1, `level=${a.init && a.init.self.level}`);

  console.log('\n[3] 레벨업까지 사냥 (목표 Lv.2+)');
  const grown = await grindToLevel(a.socket, 2);
  ok('레벨업 도달(Lv.2 이상)', grown.level >= 2, `level=${grown.level}`);
  const savedLevel = grown.level;
  const savedExp = grown.exp;
  console.log(`    → 도달: Lv.${savedLevel}, exp ${savedExp}`);

  console.log('\n[4] 접속 종료(저장 트리거) 후 서버 종료');
  a.socket.close();
  await sleep(600); // disconnect flush 대기
  await stopServer(server);
  ok('저장 파일 존재', fs.existsSync(path.join(DATA_DIR, 'accounts.json')));

  console.log('\n[5] 서버 재시작 (같은 데이터 폴더)');
  server = startServer();
  await waitHealth();
  ok('재시작 서버 기동됨', true);

  console.log('\n[6] 재로그인 → 진행도 유지 확인');
  const b = await connectAndJoin(NICK, PW);
  ok('재로그인 성공', !!b.init && !b.error, JSON.stringify(b.error || {}));
  ok(
    `재시작 후 레벨 유지 (Lv.${savedLevel})`,
    b.init && b.init.self.level === savedLevel,
    `기대 ${savedLevel}, 실제 ${b.init && b.init.self.level}`
  );
  ok(
    '재시작 후 EXP 유지',
    b.init && b.init.self.exp === savedExp,
    `기대 ${savedExp}, 실제 ${b.init && b.init.self.exp}`
  );
  b.socket.close();

  console.log('\n[7] 틀린 비밀번호 거부');
  const c = await connectAndJoin(NICK, 'wrongpw');
  ok('틀린 비번 → joinError', !!c.error && !c.init, JSON.stringify(c.init ? { level: c.init.self.level } : {}));
  if (c.socket) c.socket.close();

  console.log('\n[8] 정리');
  await stopServer(server);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  ok('격리 데이터 정리 완료', !fs.existsSync(DATA_DIR));

  console.log(`\n=== 결과: ${failures === 0 ? '전체 통과 ✅' : failures + '개 실패 ❌'} ===`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('테스트 오류:', e);
  process.exit(1);
});

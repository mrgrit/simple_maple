// =============================================================
// index.js — Express + Socket.IO 서버 + (향후) 게임 루프
//   Phase 0: 정적 파일 서빙 + Socket.IO 연결 확인
//   Phase 1: 접속 시 맵/스폰/튜닝 값 전달(init) → 클라이언트가 단일 캐릭터로 이동/점프
//   Phase 2: 멀티플레이어 동기화 (join/move/leave 브로드캐스트 + 이동 검증)
//   Phase 3~: 몬스터, 전투, 성장 등 추가
// =============================================================

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const config = require('./config');
const { getMap } = require('./game/maps');
const GameState = require('./game/GameState');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 전체 게임 상태 (플레이어/몬스터)
const state = new GameState();

// 현재는 단일 맵 사용 (Phase 6에서 다중 맵 확장)
const MAP = getMap('village');

// 맵의 스폰 데이터로 몬스터 생성 (서버 권위)
state.spawnMonsters(MAP.monsterSpawns);

// ----------------------- 이동 검증 (반권위 모델) -----------------------
// 클라이언트가 보고한 이동 데이터를 신뢰하지 않고 정제/검증한다.
// 비정상 좌표는 맵 경계로 클램프, 비정상 수평 속도는 거부(치팅 차단).
function sanitizeMove(data) {
  if (!data || typeof data !== 'object') return null;
  const isNum = (v) => typeof v === 'number' && isFinite(v);

  if (!isNum(data.x) || !isNum(data.y)) return null;
  let x = data.x;
  let y = data.y;
  let vx = isNum(data.vx) ? data.vx : 0;
  let vy = isNum(data.vy) ? data.vy : 0;

  // 좌표는 맵 경계로 클램프
  x = Math.max(0, Math.min(MAP.width, x));
  y = Math.max(0, Math.min(MAP.height, y));

  // 수평 속도가 허용치를 크게 넘으면 치팅 의심 → 업데이트 거부
  const maxVx = config.PLAYER.SPEED * config.VALIDATION.MAX_SPEED_FACTOR;
  if (Math.abs(vx) > maxVx) return null;
  // 수직 속도는 낙하 가속을 고려해 넉넉히 클램프
  vy = Math.max(-2000, Math.min(2000, vy));

  const dir = data.dir === 'left' ? 'left' : 'right';
  const anim = ['idle', 'run', 'jump'].includes(data.anim) ? data.anim : 'idle';

  return {
    x: Math.round(x),
    y: Math.round(y),
    vx: Math.round(vx),
    vy: Math.round(vy),
    dir,
    anim,
  };
}

// ----------------------- 정적 파일 서빙 -----------------------
// 클라이언트(public) 서빙
app.use(express.static(path.join(__dirname, '..', 'public')));

// Phaser 라이브러리를 node_modules 에서 서빙 → 오프라인/LAN 환경에서도 동작(CDN 불필요)
app.use(
  '/vendor',
  express.static(path.join(__dirname, '..', 'node_modules', 'phaser', 'dist'))
);

// 간단한 헬스 체크 (테스트용)
app.get('/health', (req, res) => {
  res.json({ ok: true, players: state.playerCount, tick: config.TICK_RATE });
});

// ----------------------- Socket.IO 이벤트 -----------------------
io.on('connection', (socket) => {
  console.log(`[연결] 클라이언트 접속: ${socket.id} (현재 ${state.playerCount}명)`);

  // C→S: 닉네임으로 게임 참가
  socket.on('join', ({ nick } = {}) => {
    const safeNick = String(nick || '용사').trim().slice(0, 12) || '용사';
    const player = state.addPlayer(socket.id, safeNick, MAP.spawn);

    console.log(`[입장] ${safeNick} (${socket.id}) → '${MAP.name}' 맵 (현재 ${state.playerCount}명)`);

    // S→C: 초기 상태 전달 (자기 정보 + 맵 + 다른 플레이어/몬스터 + 튜닝 값)
    socket.emit('init', {
      selfId: socket.id,
      self: player.serialize(),
      map: MAP,
      players: state.serializePlayers(socket.id), // 나 제외 (현재 접속 중인 다른 플레이어들)
      monsters: state.serializeMonsters(),        // 현재 몬스터 상태
      tuning: {
        gravity: config.WORLD.GRAVITY,
        speed: config.PLAYER.SPEED,
        jump: config.PLAYER.JUMP,
        playerW: config.PLAYER.WIDTH,
        playerH: config.PLAYER.HEIGHT,
        attackCooldown: config.COMBAT.ATTACK_COOLDOWN_MS,
        attackRange: config.COMBAT.ATTACK_RANGE,
      },
    });

    // 다른 플레이어들에게 새 참가자 알림
    socket.broadcast.emit('playerJoined', player.serialize());
  });

  // C→S: 이동 보고 → 검증 후 다른 클라이언트에게 브로드캐스트
  socket.on('move', (data) => {
    const player = state.getPlayer(socket.id);
    if (!player) return;

    const clean = sanitizeMove(data);
    if (!clean) return; // 검증 실패(비정상 좌표/속도) → 무시

    player.applyMove(clean);
    // 나를 제외한 모두에게 전달 (서버는 단순 중계, 정수 좌표로 트래픽 최소화)
    socket.broadcast.emit('playerMoved', { id: socket.id, ...clean });
  });

  // C→S: 공격 → 서버에서 근접 판정/데미지 계산(권위)
  socket.on('attack', ({ dir } = {}) => {
    const player = state.getPlayer(socket.id);
    if (!player) return;

    const now = Date.now();
    const result = state.resolveAttack(player, dir, now);
    if (!result) return; // 쿨다운 중 → 무시

    // 공격 모션은 모두에게 보여줌(다른 플레이어의 휘두르기 연출용)
    socket.broadcast.emit('playerAttacked', { id: socket.id, dir: result.facing });

    for (const h of result.hits) {
      const m = h.monster;
      if (h.died) {
        // 사망: 모두에게 알림 + 처치자에게 EXP 지급(레벨업 처리는 Phase 4)
        io.emit('monsterDied', { id: m.id, by: socket.id, expDrop: m.expDrop, x: m.x, y: m.y });
        socket.emit('expGained', { exp: m.expDrop, total: player.exp });
        console.log(`[처치] ${player.nick} → ${m.id} (+${m.expDrop} EXP, 누적 ${player.exp})`);
      } else {
        io.emit('monsterHit', { id: m.id, hp: h.hp, dmg: h.dmg, by: socket.id, x: m.x, y: m.y });
      }
    }
  });

  // 연결 종료
  socket.on('disconnect', () => {
    const player = state.getPlayer(socket.id);
    state.removePlayer(socket.id);
    console.log(
      `[퇴장] ${player ? player.nick : '?'} (${socket.id}) — 남은 ${state.playerCount}명`
    );
    // 다른 플레이어들에게 퇴장 알림
    socket.broadcast.emit('playerLeft', socket.id);
  });
});

// ----------------------- 서버 게임 루프 -----------------------
// 고정 틱(TICK_RATE Hz)으로 몬스터 AI/리스폰을 갱신하고 전체에 브로드캐스트한다.
const TICK_MS = 1000 / config.TICK_RATE;
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTick) / 1000; // 초 단위
  lastTick = now;

  state.updateMonsters(dt, now);
  io.emit('monstersUpdate', state.serializeMonsters());
}, TICK_MS);

// ----------------------- 서버 시작 -----------------------
server.listen(config.PORT, config.HOST, () => {
  console.log('==============================================');
  console.log('  심플 메이플 MMO 서버 실행 중');
  console.log(`  로컬:  http://localhost:${config.PORT}`);
  console.log(`  LAN :  http://<서버IP>:${config.PORT}  (같은 네트워크에서 접속)`);
  console.log('==============================================');
});

// =============================================================
// index.js — Express + Socket.IO 서버 + (향후) 게임 루프
//   Phase 0: 정적 파일 서빙 + Socket.IO 연결 확인
//   Phase 1: 접속 시 맵/스폰/튜닝 값 전달(init) → 클라이언트가 단일 캐릭터로 이동/점프
//   Phase 2~: 멀티플레이어 동기화, 몬스터, 전투, 성장 등 추가
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
    const map = getMap('village');
    const player = state.addPlayer(socket.id, safeNick, map.spawn);

    console.log(`[입장] ${safeNick} (${socket.id}) → '${map.name}' 맵`);

    // S→C: 초기 상태 전달 (자기 정보 + 맵 + 다른 플레이어/몬스터 + 튜닝 값)
    socket.emit('init', {
      selfId: socket.id,
      self: player.serialize(),
      map,
      players: state.serializePlayers(socket.id), // 나 제외 (Phase 2부터 채워짐)
      monsters: [],                               // Phase 3부터 채워짐
      tuning: {
        gravity: config.WORLD.GRAVITY,
        speed: config.PLAYER.SPEED,
        jump: config.PLAYER.JUMP,
        playerW: config.PLAYER.WIDTH,
        playerH: config.PLAYER.HEIGHT,
      },
    });

    // Phase 2에서 구현: 다른 플레이어들에게 playerJoined 브로드캐스트
    // socket.broadcast.emit('playerJoined', player.serialize());
  });

  // C→S: 이동 보고 (Phase 2에서 검증 + 브로드캐스트 구현)
  socket.on('move', (data) => {
    const player = state.getPlayer(socket.id);
    if (!player) return;
    player.applyMove(data || {});
    // Phase 2: 좌표/속도 검증 후 socket.broadcast.emit('playerMoved', ...)
  });

  // 연결 종료
  socket.on('disconnect', () => {
    const player = state.getPlayer(socket.id);
    state.removePlayer(socket.id);
    console.log(
      `[퇴장] ${player ? player.nick : '?'} (${socket.id}) — 남은 ${state.playerCount}명`
    );
    // Phase 2: socket.broadcast.emit('playerLeft', socket.id);
  });
});

// ----------------------- 서버 게임 루프 (Phase 3부터 본격 사용) -----------------------
// const TICK_MS = 1000 / config.TICK_RATE;
// setInterval(() => { /* 몬스터 AI 갱신 + monstersUpdate 브로드캐스트 */ }, TICK_MS);

// ----------------------- 서버 시작 -----------------------
server.listen(config.PORT, config.HOST, () => {
  console.log('==============================================');
  console.log('  심플 메이플 MMO 서버 실행 중');
  console.log(`  로컬:  http://localhost:${config.PORT}`);
  console.log(`  LAN :  http://<서버IP>:${config.PORT}  (같은 네트워크에서 접속)`);
  console.log('==============================================');
});

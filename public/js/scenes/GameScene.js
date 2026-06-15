// =============================================================
// GameScene.js — 메인 게임 씬
//   Phase 1: 서버에서 받은 맵으로 플랫폼 구성 → 단일 캐릭터 이동/점프/카메라 추적
//   Phase 2: 멀티플레이어 동기화
//            - 내 위치를 주기적으로 서버에 보고(Net.sendMove)
//            - 다른 플레이어 접속/이동/퇴장 처리 + 위치 보간(interpolation)
//   Phase 3~: 몬스터, 전투, HUD 등이 여기에 추가된다.
// =============================================================

// 네트워크 튜닝 상수
const SEND_INTERVAL_MS = 50; // 내 위치 보고 주기 (20Hz)
const INTERP_DELAY_MS = 100; // 보간 지연 (이 시간만큼 과거를 렌더 → 부드러운 보간)

// 보간 버퍼에서 renderTime 시점의 위치를 샘플링
function sampleBuffer(buf, t) {
  if (!buf || buf.length === 0) return null;
  if (buf.length === 1) return buf[0];

  // 오래된 스냅샷 정리 (메모리 제한)
  while (buf.length > 12) buf.shift();

  // renderTime 을 감싸는 두 스냅샷 사이를 선형 보간
  for (let i = 0; i < buf.length - 1; i++) {
    const a = buf[i];
    const b = buf[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / ((b.t - a.t) || 1);
      return {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        flipX: b.flipX,
      };
    }
  }
  // renderTime 이 가장 최신보다 미래면 최신값으로 스냅 (외삽 안 함)
  return buf[buf.length - 1];
}

const nowMs = () =>
  typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.ready = false;
    this.selfId = null;
    this.player = null;
    this.others = {}; // id -> { sprite, label, nick, buffer:[{t,x,y,flipX}] }

    // 위치 보고 throttle 상태
    this.lastSent = 0;
    this.lastSentState = null;

    // 서버 튜닝 기본값 (init 으로 덮어씀)
    this.tuning = { gravity: 900, speed: 220, jump: 520, playerW: 32, playerH: 48 };

    // 연결 대기 안내 (화면 고정)
    this.waitText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, '서버 연결 중...', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);

    // 서버 이벤트 구독 (리스너를 먼저 등록한 뒤 join 요청 → 레이스 방지)
    Net.on('init', (data) => this.onInit(data));
    Net.on('playerJoined', (p) => this.addOther(p));
    Net.on('playerMoved', (d) => this.onPlayerMoved(d));
    Net.on('playerLeft', (id) => this.removeOther(id));

    const nick = window.GAME_NICK || '용사';
    Net.join(nick);

    // 입력 설정
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D');
    this.jumpKeys = [this.cursors.up, this.cursors.space, this.keys.W];
  }

  // 서버 초기 상태 수신 → 월드/플레이어 구성
  onInit(data) {
    if (this.waitText) {
      this.waitText.destroy();
      this.waitText = null;
    }

    this.selfId = data.selfId;
    this.tuning = Object.assign(this.tuning, data.tuning || {});
    const map = data.map;

    // 배경색 + 월드/카메라 경계
    this.cameras.main.setBackgroundColor(map.background || '#1a1a2e');
    this.physics.world.setBounds(0, 0, map.width, map.height);
    this.cameras.main.setBounds(0, 0, map.width, map.height);

    // 전역 중력은 서버 튜닝 값으로 설정 (단일 출처)
    this.physics.world.gravity.y = this.tuning.gravity;

    // 플랫폼(발판) 생성 — 정적 바디
    this.platforms = [];
    map.platforms.forEach((p) => {
      const rect = this.add
        .rectangle(p.x + p.width / 2, p.y + p.height / 2, p.width, p.height, 0x6b4f2a)
        .setStrokeStyle(2, 0x8a6a3a);
      this.physics.add.existing(rect, true);
      this.platforms.push(rect);
    });

    // 자기 캐릭터 스폰
    this.player = this.physics.add.sprite(data.self.x, data.self.y, 'player').setDepth(20);
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(this.tuning.playerW, this.tuning.playerH);
    this.physics.add.collider(this.player, this.platforms);

    // 내 머리 위 닉네임 라벨
    this.nameLabel = this.add
      .text(this.player.x, this.player.y, data.self.nick, {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(50);

    // 이미 접속해 있던 다른 플레이어 생성
    (data.players || []).forEach((p) => this.addOther(p));

    // 카메라가 부드럽게 추적
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    // 조작 안내 (화면 고정)
    this.add
      .text(12, 12, '← → / A D 이동   |   ↑ / W / Space 점프', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#dddddd',
      })
      .setScrollFactor(0)
      .setDepth(100);

    // 접속자 수 표시 (화면 우상단 고정)
    this.onlineText = this.add
      .text(this.scale.width - 12, 12, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#9be36b',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.updateOnlineCount();

    this.ready = true;
  }

  // 다른 플레이어 추가 (나/중복은 무시)
  addOther(p) {
    if (!p || p.id === this.selfId || this.others[p.id]) return;

    const sprite = this.add.sprite(p.x, p.y, 'player_other').setDepth(10);
    sprite.setFlipX(p.dir === 'left');

    const label = this.add
      .text(p.x, p.y, p.nick || '???', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#bff7c0',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(50);

    this.others[p.id] = {
      sprite,
      label,
      nick: p.nick,
      buffer: [{ t: nowMs(), x: p.x, y: p.y, flipX: p.dir === 'left' }],
    };
    this.updateOnlineCount();
  }

  // 다른 플레이어 이동 수신 → 보간 버퍼에 적재
  onPlayerMoved(d) {
    const o = this.others[d.id];
    if (!o) return;
    o.buffer.push({ t: nowMs(), x: d.x, y: d.y, flipX: d.dir === 'left' });
  }

  // 다른 플레이어 제거
  removeOther(id) {
    const o = this.others[id];
    if (!o) return;
    o.sprite.destroy();
    o.label.destroy();
    delete this.others[id];
    this.updateOnlineCount();
  }

  updateOnlineCount() {
    if (!this.onlineText) return;
    const n = 1 + Object.keys(this.others).length;
    this.onlineText.setText(`접속자: ${n}명`);
  }

  update() {
    if (!this.ready || !this.player) return;

    // ---------- 내 캐릭터 조작 ----------
    const body = this.player.body;
    const { speed, jump } = this.tuning;

    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;

    if (left) {
      body.setVelocityX(-speed);
      this.player.setFlipX(true);
    } else if (right) {
      body.setVelocityX(speed);
      this.player.setFlipX(false);
    } else {
      body.setVelocityX(0);
    }

    const jumpPressed = this.jumpKeys
      .map((k) => Phaser.Input.Keyboard.JustDown(k))
      .some(Boolean);
    if (jumpPressed && body.blocked.down) {
      body.setVelocityY(-jump);
    }

    // 내 닉네임 라벨을 머리 위로
    this.nameLabel.setPosition(this.player.x, this.player.y - this.player.height / 2 - 4);

    // ---------- 내 위치 서버에 보고 (throttle + 변경 시에만) ----------
    this.maybeSendMove(body);

    // ---------- 다른 플레이어 보간 렌더 ----------
    this.interpolateOthers();
  }

  maybeSendMove(body) {
    const now = this.time.now;
    if (now - this.lastSent < SEND_INTERVAL_MS) return;

    let anim = 'idle';
    if (!body.blocked.down) anim = 'jump';
    else if (body.velocity.x !== 0) anim = 'run';

    const st = {
      x: Math.round(this.player.x),
      y: Math.round(this.player.y),
      vx: Math.round(body.velocity.x),
      vy: Math.round(body.velocity.y),
      dir: this.player.flipX ? 'left' : 'right',
      anim,
    };

    // 직전 보고와 동일하면 전송 생략 (대기 중 트래픽 절약)
    const prev = this.lastSentState;
    const changed =
      !prev || prev.x !== st.x || prev.y !== st.y || prev.dir !== st.dir || prev.anim !== st.anim;

    if (changed) {
      Net.sendMove(st);
      this.lastSentState = st;
    }
    this.lastSent = now;
  }

  interpolateOthers() {
    const renderTime = nowMs() - INTERP_DELAY_MS;
    for (const id in this.others) {
      const o = this.others[id];
      const pos = sampleBuffer(o.buffer, renderTime);
      if (pos) {
        o.sprite.x = pos.x;
        o.sprite.y = pos.y;
        if (typeof pos.flipX === 'boolean') o.sprite.setFlipX(pos.flipX);
      }
      o.label.setPosition(o.sprite.x, o.sprite.y - o.sprite.height / 2 - 4);
    }
  }
}

window.GameScene = GameScene;

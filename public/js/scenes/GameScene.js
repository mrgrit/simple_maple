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
    this.monsters = {}; // id -> { sprite, hpBg, hpFill, buffer, hp, maxHp, alive }
    this.stats = null;   // 서버 권위 스탯 (init에서 채움) — HUD 표시용
    this.dead = false;   // 내 사망 상태 (입력/이동보고 차단)
    this.deadUntil = 0;  // 부활 예정 시각(ms) — 클라 카운트다운 표시용
    this.deathText = null;
    this.lastAttack = 0; // 클라 공격 쿨다운 타이머

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

    // 서버 이벤트 구독 (init 은 main.js 인증 단계에서 수신 → window.GAME_INIT 로 전달받음)
    Net.on('playerJoined', (p) => this.addOther(p));
    Net.on('playerMoved', (d) => this.onPlayerMoved(d));
    Net.on('playerLeft', (id) => this.removeOther(id));
    // 몬스터/전투
    Net.on('monstersUpdate', (list) => this.onMonstersUpdate(list));
    Net.on('monsterHit', (d) => this.onMonsterHit(d));
    Net.on('monsterDied', (d) => this.onMonsterDied(d));
    Net.on('expGained', (d) => this.onExpGained(d));
    Net.on('playerAttacked', (d) => this.onPlayerAttacked(d));
    // 성장/생존 (Phase 4)
    Net.on('levelUp', (d) => this.onLevelUp(d));
    Net.on('playerLevelUp', (d) => this.onOtherLevelUp(d));
    Net.on('playerHurt', (d) => this.onPlayerHurt(d));
    Net.on('playerDied', (d) => this.onPlayerDied(d));
    Net.on('playerRespawned', (d) => this.onPlayerRespawned(d));

    // 입력 설정
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D');
    this.jumpKeys = [this.cursors.up, this.cursors.space, this.keys.W];
    this.attackKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);

    // 마우스 좌클릭(터치 포함) 공격 — 커서 쪽을 바라보고 공격
    this.input.on('pointerdown', (pointer) => this.onPointerAttack(pointer));

    // 인증 단계(main.js)에서 받은 초기 상태로 즉시 구성 (폴백: init 이벤트 대기)
    if (window.GAME_INIT) this.onInit(window.GAME_INIT);
    else Net.on('init', (data) => this.onInit(data));
  }

  // 서버 초기 상태 수신 → 월드/플레이어 구성
  onInit(data) {
    if (this.waitText) {
      this.waitText.destroy();
      this.waitText = null;
    }

    this.selfId = data.selfId;
    this.tuning = Object.assign(this.tuning, data.tuning || {});
    const s = data.self || {};
    this.stats = {
      level: s.level || 1,
      hp: s.hp || 0,
      maxHp: s.maxHp || 1,
      mp: s.mp || 0,
      maxMp: s.maxMp || 1,
      exp: s.exp || 0,
      expToNext: s.expToNext === undefined ? null : s.expToNext,
      atk: s.atk || 0,
    };
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

    // 몬스터 타입별 시각정보 + 텍스처 준비 (서버가 전달한 색/크기로 생성)
    this.monsterTypes = data.monsterTypes || {};
    this.ensureMonsterTextures();

    // 현재 몬스터 생성
    (data.monsters || []).forEach((m) => this.ensureMonster(m));

    // 카메라가 부드럽게 추적
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    // 조작 안내 (화면 고정)
    this.add
      .text(12, 12, '← → / A D 이동   |   ↑ / W / Space 점프   |   X / 좌클릭 공격', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#dddddd',
      })
      .setScrollFactor(0)
      .setDepth(100);

    // HUD (레벨 / HP / MP / EXP 바) — 화면 좌하단 고정
    this.buildHud();

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

    const dead = p.alive === false;
    if (dead) {
      sprite.setVisible(false);
      label.setVisible(false);
    }
    this.others[p.id] = {
      sprite,
      label,
      nick: p.nick,
      dead,
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

  // ---------------- HUD (레벨/HP/MP/EXP) ----------------
  buildHud() {
    const pad = 14;
    const barW = 220;
    const barH = 16;
    const gap = 5;
    const H = this.scale.height;
    const x = pad;
    const expY = H - pad - barH;
    const mpY = expY - gap - barH;
    const hpY = mpY - gap - barH;
    const lvY = hpY - 22;

    this.hud = {};
    this.hud.level = this.add
      .text(x, lvY, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffd966',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.hud.hp = this.makeBar(x, hpY, barW, barH, 0xff5c5c, 0x5a1616);
    this.hud.mp = this.makeBar(x, mpY, barW, barH, 0x4aa3ff, 0x143a5a);
    this.hud.exp = this.makeBar(x, expY, barW, barH, 0xffd93d, 0x5a4a10);

    this.refreshHud();
  }

  // 바 하나(배경/채움/중앙 텍스트) 생성. 좌상단 원점 기준.
  makeBar(x, y, w, h, fillColor, bgColor) {
    const bg = this.add
      .rectangle(x, y, w, h, bgColor, 0.85)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setStrokeStyle(2, 0x000000, 0.6);
    const fill = this.add
      .rectangle(x, y, w, h, fillColor, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100);
    const text = this.add
      .text(x + w / 2, y + h / 2, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(102);
    return { bg, fill, text, w };
  }

  setBar(bar, val, max, label) {
    const ratio = max > 0 ? Phaser.Math.Clamp(val / max, 0, 1) : 0;
    bar.fill.displayWidth = bar.w * ratio;
    bar.text.setText(label);
  }

  refreshHud() {
    if (!this.hud || !this.stats) return;
    const s = this.stats;
    this.hud.level.setText(`Lv.${s.level}`);
    this.setBar(this.hud.hp, s.hp, s.maxHp, `HP ${s.hp}/${s.maxHp}`);
    this.setBar(this.hud.mp, s.mp, s.maxMp, `MP ${s.mp}/${s.maxMp}`);
    if (s.expToNext == null) {
      this.setBar(this.hud.exp, 1, 1, 'EXP MAX');
    } else {
      const pct = s.expToNext > 0 ? Math.floor((s.exp / s.expToNext) * 100) : 0;
      this.setBar(this.hud.exp, s.exp, s.expToNext, `EXP ${s.exp}/${s.expToNext} (${pct}%)`);
    }
  }

  // 서버가 보낸 스탯 필드만 골라 병합
  applyStats(d) {
    if (!this.stats || !d) return;
    ['level', 'hp', 'maxHp', 'mp', 'maxMp', 'atk', 'exp', 'expToNext'].forEach((k) => {
      if (d[k] !== undefined) this.stats[k] = d[k];
    });
  }

  // 레벨업/부활 골든 링 연출
  spawnRing(x, y, color) {
    const ring = this.add.circle(x, y, 26, color, 0).setStrokeStyle(3, color, 1).setDepth(40);
    this.tweens.add({
      targets: ring,
      scale: 2.4,
      alpha: 0,
      duration: 500,
      onComplete: () => ring.destroy(),
    });
  }

  // ---------------- 몬스터 ----------------
  // 타입별 플레이스홀더 텍스처(색/크기)를 서버 정보로 런타임 생성
  ensureMonsterTextures() {
    for (const type in this.monsterTypes) {
      const key = 'mon_' + type;
      if (this.textures.exists(key)) continue;
      const t = this.monsterTypes[type];
      this.makeBlobTexture(key, t.width, t.height, t.color, t.stroke);
    }
  }

  makeBlobTexture(key, w, h, color, stroke) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(color, 1);
    g.lineStyle(2, stroke, 1);
    // 아래는 평평하고 위는 둥근 몸체
    g.beginPath();
    g.arc(w / 2, h - 6, w / 2 - 2, Math.PI, 0);
    g.lineTo(w - 2, h - 4);
    g.lineTo(2, h - 4);
    g.closePath();
    g.fillPath();
    g.strokePath();
    // 눈 2개 (크기에 비례)
    const ex = w * 0.18;
    const ey = h * 0.5;
    const r = Math.max(2.5, w * 0.1);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(w / 2 - ex, ey, r);
    g.fillCircle(w / 2 + ex, ey, r);
    g.fillStyle(0x222222, 1);
    g.fillCircle(w / 2 - ex, ey, r * 0.5);
    g.fillCircle(w / 2 + ex, ey, r * 0.5);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  ensureMonster(m) {
    if (this.monsters[m.id]) return this.monsters[m.id];
    const info = this.monsterTypes[m.type] || { width: 36 };
    const texKey = this.textures.exists('mon_' + m.type) ? 'mon_' + m.type : 'slime';
    const barW = Math.max(26, (info.width || 36) - 2);
    const barH = 5;
    const sprite = this.add.sprite(m.x, m.y, texKey).setDepth(8);
    const hpBg = this.add.rectangle(m.x, m.y, barW, barH, 0x000000, 0.55).setDepth(9);
    const hpFill = this.add
      .rectangle(m.x - barW / 2, m.y, barW, barH, 0x4ade4a)
      .setOrigin(0, 0.5)
      .setDepth(9);
    const o = {
      sprite,
      hpBg,
      hpFill,
      barW,
      texKey,
      dir: m.dir,
      buffer: [{ t: nowMs(), x: m.x, y: m.y }],
      hp: m.hp,
      maxHp: m.maxHp,
      alive: m.alive,
    };
    this.monsters[m.id] = o;
    return o;
  }

  onMonstersUpdate(list) {
    if (!this.ready) return;
    for (const m of list) {
      const o = this.ensureMonster(m);
      o.buffer.push({ t: nowMs(), x: m.x, y: m.y });
      o.hp = m.hp;
      o.maxHp = m.maxHp;
      o.dir = m.dir;
      o.alive = m.alive;
    }
  }

  interpolateMonsters() {
    const renderTime = nowMs() - INTERP_DELAY_MS;
    for (const id in this.monsters) {
      const o = this.monsters[id];
      const pos = sampleBuffer(o.buffer, renderTime);
      if (pos) {
        o.sprite.x = pos.x;
        o.sprite.y = pos.y;
      }
      if (o.dir) o.sprite.setFlipX(o.dir === 'left');

      const showBar = o.alive && o.hp < o.maxHp;
      o.sprite.visible = o.alive;
      o.hpBg.visible = showBar;
      o.hpFill.visible = showBar;

      const bx = o.sprite.x;
      const by = o.sprite.y - o.sprite.height / 2 - 8;
      o.hpBg.setPosition(bx, by);
      o.hpFill.setPosition(bx - o.barW / 2, by);
      const ratio = Phaser.Math.Clamp(o.hp / o.maxHp, 0, 1);
      o.hpFill.displayWidth = o.barW * ratio;
      o.hpFill.setFillStyle(ratio > 0.5 ? 0x4ade4a : ratio > 0.25 ? 0xffd93d : 0xff5c5c);
    }
  }

  // ---------------- 전투 ----------------
  // 마우스 좌클릭 공격 — 커서 방향을 바라본 뒤 공격
  onPointerAttack(pointer) {
    if (!this.ready || this.dead || !this.player) return;
    if (pointer.leftButtonDown && !pointer.leftButtonDown()) return; // 좌클릭/터치만
    const wx = pointer.worldX;
    if (typeof wx === 'number') this.player.setFlipX(wx < this.player.x);
    this.doAttack();
  }

  doAttack() {
    if (!this.player || this.dead) return;
    const now = this.time.now;
    const cd = this.tuning.attackCooldown || 350;
    if (now - this.lastAttack < cd) return; // 클라 쿨다운(서버도 검증)
    this.lastAttack = now;

    const dir = this.player.flipX ? 'left' : 'right';
    Net.sendAttack(dir);
    this.showSlash(this.player.x, this.player.y, dir);
  }

  showSlash(x, y, dir) {
    const sx = x + (dir === 'right' ? 26 : -26);
    const slash = this.add.ellipse(sx, y, 16, 42, 0xffffff, 0.5).setDepth(30);
    slash.setAngle(dir === 'right' ? 18 : -18);
    this.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: 1.7,
      scaleY: 1.2,
      duration: 150,
      onComplete: () => slash.destroy(),
    });
  }

  onPlayerAttacked(d) {
    const o = this.others[d.id];
    if (o) this.showSlash(o.sprite.x, o.sprite.y, d.dir);
  }

  onMonsterHit(d) {
    const o = this.monsters[d.id];
    if (o) {
      o.hp = d.hp;
      o.sprite.setTintFill(0xffffff); // 피격 플래시
      this.time.delayedCall(80, () => o.sprite && o.sprite.clearTint());
    }
    const x = o ? o.sprite.x : d.x;
    const y = o ? o.sprite.y : d.y;
    this.floatingText(x, y - 18, `-${d.dmg}`, '#ff5c5c');
  }

  onMonsterDied(d) {
    const o = this.monsters[d.id];
    if (!o) return;
    o.alive = false;
    o.sprite.visible = false;
    o.hpBg.visible = false;
    o.hpFill.visible = false;
    // 사망 연출: 위로 튀며 납작해지고 사라짐 (해당 몬스터 타입 텍스처로)
    const ghost = this.add.sprite(o.sprite.x, o.sprite.y, o.texKey).setDepth(8).setAlpha(0.9);
    this.tweens.add({
      targets: ghost,
      y: ghost.y - 20,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 0.5,
      duration: 300,
      onComplete: () => ghost.destroy(),
    });
  }

  onExpGained(d) {
    this.applyStats(d);
    this.refreshHud();
    if (this.player) this.floatingText(this.player.x, this.player.y - 40, `+${d.gain} EXP`, '#ffd966');
  }

  // 내 레벨업 (스탯 갱신 + 연출)
  onLevelUp(d) {
    this.applyStats(d);
    this.refreshHud();
    if (!this.player) return;
    this.floatingText(this.player.x, this.player.y - 62, `LEVEL UP!  Lv.${this.stats.level}`, '#ffe066');
    this.spawnRing(this.player.x, this.player.y, 0xffe066);
    this.player.setTint(0xffe066);
    this.time.delayedCall(220, () => this.player && !this.dead && this.player.clearTint());
  }

  // 다른 플레이어 레벨업 연출
  onOtherLevelUp(d) {
    const o = this.others[d.id];
    if (!o) return;
    this.floatingText(o.sprite.x, o.sprite.y - 62, `LEVEL UP! Lv.${d.level}`, '#ffe066');
    this.spawnRing(o.sprite.x, o.sprite.y, 0xffe066);
  }

  // 내가 피격 (몬스터 접촉 데미지 — 본인 HUD만 갱신)
  onPlayerHurt(d) {
    if (this.stats) {
      this.stats.hp = d.hp;
      if (d.maxHp !== undefined) this.stats.maxHp = d.maxHp;
    }
    this.refreshHud();
    if (this.player) {
      this.player.setTintFill(0xff4444);
      this.time.delayedCall(120, () => this.player && !this.dead && this.player.clearTint());
      this.floatingText(this.player.x, this.player.y - 30, `-${d.dmg}`, '#ff6b6b');
    }
    this.cameras.main.shake(120, 0.006);
  }

  // 사망 (본인이면 입력 차단 + 카운트다운 오버레이 / 남이면 스프라이트 숨김)
  onPlayerDied(d) {
    if (d.id === this.selfId) {
      this.dead = true;
      this.deadUntil = nowMs() + (d.respawnMs || 3000);
      if (this.stats) this.stats.hp = 0;
      this.refreshHud();
      if (this.player) {
        this.player.body.setVelocity(0, 0);
        this.player.setTint(0x555555);
      }
      this.deathText = this.add
        .text(this.scale.width / 2, this.scale.height / 2, '', {
          fontFamily: 'sans-serif',
          fontSize: '28px',
          color: '#ff6b6b',
          stroke: '#000000',
          strokeThickness: 5,
          align: 'center',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(200);
    } else {
      const o = this.others[d.id];
      if (o) {
        o.dead = true;
        o.sprite.setVisible(false);
        o.label.setVisible(false);
      }
    }
  }

  // 부활 (본인이면 위치/HP 복구 + 입력 재개 / 남이면 스프라이트 복귀)
  onPlayerRespawned(d) {
    if (d.id === this.selfId) {
      this.dead = false;
      this.deadUntil = 0;
      if (this.deathText) {
        this.deathText.destroy();
        this.deathText = null;
      }
      if (this.stats) {
        this.stats.hp = d.hp;
        this.stats.maxHp = d.maxHp;
        this.stats.mp = d.mp;
        this.stats.maxMp = d.maxMp;
      }
      this.refreshHud();
      if (this.player) {
        this.player.clearTint();
        this.player.setPosition(d.x, d.y);
        this.player.body.setVelocity(0, 0);
      }
      this.spawnRing(d.x, d.y, 0x9be36b);
    } else {
      const o = this.others[d.id];
      if (o) {
        o.dead = false;
        o.sprite.setVisible(true);
        o.label.setVisible(true);
        o.sprite.setPosition(d.x, d.y);
        o.buffer = [{ t: nowMs(), x: d.x, y: d.y, flipX: o.sprite.flipX }];
      }
    }
  }

  floatingText(x, y, text, color) {
    const t = this.add
      .text(x, y, text, {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(60);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  update() {
    if (!this.ready || !this.player) return;

    // ---------- 사망 중: 입력/이동보고 차단 + 부활 카운트다운 ----------
    if (this.dead) {
      const remain = Math.max(0, Math.ceil((this.deadUntil - nowMs()) / 1000));
      if (this.deathText) this.deathText.setText(`쓰러졌습니다!\n${remain}초 후 부활`);
      this.nameLabel.setPosition(this.player.x, this.player.y - this.player.height / 2 - 4);
      this.interpolateOthers();
      this.interpolateMonsters();
      return;
    }

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

    // 공격 (X)
    if (Phaser.Input.Keyboard.JustDown(this.attackKey)) this.doAttack();

    // 내 닉네임 라벨을 머리 위로
    this.nameLabel.setPosition(this.player.x, this.player.y - this.player.height / 2 - 4);

    // ---------- 내 위치 서버에 보고 (throttle + 변경 시에만) ----------
    this.maybeSendMove(body);

    // ---------- 다른 플레이어/몬스터 보간 렌더 ----------
    this.interpolateOthers();
    this.interpolateMonsters();
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
      if (o.dead) continue; // 사망 중인 타 플레이어는 렌더 스킵(숨김 상태)
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

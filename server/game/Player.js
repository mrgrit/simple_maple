// =============================================================
// Player.js — 플레이어 상태 모델 (서버 권위)
// 위치/속도는 클라이언트가 보고하지만(반권위), HP/레벨/EXP 등 성장 스탯은
// 서버에서만 변경한다(치팅 방지). Phase 4에서 성장 로직이 채워진다.
// =============================================================

const config = require('../config');

class Player {
  constructor(id, nick, spawn) {
    this.id = id;
    this.nick = nick;

    // 위치 / 이동 상태 (클라이언트가 보고 → 서버 검증 후 브로드캐스트)
    this.x = spawn.x;
    this.y = spawn.y;
    this.vx = 0;
    this.vy = 0;
    this.dir = 'right'; // 바라보는 방향
    this.anim = 'idle'; // 애니메이션 상태 (idle/run/jump)

    // 성장 스탯 (서버 권위)
    this.level = config.PLAYER.START_LEVEL;
    this.exp = 0;
    this.maxHp = config.PLAYER.MAX_HP;
    this.hp = this.maxHp;
    this.maxMp = config.PLAYER.MAX_MP;
    this.mp = this.maxMp;
    this.atk = config.GROWTH.BASE_ATK;

    // 전투
    this.lastAttackAt = 0; // 마지막 공격 시각(ms) — 연사 차단용
  }

  // 클라이언트가 보고한 이동 상태를 반영 (Phase 2에서 검증과 함께 사용)
  applyMove({ x, y, vx, vy, dir, anim }) {
    this.x = Math.round(x);
    this.y = Math.round(y);
    this.vx = Math.round(vx);
    this.vy = Math.round(vy);
    if (dir === 'left' || dir === 'right') this.dir = dir;
    if (typeof anim === 'string') this.anim = anim;
  }

  // 네트워크 전송용 직렬화 (좌표는 정수로 — 트래픽 최소화)
  serialize() {
    return {
      id: this.id,
      nick: this.nick,
      x: Math.round(this.x),
      y: Math.round(this.y),
      vx: Math.round(this.vx),
      vy: Math.round(this.vy),
      dir: this.dir,
      anim: this.anim,
      level: this.level,
      hp: this.hp,
      maxHp: this.maxHp,
      mp: this.mp,
      maxMp: this.maxMp,
      exp: this.exp,
    };
  }
}

module.exports = Player;

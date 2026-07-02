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

    // 생존 상태 (Phase 4 — 몬스터 접촉 데미지/사망/부활)
    this.alive = true;
    this.lastHitAt = 0;  // 마지막 피격 시각(ms) — 무적창 계산용
    this.respawnAt = 0;  // 사망 시 부활 예정 시각(ms)

    // 영구 저장 연동 — 계정 키(닉네임 정규화). 저장 로직이 이 키로 진행도를 기록한다.
    this.nickKey = null;
  }

  // 저장된 계정 진행도를 로드 (HP/MP는 완전 회복 상태로 시작)
  loadStats(rec) {
    this.level = rec.level;
    this.exp = rec.exp;
    this.maxHp = rec.maxHp;
    this.maxMp = rec.maxMp;
    this.atk = rec.atk;
    this.hp = this.maxHp;
    this.mp = this.maxMp;
  }

  // 저장용 진행도 추출 (위치/생존 상태는 저장하지 않음 — 접속 시 스폰/풀피)
  saveData() {
    return {
      level: this.level,
      exp: this.exp,
      maxHp: this.maxHp,
      maxMp: this.maxMp,
      atk: this.atk,
    };
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

  // ---------------- 성장 (서버 권위) ----------------
  // 현재 레벨에서 다음 레벨까지 필요한 EXP. 만렙이면 Infinity.
  expToNext() {
    if (this.level >= config.GROWTH.MAX_LEVEL) return Infinity;
    return Math.floor(config.GROWTH.EXP_BASE * Math.pow(this.level, config.GROWTH.EXP_POW));
  }

  // EXP 획득 → 필요 시 여러 번 레벨업(초과분 이월). { leveledUp, levels } 반환.
  gainExp(amount) {
    if (!(amount > 0)) return { leveledUp: false, levels: [] };
    this.exp += amount;

    const levels = [];
    while (this.level < config.GROWTH.MAX_LEVEL && this.exp >= this.expToNext()) {
      this.exp -= this.expToNext();
      this.levelUp();
      levels.push(this.level);
    }
    // 만렙 도달 시 EXP 바를 가득 찬 상태로 클램프(더 이상 누적 안 함)
    if (this.level >= config.GROWTH.MAX_LEVEL) this.exp = 0;

    return { leveledUp: levels.length > 0, levels };
  }

  // 한 단계 레벨업: 최대 스탯 증가 + HP/MP 완전 회복
  levelUp() {
    this.level += 1;
    this.maxHp += config.GROWTH.HP_PER_LEVEL;
    this.maxMp += config.GROWTH.MP_PER_LEVEL;
    this.atk += config.GROWTH.ATK_PER_LEVEL;
    this.hp = this.maxHp;
    this.mp = this.maxMp;
  }

  // ---------------- 생존 (서버 권위) ----------------
  // 데미지 적용. 무적창 중/이미 사망이면 null. 아니면 { died, hp, dmg }.
  takeDamage(dmg, now) {
    if (!this.alive) return null;
    if (now - this.lastHitAt < config.PLAYER.HIT_INVULN_MS) return null; // 무적 중
    this.lastHitAt = now;
    this.hp = Math.max(0, this.hp - dmg);
    if (this.hp === 0) {
      this.alive = false;
      this.respawnAt = now + config.PLAYER.RESPAWN_MS;
      return { died: true, hp: 0, dmg };
    }
    return { died: false, hp: this.hp, dmg };
  }

  // 스폰 지점에서 부활: HP/MP 완전 회복 + 위치 초기화
  respawn(spawn) {
    this.alive = true;
    this.hp = this.maxHp;
    this.mp = this.maxMp;
    this.x = spawn.x;
    this.y = spawn.y;
    this.vx = 0;
    this.vy = 0;
    this.lastHitAt = 0;
    this.respawnAt = 0;
  }

  // HUD/이벤트 전송용 스탯 묶음 (expToNext는 JSON 안전하게 만렙이면 null)
  stats() {
    const e = this.expToNext();
    return {
      level: this.level,
      hp: this.hp,
      maxHp: this.maxHp,
      mp: this.mp,
      maxMp: this.maxMp,
      atk: this.atk,
      exp: this.exp,
      expToNext: isFinite(e) ? e : null,
    };
  }

  // 네트워크 전송용 직렬화 (좌표는 정수로 — 트래픽 최소화)
  serialize() {
    const e = this.expToNext();
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
      expToNext: isFinite(e) ? e : null,
      atk: this.atk,
      alive: this.alive,
    };
  }
}

module.exports = Player;

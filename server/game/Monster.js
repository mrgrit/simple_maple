// =============================================================
// Monster.js — 몬스터 상태 모델 (서버 권위)
//   타입별 스탯(HP/속도/EXP/접촉데미지/크기)을 config.MONSTER_TYPES 에서 읽는다.
//   위치/HP/배회 AI/리스폰을 모두 서버가 관리하며, 클라는 결과만 렌더링한다.
//   스폰/리스폰 위치는 배회 범위 내에서 랜덤 → "항상 같은 자리" 문제 완화.
// =============================================================

const config = require('../config');

let nextId = 1;

// [min, max] 사이 실수 랜덤 (범위가 유효하지 않으면 min)
function randBetween(min, max) {
  if (!(max > min)) return min;
  return min + Math.random() * (max - min);
}

class Monster {
  constructor(spawn) {
    this.id = `m${nextId++}`;
    this.type = spawn.type || 'slime';

    // 타입별 스탯 (테이블에 없으면 기본값 폴백)
    const t = config.MONSTER_TYPES[this.type] || {};
    const D = config.MONSTER;
    this.maxHp = t.hp != null ? t.hp : D.DEFAULT_HP;
    this.speed = t.speed != null ? t.speed : D.SPEED;
    this.expDrop = t.expDrop != null ? t.expDrop : D.EXP_DROP;
    this.touchDamage = t.touchDamage != null ? t.touchDamage : D.TOUCH_DAMAGE;
    this.respawnMs = t.respawnMs != null ? t.respawnMs : D.RESPAWN_MS;
    this.width = t.width != null ? t.width : D.WIDTH;
    this.height = t.height != null ? t.height : D.HEIGHT;

    // 배회 범위 (좌/우 한계)
    this.patrolMin = spawn.patrolMin;
    this.patrolMax = spawn.patrolMax;

    // 서 있는 지면(플랫폼/바닥) 상단 y — 그 위에 몸 중심이 오도록 y 계산.
    // 하위호환: groundY 없으면 옛 스타일 spawn.y(중심) 사용.
    this.groundY =
      spawn.groundY != null ? spawn.groundY : spawn.y != null ? spawn.y + this.height / 2 : 680;
    this.y = this.groundY - this.height / 2;

    // 초기 위치/방향 랜덤 (배회 범위 내)
    this.x = randBetween(this.patrolMin, this.patrolMax);
    this.dir = Math.random() < 0.5 ? 'left' : 'right';

    this.hp = this.maxHp;
    this.alive = true;
    this.respawnAt = 0; // 사망 시 리스폰 예정 시각(ms)
  }

  // 매 틱 호출: 좌우 배회 + 리스폰 처리
  update(dt, now) {
    if (!this.alive) {
      if (now >= this.respawnAt) this.respawn();
      return;
    }
    const step = this.speed * dt;
    if (this.dir === 'right') {
      this.x += step;
      if (this.x >= this.patrolMax) {
        this.x = this.patrolMax;
        this.dir = 'left';
      }
    } else {
      this.x -= step;
      if (this.x <= this.patrolMin) {
        this.x = this.patrolMin;
        this.dir = 'right';
      }
    }
  }

  // 데미지 적용 → { died, hp } 반환 (이미 죽었으면 null)
  takeDamage(dmg, now) {
    if (!this.alive) return null;
    this.hp = Math.max(0, this.hp - dmg);
    if (this.hp === 0) {
      this.alive = false;
      this.respawnAt = now + this.respawnMs;
      return { died: true, hp: 0 };
    }
    return { died: false, hp: this.hp };
  }

  // 리스폰: 배회 범위 내 랜덤 위치/방향으로 부활 (같은 자리 반복 방지)
  respawn() {
    this.alive = true;
    this.hp = this.maxHp;
    this.x = randBetween(this.patrolMin, this.patrolMax);
    this.y = this.groundY - this.height / 2;
    this.dir = Math.random() < 0.5 ? 'left' : 'right';
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      x: Math.round(this.x),
      y: Math.round(this.y),
      dir: this.dir,
      hp: this.hp,
      maxHp: this.maxHp,
      alive: this.alive,
    };
  }
}

module.exports = Monster;

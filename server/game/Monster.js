// =============================================================
// Monster.js — 몬스터 상태 모델 (서버 권위)
//   위치/HP/배회 AI/리스폰을 모두 서버가 관리한다.
//   클라이언트는 monstersUpdate 로 받은 결과만 렌더링한다(치팅 방지).
// =============================================================

const config = require('../config');

let nextId = 1;

class Monster {
  constructor(spawn) {
    this.id = `m${nextId++}`;
    this.type = spawn.type || 'slime';

    // 스폰 위치(리스폰 시 복귀 지점)
    this.spawnX = spawn.x;
    this.spawnY = spawn.y;
    this.x = spawn.x;
    this.y = spawn.y;
    this.dir = 'left';

    this.maxHp = config.MONSTER.DEFAULT_HP;
    this.hp = this.maxHp;
    this.expDrop = config.MONSTER.EXP_DROP;

    // 배회 범위 (좌/우 한계)
    this.patrolMin = spawn.patrolMin;
    this.patrolMax = spawn.patrolMax;

    this.alive = true;
    this.respawnAt = 0; // 사망 시 리스폰 예정 시각(ms)
  }

  // 매 틱 호출: 좌우 배회 + 리스폰 처리
  update(dt, now) {
    if (!this.alive) {
      if (now >= this.respawnAt) this.respawn();
      return;
    }
    // 좌우 배회: 한계에 닿으면 방향 전환
    const step = config.MONSTER.SPEED * dt;
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
      this.respawnAt = now + config.MONSTER.RESPAWN_MS;
      return { died: true, hp: 0 };
    }
    return { died: false, hp: this.hp };
  }

  respawn() {
    this.alive = true;
    this.hp = this.maxHp;
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.dir = 'left';
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

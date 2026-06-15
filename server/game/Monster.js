// =============================================================
// Monster.js — 몬스터 상태 모델 (서버 권위)
//   ⚠️ Phase 3에서 본격 구현 예정.
//   현재는 구조만 잡아둔 골격이며, 위치/HP/배회 AI/리스폰을 서버가 관리하게 된다.
// =============================================================

const config = require('../config');

let nextId = 1;

class Monster {
  constructor(spawn) {
    this.id = `m${nextId++}`;
    this.type = spawn.type || 'slime';
    this.x = spawn.x;
    this.y = spawn.y;
    this.dir = 'left';

    this.maxHp = config.MONSTER.DEFAULT_HP;
    this.hp = this.maxHp;
    this.expDrop = config.MONSTER.EXP_DROP;

    // 배회 범위
    this.patrolMin = spawn.patrolMin;
    this.patrolMax = spawn.patrolMax;

    this.alive = true;
    this.respawnAt = 0; // 사망 시 리스폰 예정 시각(ms)
  }

  // Phase 3: 매 틱 호출되어 좌우 배회 AI 갱신
  update(dt) {
    // TODO(Phase 3): 좌우 배회 + 리스폰 처리
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

// =============================================================
// GameState.js — 전체 게임 상태(플레이어/몬스터) 관리
//   Phase 1~2: 플레이어 접속/이동/퇴장 관리
//   Phase 3: 몬스터 컬렉션 + 서버 틱 갱신 + 전투 판정(서버 권위)
// =============================================================

const config = require('../config');
const Player = require('./Player');
const Monster = require('./Monster');

class GameState {
  constructor() {
    this.players = new Map(); // socketId -> Player
    this.monsters = new Map(); // monsterId -> Monster
  }

  // ---------------- 플레이어 ----------------
  addPlayer(id, nick, spawn) {
    const player = new Player(id, nick, spawn);
    this.players.set(id, player);
    return player;
  }

  getPlayer(id) {
    return this.players.get(id);
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  serializePlayers(exceptId = null) {
    const list = [];
    for (const [id, p] of this.players) {
      if (id === exceptId) continue;
      list.push(p.serialize());
    }
    return list;
  }

  get playerCount() {
    return this.players.size;
  }

  // ---------------- 몬스터 ----------------
  // 맵의 스폰 데이터로 몬스터 생성
  spawnMonsters(spawns = []) {
    spawns.forEach((s) => {
      const m = new Monster(s);
      this.monsters.set(m.id, m);
    });
  }

  // 매 틱 몬스터 AI/리스폰 갱신
  updateMonsters(dt, now) {
    for (const m of this.monsters.values()) m.update(dt, now);
  }

  serializeMonsters() {
    return Array.from(this.monsters.values()).map((m) => m.serialize());
  }

  // ---------------- 전투 (서버 권위) ----------------
  // 플레이어의 근접 공격 판정. 쿨다운 중이면 null.
  // 반환: { facing, hits, expGained, leveledUp, levels }
  // hits: [{ monster, dmg, died, hp }]
  resolveAttack(player, dir, now) {
    const cd = config.COMBAT.ATTACK_COOLDOWN_MS;
    if (now - player.lastAttackAt < cd) return null; // 연사 차단
    player.lastAttackAt = now;

    const range = config.COMBAT.ATTACK_RANGE;
    const vtol = config.COMBAT.ATTACK_VTOL;
    const facing = dir === 'left' ? 'left' : 'right';
    const minX = facing === 'right' ? player.x : player.x - range;
    const maxX = facing === 'right' ? player.x + range : player.x;

    const hits = [];
    let expGained = 0;
    for (const m of this.monsters.values()) {
      if (!m.alive) continue;
      if (m.x >= minX && m.x <= maxX && Math.abs(m.y - player.y) <= vtol) {
        const res = m.takeDamage(player.atk, now);
        if (res) {
          hits.push({ monster: m, dmg: player.atk, died: res.died, hp: res.hp });
          if (res.died) expGained += m.expDrop;
        }
      }
    }

    // EXP 획득 → 레벨업 처리(서버 권위, 초과분 이월)
    const growth = expGained > 0 ? player.gainExp(expGained) : { leveledUp: false, levels: [] };
    return { facing, hits, expGained, leveledUp: growth.leveledUp, levels: growth.levels };
  }

  // ---------------- 몬스터 접촉 데미지 (서버 권위, 매 틱) ----------------
  // 살아있는 플레이어와 몬스터의 AABB 겹침을 검사해 접촉 데미지를 적용한다.
  // 반환: [{ player, dmg, died, hp }] (실제 데미지가 들어간 건만)
  resolveMonsterTouches(now) {
    const events = [];
    const pw = config.PLAYER.WIDTH;
    const ph = config.PLAYER.HEIGHT;

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      for (const m of this.monsters.values()) {
        if (!m.alive) continue;
        // 중심 좌표 기준 AABB 겹침 (몬스터 크기·접촉데미지는 타입별)
        if (Math.abs(p.x - m.x) <= (pw + m.width) / 2 && Math.abs(p.y - m.y) <= (ph + m.height) / 2) {
          const res = p.takeDamage(m.touchDamage, now);
          if (res) events.push({ player: p, dmg: res.dmg, died: res.died, hp: res.hp });
          break; // 한 틱에 한 몬스터에게만 피격
        }
      }
    }
    return events;
  }

  // 부활 대기 시간이 지난 사망 플레이어를 되살린다. 반환: [부활한 Player]
  respawnPlayers(now, spawn) {
    const revived = [];
    for (const p of this.players.values()) {
      if (!p.alive && now >= p.respawnAt) {
        p.respawn(spawn);
        revived.push(p);
      }
    }
    return revived;
  }
}

module.exports = GameState;

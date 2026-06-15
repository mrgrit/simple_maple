// =============================================================
// GameState.js — 전체 게임 상태(플레이어/몬스터) 관리
//   Phase 1: 플레이어 접속/퇴장 관리만 사용.
//   Phase 3에서 몬스터 컬렉션과 서버 틱 갱신이 추가된다.
// =============================================================

const Player = require('./Player');
// const Monster = require('./Monster'); // Phase 3에서 사용

class GameState {
  constructor() {
    this.players = new Map(); // socketId -> Player
    // this.monsters = new Map(); // Phase 3
  }

  // 플레이어 추가
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

  // 모든 플레이어 직렬화 (한 명 제외 옵션 — 보통 자기 자신 제외)
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
}

module.exports = GameState;

// =============================================================
// config.js — 게임 전역 설정 및 밸런스 상수
// 모든 튜닝 값(이동속도, 점프력, 몬스터 HP, EXP 등)을 이 한 곳에서 관리한다.
// 클라이언트는 접속 시 서버로부터 필요한 튜닝 값을 전달받아 사용한다(치팅 방지 + 단일 출처).
// =============================================================

module.exports = {
  // 서버 네트워크
  PORT: process.env.PORT || 3000,
  HOST: '0.0.0.0', // LAN 다중 접속을 위해 모든 인터페이스에 바인딩

  // 서버 게임 루프 (Phase 3 몬스터 AI / 상태 브로드캐스트부터 본격 사용)
  TICK_RATE: 20, // Hz (1초에 20회)

  // 월드 물리 (전역)
  WORLD: {
    GRAVITY: 900, // 중력 가속도 (px/s^2)
  },

  // 플레이어 밸런스
  PLAYER: {
    SPEED: 220,     // 좌우 이동 속도 (px/s)
    JUMP: 520,      // 점프 초기 속도 (px/s)
    WIDTH: 32,      // 충돌 박스 가로
    HEIGHT: 48,     // 충돌 박스 세로
    MAX_HP: 100,
    MAX_MP: 50,
    START_LEVEL: 1,
    HIT_INVULN_MS: 800,  // 피격 후 무적 시간(연속 피격 완화)
    RESPAWN_MS: 3000,    // 사망 후 부활까지 대기 시간
  },

  // 성장 곡선 (Phase 4에서 사용)
  GROWTH: {
    // 레벨업에 필요한 EXP: BASE * level^EXP_POW 형태로 계산
    EXP_BASE: 20,
    EXP_POW: 1.5,
    HP_PER_LEVEL: 20,   // 레벨업 시 최대 HP 증가량
    MP_PER_LEVEL: 10,   // 레벨업 시 최대 MP 증가량
    ATK_PER_LEVEL: 3,   // 레벨업 시 공격력 증가량
    BASE_ATK: 10,
    MAX_LEVEL: 50,      // 만렙(EXP 곡선 상한 + 레벨업 루프 안전장치)
  },

  // 몬스터 기본값 (타입 테이블에 없는 값의 폴백)
  MONSTER: {
    DEFAULT_HP: 30,
    SPEED: 40,         // 배회 속도 (px/s)
    EXP_DROP: 12,
    RESPAWN_MS: 4000,  // 사망 후 리스폰까지 대기 시간
    WIDTH: 36,
    HEIGHT: 32,
    TOUCH_DAMAGE: 6,   // 몬스터 접촉 시 플레이어가 받는 데미지
  },

  // 몬스터 타입 테이블 — 종류별 스탯/크기/색 (서버 권위, 시각정보는 init로 클라 전달)
  // 난이도 순: 달팽이(쉬움) → 돌골렘(미니보스). color/stroke 는 0xRRGGBB.
  MONSTER_TYPES: {
    snail:    { name: '달팽이',    hp: 15,  speed: 20, expDrop: 5,  touchDamage: 3,  respawnMs: 4000, width: 30, height: 24, color: 0x8ecae6, stroke: 0x4a90b8 },
    slime:    { name: '초록슬라임', hp: 25,  speed: 45, expDrop: 10, touchDamage: 5,  respawnMs: 4000, width: 36, height: 32, color: 0x6bc16b, stroke: 0x3f9b50 },
    redSlime: { name: '빨강슬라임', hp: 40,  speed: 60, expDrop: 16, touchDamage: 8,  respawnMs: 5000, width: 38, height: 34, color: 0xff6b6b, stroke: 0xc23b3b },
    mushroom: { name: '버섯',      hp: 60,  speed: 35, expDrop: 24, touchDamage: 11, respawnMs: 6000, width: 42, height: 40, color: 0xffa94d, stroke: 0xd9822b },
    boar:     { name: '멧돼지',    hp: 80,  speed: 80, expDrop: 32, touchDamage: 14, respawnMs: 6000, width: 48, height: 38, color: 0xd88ab0, stroke: 0xa85a82 },
    golem:    { name: '돌골렘',    hp: 140, speed: 25, expDrop: 60, touchDamage: 20, respawnMs: 9000, width: 54, height: 54, color: 0x9aa0a6, stroke: 0x5f6469 },
  },

  // 전투 (Phase 3에서 사용) — 모든 판정/데미지는 서버 권위
  COMBAT: {
    ATTACK_RANGE: 70,        // 근접 공격 사거리(앞쪽, px)
    ATTACK_VTOL: 50,         // 공격 유효 수직 허용 오차(px)
    ATTACK_COOLDOWN_MS: 350, // 공격 쿨다운(연사 차단)
  },

  // 이동 검증 (반권위 모델 — 비정상 좌표/속도 차단, Phase 2에서 사용)
  VALIDATION: {
    MAX_SPEED_FACTOR: 2.0, // 허용 최대 속도 = PLAYER.SPEED * 이 값
  },
};

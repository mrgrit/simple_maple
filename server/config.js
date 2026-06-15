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
  },

  // 성장 곡선 (Phase 4에서 사용)
  GROWTH: {
    // 레벨업에 필요한 EXP: BASE * level^EXP_POW 형태로 계산
    EXP_BASE: 20,
    EXP_POW: 1.5,
    HP_PER_LEVEL: 20,   // 레벨업 시 최대 HP 증가량
    ATK_PER_LEVEL: 3,   // 레벨업 시 공격력 증가량
    BASE_ATK: 10,
  },

  // 몬스터 밸런스 (Phase 3에서 사용)
  MONSTER: {
    DEFAULT_HP: 30,
    SPEED: 40,
    EXP_DROP: 12,
    RESPAWN_MS: 4000, // 사망 후 리스폰까지 대기 시간
  },

  // 이동 검증 (반권위 모델 — 비정상 좌표/속도 차단, Phase 2에서 사용)
  VALIDATION: {
    MAX_SPEED_FACTOR: 2.0, // 허용 최대 속도 = PLAYER.SPEED * 이 값
  },
};

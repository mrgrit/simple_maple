// =============================================================
// maps.js — 맵 정의 (플랫폼/발판, 스폰 위치, 몬스터 스폰 데이터)
// 좌표 단위: 픽셀. 플랫폼의 x/y 는 "좌상단" 기준이며 width/height 를 가진다.
// 서버가 권위를 갖고 맵 데이터를 클라이언트에 전달 → 클라이언트는 이를 그대로 렌더링한다.
//
// 몬스터 스폰 스키마: { type, groundY, patrolMin, patrolMax }
//   - type      : config.MONSTER_TYPES 의 키 (snail/slime/redSlime/mushroom/boar/golem)
//   - groundY   : 몬스터가 서 있는 지면(바닥/플랫폼)의 "상단" y. 몸 중심 y 는 서버가 계산.
//   - patrol*   : 좌우 배회 한계. 초기/리스폰 위치는 이 범위 내에서 랜덤(자리 고정 완화).
// 지면 상단 y 참고: 바닥=680, 플랫폼들=아래 platforms 의 각 y.
// =============================================================

const maps = {
  village: {
    id: 'village',
    name: '초보자 마을',
    width: 2400,
    height: 720,
    background: '#1a1a2e', // 배경색
    spawn: { x: 200, y: 500 }, // 플레이어 스폰 위치(중심 기준)

    // 발판(플랫폼) 목록: { x, y, width, height } (좌상단 기준)
    platforms: [
      { x: 0,    y: 680, width: 2400, height: 40 }, // 바닥(맵 전체)
      { x: 280,  y: 560, width: 220,  height: 24 }, // P1
      { x: 600,  y: 440, width: 200,  height: 24 }, // P2
      { x: 950,  y: 560, width: 240,  height: 24 }, // P3
      { x: 1300, y: 440, width: 200,  height: 24 }, // P4
      { x: 1650, y: 540, width: 260,  height: 24 }, // P5
      { x: 2000, y: 420, width: 220,  height: 24 }, // P6
    ],

    // 몬스터 스폰 데이터 — 다양한 종류를 지상/플랫폼에 다수 배치.
    monsterSpawns: [
      // --- 지상 (groundY: 680) : 왼쪽(쉬움) → 오른쪽(어려움) 대략적 난이도 곡선 ---
      { type: 'snail',    groundY: 680, patrolMin: 100,  patrolMax: 420 },
      { type: 'snail',    groundY: 680, patrolMin: 450,  patrolMax: 820 },
      { type: 'slime',    groundY: 680, patrolMin: 350,  patrolMax: 760 },
      { type: 'slime',    groundY: 680, patrolMin: 700,  patrolMax: 1080 },
      { type: 'mushroom', groundY: 680, patrolMin: 820,  patrolMax: 1180 },
      { type: 'redSlime', groundY: 680, patrolMin: 1000, patrolMax: 1420 },
      { type: 'slime',    groundY: 680, patrolMin: 1150, patrolMax: 1550 },
      { type: 'mushroom', groundY: 680, patrolMin: 1350, patrolMax: 1780 },
      { type: 'golem',    groundY: 680, patrolMin: 1500, patrolMax: 1950 },
      { type: 'boar',     groundY: 680, patrolMin: 1720, patrolMax: 2120 },
      { type: 'redSlime', groundY: 680, patrolMin: 2050, patrolMax: 2360 },

      // --- 플랫폼 (각 플랫폼 상단 y, 배회는 플랫폼 폭 안쪽으로) ---
      { type: 'slime',    groundY: 560, patrolMin: 300,  patrolMax: 480 },  // P1
      { type: 'snail',    groundY: 440, patrolMin: 620,  patrolMax: 780 },  // P2
      { type: 'redSlime', groundY: 560, patrolMin: 970,  patrolMax: 1170 }, // P3
      { type: 'mushroom', groundY: 440, patrolMin: 1320, patrolMax: 1480 }, // P4
      { type: 'slime',    groundY: 540, patrolMin: 1670, patrolMax: 1890 }, // P5
      { type: 'boar',     groundY: 420, patrolMin: 2020, patrolMax: 2200 }, // P6
    ],
  },
};

// 맵 조회 헬퍼 (없으면 기본 마을 반환)
function getMap(id) {
  return maps[id] || maps.village;
}

module.exports = { maps, getMap };

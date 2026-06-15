// =============================================================
// maps.js — 맵 정의 (플랫폼/발판, 스폰 위치, 몬스터 스폰 데이터)
// 좌표 단위: 픽셀. 플랫폼의 x/y 는 "좌상단" 기준이며 width/height 를 가진다.
// 서버가 권위를 갖고 맵 데이터를 클라이언트에 전달 → 클라이언트는 이를 그대로 렌더링한다.
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
      { x: 280,  y: 560, width: 220,  height: 24 },
      { x: 600,  y: 440, width: 200,  height: 24 },
      { x: 950,  y: 560, width: 240,  height: 24 },
      { x: 1300, y: 440, width: 200,  height: 24 },
      { x: 1650, y: 540, width: 260,  height: 24 },
      { x: 2000, y: 420, width: 220,  height: 24 },
    ],

    // 몬스터 스폰 데이터 (Phase 3에서 사용)
    // { type, x, y, patrolMin, patrolMax }
    // y=664 → 슬라임(36x32, 중심 원점)이 바닥(상단 680) 위에 서도록
    monsterSpawns: [
      { type: 'slime', x: 400,  y: 664, patrolMin: 100,  patrolMax: 700 },
      { type: 'slime', x: 1100, y: 664, patrolMin: 850,  patrolMax: 1400 },
      { type: 'slime', x: 1800, y: 664, patrolMin: 1550, patrolMax: 2100 },
    ],
  },
};

// 맵 조회 헬퍼 (없으면 기본 마을 반환)
function getMap(id) {
  return maps[id] || maps.village;
}

module.exports = { maps, getMap };

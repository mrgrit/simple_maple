// Phase 1 헤드리스 브라우저 검증: 실제 Phaser 클라이언트를 띄워
// 중력/착지/좌우이동/방향전환/점프 동작과 콘솔 에러 유무를 확인한다.
const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? '  — ' + extra : ''}`);
};

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
  });

  // getState 헬퍼 (페이지 컨텍스트에서 GameScene 상태를 읽음)
  const getState = () =>
    page.evaluate(() => {
      const s = window.game && window.game.scene.getScene('GameScene');
      if (!s || !s.player) return null;
      return {
        ready: !!s.ready,
        x: Math.round(s.player.x),
        y: Math.round(s.player.y),
        vx: Math.round(s.player.body.velocity.x),
        vy: Math.round(s.player.body.velocity.y),
        onFloor: s.player.body.blocked.down,
        flipX: s.player.flipX,
        platforms: s.platforms ? s.platforms.length : 0,
      };
    });

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });

    // 닉네임 입력 후 시작
    await page.waitForSelector('#nick', { timeout: 5000 });
    await page.type('#nick', 'TestHero');
    await page.click('#startBtn');
    ok('로그인 → 게임 시작', true);

    // GameScene 준비 대기
    await page.waitForFunction(
      () => {
        const s = window.game && window.game.scene.getScene('GameScene');
        return s && s.ready === true && s.player;
      },
      { timeout: 20000 }
    );
    const spawn = await getState();
    ok('GameScene ready + 플레이어 생성', spawn && spawn.ready, JSON.stringify(spawn));
    ok('플랫폼 7개 생성됨', spawn && spawn.platforms === 7, 'platforms=' + (spawn && spawn.platforms));

    // 포커스 확보 (키 입력 수신용)
    await page.bringToFront();
    await page.mouse.click(640, 360);

    // 1) 중력/착지: 잠시 기다리면 바닥에 안착
    await sleep(900);
    const landed = await getState();
    ok('중력으로 낙하 후 착지', landed.onFloor === true && landed.y > spawn.y, JSON.stringify(landed));

    // 2) 오른쪽 이동
    const beforeR = await getState();
    await page.keyboard.down('ArrowRight');
    await sleep(500);
    await page.keyboard.up('ArrowRight');
    const afterR = await getState();
    ok('오른쪽 이동 (x 증가)', afterR.x > beforeR.x + 40, `${beforeR.x} → ${afterR.x}`);
    ok('오른쪽 볼 때 flipX=false', afterR.flipX === false);

    // 3) 왼쪽 이동 + 방향 전환
    const beforeL = await getState();
    await page.keyboard.down('ArrowLeft');
    await sleep(400);
    await page.keyboard.up('ArrowLeft');
    const afterL = await getState();
    ok('왼쪽 이동 (x 감소)', afterL.x < beforeL.x - 20, `${beforeL.x} → ${afterL.x}`);
    ok('왼쪽 볼 때 flipX=true', afterL.flipX === true);

    // 4) 점프: 바닥에서 위로 속도 발생
    await sleep(300); // 다시 착지 대기
    const beforeJ = await getState();
    await page.keyboard.down('ArrowUp');
    await sleep(120);
    const midJ = await getState();
    await page.keyboard.up('ArrowUp');
    ok('점프 (위로 속도 발생 vy<0)', beforeJ.onFloor && midJ.vy < 0, `vy=${midJ.vy}`);
    await sleep(1200);
    const afterJ = await getState();
    ok('점프 후 다시 착지', afterJ.onFloor === true, `y=${afterJ.y}`);

    // 스크린샷
    await page.screenshot({ path: '/tmp/maple_phase1.png' });
    console.log('📸 스크린샷 저장: /tmp/maple_phase1.png');

    ok('JS 런타임 에러 없음', errors.length === 0, errors.join(' | '));
  } catch (e) {
    ok('테스트 실행 중 예외 없음', false, e.message);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== 결과: ${results.length - failed.length}/${results.length} 통과 ===`);
  process.exit(failed.length === 0 ? 0 : 1);
})();

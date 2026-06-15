// Phase 2 헤드리스 검증: 두 개의 독립 브라우저(Alice/Bob)를 띄워
// 멀티플레이어 동기화(접속 인지 → 이동 보간 반영 → 퇴장 제거)를 확인한다.
// ※ 백그라운드 탭은 Phaser 렌더가 멈추므로 브라우저를 2개 띄운다.
const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? '  — ' + extra : ''}`);
};

const launchOpts = {
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
};

// 씬에서 "다른 플레이어" 상태 읽기
const readOthers = (page) =>
  page.evaluate(() => {
    const s = window.game && window.game.scene.getScene('GameScene');
    if (!s || !s.ready) return { ready: false };
    const o = Object.values(s.others)[0];
    return {
      ready: true,
      count: Object.keys(s.others).length,
      x: o ? Math.round(o.sprite.x) : null,
      nick: o ? o.nick : null,
    };
  });

async function startClient(browser, nick) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 600 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
  });
  await page.goto((process.env.BASE_URL || 'http://localhost:3000'), { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('#nick', { timeout: 5000 });
  await page.type('#nick', nick);
  await page.click('#startBtn');
  await page.waitForFunction(
    () => {
      const s = window.game && window.game.scene.getScene('GameScene');
      return s && s.ready === true && s.player;
    },
    { timeout: 20000 }
  );
  return { page, errors };
}

(async () => {
  const browserA = await puppeteer.launch(launchOpts);
  const browserB = await puppeteer.launch(launchOpts);
  let A;

  try {
    A = await startClient(browserA, 'Alice');
    const B = await startClient(browserB, 'Bob');
    ok('두 클라이언트 접속 + GameScene ready', true);

    // 서로를 인지할 때까지 대기
    await A.page.waitForFunction(
      () => {
        const s = window.game.scene.getScene('GameScene');
        return Object.keys(s.others).length === 1;
      },
      { timeout: 15000 }
    );
    await B.page.waitForFunction(
      () => {
        const s = window.game.scene.getScene('GameScene');
        return Object.keys(s.others).length === 1;
      },
      { timeout: 15000 }
    );
    const aSeesB = await readOthers(A.page);
    const bSeesA = await readOthers(B.page);
    ok('Alice가 Bob을 인지 (닉네임 동기화)', aSeesB.count === 1 && aSeesB.nick === 'Bob', JSON.stringify(aSeesB));
    ok('Bob이 Alice를 인지', bSeesA.count === 1 && bSeesA.nick === 'Alice', JSON.stringify(bSeesA));

    // 착지 대기 후, Bob을 오른쪽으로 이동 → Alice 화면에서 Bob의 x가 증가해야 함
    await sleep(700);
    const before = await readOthers(A.page);
    await B.page.bringToFront();
    await B.page.mouse.click(500, 300);
    await B.page.keyboard.down('ArrowRight');
    await sleep(1300);
    await B.page.keyboard.up('ArrowRight');
    await sleep(350); // 마지막 패킷 + 보간 반영 대기
    const after = await readOthers(A.page);
    ok(
      'Bob 이동이 Alice 화면에 보간 반영 (x 증가)',
      after.x > before.x + 60,
      `${before.x} → ${after.x}`
    );

    // 두 캐릭터가 보이는 Alice 시점 스크린샷
    await A.page.bringToFront();
    await A.page.screenshot({ path: '/tmp/maple_phase2.png' });
    console.log('📸 스크린샷 저장: /tmp/maple_phase2.png');

    // Bob 퇴장 → Alice 화면에서 제거되어야 함
    await browserB.close();
    await A.page.waitForFunction(
      () => Object.keys(window.game.scene.getScene('GameScene').others).length === 0,
      { timeout: 8000 }
    );
    const afterLeft = await readOthers(A.page);
    ok('Bob 퇴장 시 Alice 화면에서 제거', afterLeft.count === 0, 'count=' + afterLeft.count);

    ok('Alice 측 JS 런타임 에러 없음', A.errors.length === 0, A.errors.join(' | '));
  } catch (e) {
    ok('테스트 실행 중 예외 없음', false, e.message);
  } finally {
    await browserA.close();
    try {
      await browserB.close();
    } catch (_) {}
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== 결과: ${results.length - failed.length}/${results.length} 통과 ===`);
  process.exit(failed.length === 0 ? 0 : 1);
})();

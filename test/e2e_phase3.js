// Phase 3 헤드리스 검증: 몬스터 스폰/배회 + 전투(공격→데미지→사망→EXP).
const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? '  — ' + extra : ''}`);
};

const scene = (page, fn) => page.evaluate(fn);

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 640 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
  });

  try {
    await page.goto((process.env.BASE_URL || 'http://localhost:3000'), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('#nick', { timeout: 5000 });
    await page.type('#nick', 'Hunter');
    await page.type('#pw', 'test1234'); // 계정 비밀번호(신규 자동 가입)
    await page.click('#startBtn');
    await page.waitForFunction(
      () => {
        const s = window.game && window.game.scene.getScene('GameScene');
        return s && s.ready && s.player;
      },
      { timeout: 20000 }
    );
    await page.bringToFront();
    await page.mouse.click(550, 320);

    // 몬스터 스폰 확인
    await page.waitForFunction(
      () => Object.keys(window.game.scene.getScene('GameScene').monsters).length >= 3,
      { timeout: 8000 }
    );
    const mCount = await scene(page, () => Object.keys(window.game.scene.getScene('GameScene').monsters).length);
    ok('몬스터 3마리 스폰', mCount === 3, 'count=' + mCount);

    // 배회(이동) 확인
    const x1 = await scene(page, () => Math.round(Object.values(window.game.scene.getScene('GameScene').monsters)[0].sprite.x));
    await sleep(700);
    const x2 = await scene(page, () => Math.round(Object.values(window.game.scene.getScene('GameScene').monsters)[0].sprite.x));
    ok('몬스터 배회(좌우 이동)', x1 !== x2, `${x1} → ${x2}`);

    // 전투: 가장 가까운 몬스터에게 접근하며 공격 → EXP 획득까지
    let exp = 0;
    for (let i = 0; i < 50 && exp === 0; i++) {
      const info = await scene(page, () => {
        const s = window.game.scene.getScene('GameScene');
        const ms = Object.values(s.monsters).filter((o) => o.alive);
        if (!ms.length) return { px: Math.round(s.player.x), mx: null };
        let best = ms[0];
        for (const o of ms) {
          if (Math.abs(o.sprite.x - s.player.x) < Math.abs(best.sprite.x - s.player.x)) best = o;
        }
        return { px: Math.round(s.player.x), mx: Math.round(best.sprite.x) };
      });
      if (info.mx === null) {
        await sleep(200);
        continue;
      }
      const dist = info.mx - info.px;
      const key = dist >= 0 ? 'ArrowRight' : 'ArrowLeft';
      await page.keyboard.down(key);
      await sleep(Math.min(280, Math.max(40, Math.abs(dist) * 2)));
      await page.keyboard.up(key);
      await page.keyboard.press('KeyX');
      await sleep(380);
      exp = await scene(page, () => window.game.scene.getScene('GameScene').selfExp);
    }
    ok('공격으로 몬스터 처치 → EXP 획득', exp >= 12, 'exp=' + exp);

    // 적어도 한 마리는 사망 상태였음(현재 alive=false거나 리스폰됨) — EXP로 간접 확인됨
    await page.screenshot({ path: '/tmp/maple_phase3.png' });
    console.log('📸 스크린샷 저장: /tmp/maple_phase3.png');

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

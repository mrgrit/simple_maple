// =============================================================
// main.js — 진입점: 닉네임+비밀번호 인증 → 성공 시 Phaser 게임 부팅
//   인증(join)을 게임 부팅보다 먼저 처리한다. 서버가 init 을 주면 성공,
//   joinError 를 주면 로그인 화면에 사유를 표시하고 재시도하게 한다.
// =============================================================

(function () {
  const loginDiv = document.getElementById('login');
  const nickInput = document.getElementById('nick');
  const pwInput = document.getElementById('pw');
  const startBtn = document.getElementById('startBtn');
  const errDiv = document.getElementById('loginErr');
  let started = false;

  // Phaser 게임 설정 (인증 성공 후 생성)
  const phaserConfig = {
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#1a1a2e',
    physics: {
      default: 'arcade',
      // 실제 중력은 GameScene 이 서버 튜닝 값으로 설정 (여기서는 0)
      arcade: { gravity: { y: 0 }, debug: false },
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%',
    },
    scene: [BootScene, GameScene],
  };

  function showErr(msg) {
    if (errDiv) errDiv.textContent = msg || '';
  }
  function setBusy(b) {
    startBtn.disabled = b;
    startBtn.textContent = b ? '접속 중…' : '시작';
  }

  function startGame() {
    if (started) return;

    const nick = (nickInput.value || '').trim() || '용사';
    const pw = pwInput.value || '';
    showErr('');
    if (!pw) {
      showErr('비밀번호를 입력하세요.');
      pwInput.focus();
      return;
    }

    setBusy(true);
    if (!Net.socket) Net.connect();

    // 인증 응답 대기 (init=성공 / joinError=실패). 무응답 대비 타임아웃도 건다.
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      Net.socket.off('init', onInit);
      Net.socket.off('joinError', onErr);
    };
    const onInit = (data) => {
      if (settled) return;
      settled = true;
      cleanup();
      started = true;
      window.GAME_NICK = nick;
      window.GAME_INIT = data; // GameScene 이 이 초기 상태로 즉시 구성
      loginDiv.style.display = 'none';
      window.game = new Phaser.Game(phaserConfig);
    };
    const onErr = (e) => {
      if (settled) return;
      settled = true;
      cleanup();
      setBusy(false);
      showErr((e && e.reason) || '접속에 실패했습니다.');
      pwInput.select();
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      setBusy(false);
      showErr('서버 응답이 없습니다. 잠시 후 다시 시도하세요.');
    }, 8000);

    Net.socket.once('init', onInit);
    Net.socket.once('joinError', onErr);
    Net.join(nick, pw);
  }

  startBtn.addEventListener('click', startGame);
  const onEnter = (e) => {
    if (e.key === 'Enter') startGame();
  };
  nickInput.addEventListener('keydown', onEnter);
  pwInput.addEventListener('keydown', onEnter);
  nickInput.focus();
})();

// =============================================================
// main.js — 진입점: 닉네임 입력 처리 + Phaser 게임 부팅
// =============================================================

(function () {
  const loginDiv = document.getElementById('login');
  const nickInput = document.getElementById('nick');
  const startBtn = document.getElementById('startBtn');
  let started = false;

  function startGame() {
    if (started) return;
    started = true;

    const nick = (nickInput.value || '').trim() || '용사';
    window.GAME_NICK = nick; // GameScene 이 읽어감

    loginDiv.style.display = 'none';

    // 서버 연결
    Net.connect();

    // Phaser 게임 설정
    const config = {
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

    // 게임 인스턴스를 전역에 노출 (브라우저 콘솔 디버깅 / 자동화 테스트용)
    window.game = new Phaser.Game(config);
  }

  startBtn.addEventListener('click', startGame);
  nickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startGame();
  });
  nickInput.focus();
})();

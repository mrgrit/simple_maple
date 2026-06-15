// =============================================================
// GameScene.js — 메인 게임 씬
//   Phase 1: 서버에서 받은 맵으로 플랫폼 구성 → 단일 캐릭터 이동/점프/카메라 추적
//   Phase 2~: 다른 플레이어 동기화, 몬스터, 전투, HUD 등이 여기에 추가된다.
// =============================================================

class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.ready = false;
    this.selfId = null;
    this.player = null;
    this.others = {}; // Phase 2: 다른 플레이어 스프라이트 보관

    // 서버 튜닝 기본값 (init 으로 덮어씀)
    this.tuning = { gravity: 900, speed: 220, jump: 520, playerW: 32, playerH: 48 };

    // 연결 대기 안내 (화면 고정)
    this.waitText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, '서버 연결 중...', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);

    // init 수신 → 월드 구성 (리스너를 먼저 등록한 뒤 join 요청 → 레이스 방지)
    Net.on('init', (data) => this.onInit(data));

    const nick = window.GAME_NICK || '용사';
    Net.join(nick);

    // 입력 설정
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D');
    // 점프로 사용할 키 모음 (눌린 "순간"만 감지 → 누르고 있어도 연속 점프 방지)
    this.jumpKeys = [this.cursors.up, this.cursors.space, this.keys.W];
  }

  // 서버 초기 상태 수신 → 월드/플레이어 구성
  onInit(data) {
    if (this.waitText) {
      this.waitText.destroy();
      this.waitText = null;
    }

    this.selfId = data.selfId;
    this.tuning = Object.assign(this.tuning, data.tuning || {});
    const map = data.map;

    // 배경색 + 월드/카메라 경계
    this.cameras.main.setBackgroundColor(map.background || '#1a1a2e');
    this.physics.world.setBounds(0, 0, map.width, map.height);
    this.cameras.main.setBounds(0, 0, map.width, map.height);

    // 전역 중력은 서버 튜닝 값으로 설정 (단일 출처)
    this.physics.world.gravity.y = this.tuning.gravity;

    // 플랫폼(발판) 생성 — 정적 바디
    this.platforms = [];
    map.platforms.forEach((p) => {
      const rect = this.add
        .rectangle(p.x + p.width / 2, p.y + p.height / 2, p.width, p.height, 0x6b4f2a)
        .setStrokeStyle(2, 0x8a6a3a);
      this.physics.add.existing(rect, true); // 두 번째 인자 true = 정적 바디
      this.platforms.push(rect);
    });

    // 자기 캐릭터 스폰
    this.player = this.physics.add.sprite(data.self.x, data.self.y, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(this.tuning.playerW, this.tuning.playerH);
    this.physics.add.collider(this.player, this.platforms);

    // 머리 위 닉네임 라벨
    this.nameLabel = this.add
      .text(this.player.x, this.player.y, data.self.nick, {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(50);

    // 카메라가 부드럽게 추적
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    // 조작 안내 (화면 고정)
    this.add
      .text(12, 12, '← → / A D 이동   |   ↑ / W / Space 점프', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#dddddd',
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.ready = true;
  }

  update() {
    if (!this.ready || !this.player) return;

    const body = this.player.body;
    const { speed, jump } = this.tuning;

    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;

    // 좌우 이동 + 바라보는 방향(flipX)
    if (left) {
      body.setVelocityX(-speed);
      this.player.setFlipX(true);
    } else if (right) {
      body.setVelocityX(speed);
      this.player.setFlipX(false);
    } else {
      body.setVelocityX(0);
    }

    // 점프: 키가 "방금" 눌렸고 바닥에 닿아 있을 때만 (map으로 모든 키 평가 → 상태 정확히 리셋)
    const jumpPressed = this.jumpKeys
      .map((k) => Phaser.Input.Keyboard.JustDown(k))
      .some(Boolean);
    if (jumpPressed && body.blocked.down) {
      body.setVelocityY(-jump);
    }

    // 닉네임 라벨을 머리 위로 따라가게
    if (this.nameLabel) {
      this.nameLabel.setPosition(this.player.x, this.player.y - this.player.height / 2 - 4);
    }

    // Phase 2: 여기서 주기적으로 Net.sendMove(...) 로 위치 보고
  }
}

window.GameScene = GameScene;

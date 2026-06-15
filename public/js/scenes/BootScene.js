// =============================================================
// BootScene.js — 부팅 씬
// 이미지 파일 없이 코드로 플레이스홀더 텍스처를 생성한다(저작권 안전).
//   - 'player'        : 자기 캐릭터 (파랑)
//   - 'player_other'  : 다른 플레이어 (초록) — 멀티플레이어에서 나/남 구분
// 준비가 끝나면 GameScene 으로 전환한다.
// =============================================================

class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    this.makeCharTexture('player', 0x4aa3ff, 0x2a6bbf); // 나 (파랑)
    this.makeCharTexture('player_other', 0x6bcb77, 0x3f9b50); // 남 (초록)
    this.scene.start('GameScene');
  }

  // 단색 도형 캐릭터 텍스처 (32x48)
  // 좌우 방향 구분이 보이도록 눈을 오른쪽으로 치우치게 그린다(flipX 시 왼쪽을 봄).
  makeCharTexture(key, bodyColor, strokeColor) {
    const w = 32;
    const h = 48;
    const g = this.add.graphics();

    // 몸통
    g.fillStyle(bodyColor, 1);
    g.fillRoundedRect(0, 0, w, h, 7);
    g.lineStyle(2, strokeColor, 1);
    g.strokeRoundedRect(1, 1, w - 2, h - 2, 7);

    // 머리(피부색 원)
    g.fillStyle(0xffe0bd, 1);
    g.fillCircle(w / 2, 13, 9);

    // 눈 2개 (오른쪽을 보는 방향)
    g.fillStyle(0x222222, 1);
    g.fillCircle(w / 2 + 2, 12, 1.6);
    g.fillCircle(w / 2 + 7, 12, 1.6);

    g.generateTexture(key, w, h);
    g.destroy();
  }
}

window.BootScene = BootScene;

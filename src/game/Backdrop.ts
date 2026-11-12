import Phaser from 'phaser';
import { GROUND_H, GROUND_Y, H, W } from './GameConfig';

/** Turquoise sky, parallax scenery, drifting clouds and the scrolling ground. Shared by menu and game. */
export class Backdrop {
  private city: Phaser.GameObjects.TileSprite;
  private band: Phaser.GameObjects.TileSprite;
  private bushes: Phaser.GameObjects.TileSprite;
  private ground: Phaser.GameObjects.TileSprite;
  private clouds: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene) {
    const add = scene.add;
    add.rectangle(0, 0, W, H, 0x4ec0ca).setOrigin(0).setDepth(0);
    this.city = add.tileSprite(0, GROUND_Y - 20, W, 72, 'city').setOrigin(0, 1).setDepth(1);
    this.band = add.tileSprite(0, GROUND_Y - 6, W, 30, 'cloudband').setOrigin(0, 1).setDepth(2);
    this.bushes = add.tileSprite(0, GROUND_Y, W, 27, 'bushes').setOrigin(0, 1).setDepth(3);
    this.ground = add.tileSprite(0, GROUND_Y, W, GROUND_H, 'ground').setOrigin(0).setDepth(6);
    for (let i = 0; i < 4; i++) {
      this.clouds.push(add.image(Phaser.Math.Between(0, W), 60 + i * 70 + Phaser.Math.Between(-12, 12), 'cloud').setDepth(1.5).setAlpha(0.9).setScale(1 + (i % 2) * 0.5));
    }
  }

  /** Advance scrolling. `speed` is the pipe speed in px/s (0 freezes everything). */
  update(dt: number, speed: number): void {
    this.ground.tilePositionX += speed * dt;
    if (speed === 0) return;
    this.city.tilePositionX += speed * 0.06 * dt;
    this.band.tilePositionX += speed * 0.15 * dt;
    this.bushes.tilePositionX += speed * 0.4 * dt;
    for (const c of this.clouds) {
      c.x -= (6 + c.scaleX * 6) * dt;
      if (c.x < -40) c.x = W + 40;
    }
  }
}

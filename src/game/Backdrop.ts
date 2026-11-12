import Phaser from 'phaser';
import { bus } from '../bus';
import { assets } from '../systems/AssetManager';
import { settings } from '../systems/SettingsManager';
import { GROUND_H, GROUND_Y, H, THEMES, W, type ThemeId } from './GameConfig';

/** Sky, parallax scenery, drifting clouds, brightness shade and scrolling ground. Shared by menu and game. */
export class Backdrop {
  private sky!: Phaser.GameObjects.TileSprite;
  private city: Phaser.GameObjects.TileSprite;
  private band: Phaser.GameObjects.TileSprite;
  private bushes: Phaser.GameObjects.TileSprite;
  private ground: Phaser.GameObjects.TileSprite;
  private shade: Phaser.GameObjects.Rectangle;
  private clouds: Phaser.GameObjects.Image[] = [];
  private skyKey = '';

  constructor(private scene: Phaser.Scene) {
    const add = scene.add;
    this.city = add.tileSprite(0, GROUND_Y - 20, W, 72, 'city').setOrigin(0, 1).setDepth(1);
    this.band = add.tileSprite(0, GROUND_Y - 6, W, 30, 'cloudband').setOrigin(0, 1).setDepth(2);
    this.bushes = add.tileSprite(0, GROUND_Y, W, 27, 'bushes').setOrigin(0, 1).setDepth(3);
    this.shade = add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0).setDepth(4);
    this.ground = add.tileSprite(0, GROUND_Y, W, GROUND_H, 'ground').setOrigin(0).setDepth(6);
    for (let i = 0; i < 4; i++) {
      this.clouds.push(add.image(Phaser.Math.Between(0, W), 60 + i * 70 + Phaser.Math.Between(-12, 12), 'cloud').setDepth(1.5).setAlpha(0.9).setScale(1 + (i % 2) * 0.5));
    }
    this.refresh();
    bus.on('settings', this.refresh, this);
    bus.on('background', this.rebuildSky, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** The custom image changed: a TileSprite snapshots its texture, so the sky must be recreated. */
  private rebuildSky(): void {
    this.skyKey = '';
    this.refresh();
  }

  /** Re-read the background settings (theme, custom image, brightness). */
  refresh(): void {
    const b = settings.s.background;
    const custom = b.theme === 'custom' && assets.hasBackground;
    const id: ThemeId = custom ? 'custom' : b.theme === 'custom' ? 'turquoise' : b.theme;
    const theme = THEMES[id];
    const key = `sky-${id}`;
    if (key !== this.skyKey) {
      this.sky?.destroy();
      this.sky = this.scene.add.tileSprite(0, 0, W, H, key).setOrigin(0).setDepth(0);
      this.skyKey = key;
    }
    for (const l of [this.city, this.band, this.bushes, this.ground]) l.setTint(theme.tint);
    this.city.setVisible(!custom);
    this.band.setVisible(!custom);
    this.clouds.forEach((c) => c.setVisible(!custom).setTint(theme.tint));
    const br = b.brightness;
    this.shade.setFillStyle(br < 1 ? 0x000000 : 0xffffff, br < 1 ? Math.min(0.7, 1 - br) : Math.min(0.45, (br - 1) * 0.9));
  }

  get pipeTint(): number {
    const b = settings.s.background;
    return THEMES[b.theme === 'custom' ? 'custom' : b.theme].tint;
  }

  /** Advance scrolling. `speed` is the pipe speed in px/s (0 freezes everything). */
  update(dt: number, speed: number): void {
    this.ground.tilePositionX += speed * dt;
    if (speed === 0 || !settings.s.background.parallax) return;
    this.sky.tilePositionX += speed * 0.05 * dt;
    this.city.tilePositionX += speed * 0.06 * dt;
    this.band.tilePositionX += speed * 0.15 * dt;
    this.bushes.tilePositionX += speed * 0.4 * dt;
    for (const c of this.clouds) {
      c.x -= (6 + c.scaleX * 6) * dt;
      if (c.x < -40) c.x = W + 40;
    }
  }

  destroy(): void {
    bus.off('settings', this.refresh, this);
    bus.off('background', this.rebuildSky, this);
  }
}

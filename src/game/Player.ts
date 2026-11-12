import Phaser from 'phaser';
import { bus } from '../bus';
import { assets } from '../systems/AssetManager';
import { settings } from '../systems/SettingsManager';
import { DIFFICULTY, GROUND_Y, HIT_R } from './GameConfig';

type Diff = (typeof DIFFICULTY)['normal'];

/** The flying character: default bird or any uploaded image. Physics + animation; fixed hit circle. */
export class Player {
  x: number;
  y: number;
  vy = 0;
  dead = false;
  landed = false;
  private sprite: Phaser.GameObjects.Image;
  private custom = false;
  private angle = 0;
  private t = 0;
  private flapKick = 0;
  private hit = new Phaser.Geom.Circle(0, 0, HIT_R);

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.x = x;
    this.y = y;
    this.sprite = scene.add.image(x, y, 'bird', 0).setDepth(7);
    this.applyCharacter();
    bus.on('character', this.applyCharacter, this);
    bus.on('settings', this.applyCharacter, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.off('character', this.applyCharacter, this);
      bus.off('settings', this.applyCharacter, this);
    });
  }

  applyCharacter(): void {
    this.custom = assets.hasCharacter;
    if (this.custom) this.sprite.setTexture('char-custom').setScale(0.18);
    else this.sprite.setTexture('bird', 0).setScale(1);
  }

  /** Gentle bobbing used on the menu and before the first flap. */
  hover(dt: number, baseY: number): void {
    this.t += dt;
    this.y = baseY + Math.sin(this.t * 5) * 5;
    this.vy = 0;
    this.angle = 0;
    this.draw(false);
  }

  flap(d: Diff): void {
    this.vy = d.flap;
    this.flapKick = 1;
  }

  /** Frame-rate independent integration. */
  step(dt: number, d: Diff): void {
    this.t += dt;
    this.vy += d.gravity * dt;
    this.y += this.vy * dt;
    if (this.dead && this.y + HIT_R >= GROUND_Y) {
      this.y = GROUND_Y - HIT_R;
      this.vy = 0;
      this.landed = true;
    }
    const tilt = settings.s.animations.tilt;
    const target = this.dead ? 90 : this.vy < 0 ? -26 : Math.min(90, this.vy * 0.11);
    this.angle += (target - this.angle) * Math.min(1, dt * (this.dead ? 6 : 14));
    this.flapKick = Math.max(0, this.flapKick - dt * 4);
    this.draw(tilt);
  }

  die(): void {
    this.dead = true;
    this.vy = Math.min(this.vy, 0) - 120; // little hop, then fall
  }

  get circle(): Phaser.Geom.Circle {
    return this.hit.setPosition(this.x, this.y);
  }

  private draw(tilt: boolean): void {
    const ang = tilt || this.dead ? this.angle : 0;
    this.sprite.setPosition(this.x, this.y).setAngle(ang);
    if (!this.custom) {
      const frames = [0, 1, 2, 1];
      this.sprite.setFrame(this.dead ? 1 : frames[Math.floor(this.t * (this.flapKick > 0 ? 24 : 10)) % 4]);
    }
  }
}

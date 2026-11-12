import Phaser from 'phaser';
import { bus } from '../bus';
import { audio } from '../systems/AudioManager';
import { Backdrop } from './Backdrop';
import { H, W } from './GameConfig';
import { Player } from './Player';

export class MainMenuScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private bird!: Player;

  constructor() {
    super('MainMenu');
  }

  create(): void {
    audio.musicStop(250);
    this.backdrop = new Backdrop(this);
    const logo = this.add.image(W / 2, H * 0.2, 'logo').setDepth(8);
    this.tweens.add({ targets: logo, y: H * 0.2 + 8, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.bird = new Player(this, W / 2, H * 0.36);
    const onCmd = (c: string) => c === 'play' && this.scene.start('Game');
    bus.on('cmd', onCmd);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => bus.off('cmd', onCmd));
    bus.emit('scene', 'menu');
  }

  update(_t: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    this.backdrop.update(dt, 45);
    this.bird.hover(dt, H * 0.36);
  }
}

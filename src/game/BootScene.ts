import Phaser from 'phaser';
import { assets } from '../systems/AssetManager';
import { generateTextures } from './TextureFactory';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    generateTextures(this);
    assets.attach(this.textures);
    this.scene.start('MainMenu');
  }
}

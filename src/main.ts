import '@fontsource/press-start-2p';
import Phaser from 'phaser';
import './styles/main.css';
import { BootScene } from './game/BootScene';
import { GameScene } from './game/GameScene';
import { H, K, W } from './game/GameConfig';
import { MainMenuScene } from './game/MainMenuScene';
import { assets } from './systems/AssetManager';
import { audio } from './systems/AudioManager';
import { settings } from './systems/SettingsManager';
import { initCustomization } from './ui/CustomizationPanel';
import { initGameOver } from './ui/GameOverPanel';
import { initHUD } from './ui/GameHUD';
import { initMainMenu } from './ui/MainMenu';
import { initPauseMenu } from './ui/PauseMenu';

async function boot(): Promise<void> {
  document.documentElement.style.setProperty('--ar', String(H / W)); // stage shape matches the logical world
  document.addEventListener('contextmenu', (e) => e.preventDefault()); // no long-press menu while tapping
  await Promise.all([assets.init(), audio.init()]); // restore saved uploads before the first frame

  initMainMenu();
  initHUD();
  initPauseMenu();
  initGameOver();
  initCustomization();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W * K,
    height: H * K,
    backgroundColor: '#4ec0ca',
    pixelArt: true,
    audio: { noAudio: true }, // all sound goes through AudioManager
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, MainMenuScene, GameScene],
  });
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__authu = { game, audio, settings, assets };
}

void boot();

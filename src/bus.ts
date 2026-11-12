import Phaser from 'phaser';

/** App-wide event bus: UI <-> scenes <-> systems.
 *  Events: scene, state, score, paused, gameover, settings, character,
 *  music-state, achievement, toast, open-customize, cmd */
export const bus = new Phaser.Events.EventEmitter();

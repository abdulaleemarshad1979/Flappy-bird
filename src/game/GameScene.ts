import Phaser from 'phaser';
import { bus } from '../bus';
import { audio } from '../systems/AudioManager';
import { settings } from '../systems/SettingsManager';
import { stats, type Achievement } from '../systems/Stats';
import { Backdrop } from './Backdrop';
import { BIRD_X, DIFFICULTY, GROUND_Y, H, PIPE_H, PIPE_W, W } from './GameConfig';
import { Player } from './Player';

type State = 'ready' | 'playing' | 'dying' | 'over';

interface Pipes {
  x: number;
  top: Phaser.GameObjects.Image;
  bottom: Phaser.GameObjects.Image;
  topRect: Phaser.Geom.Rectangle;
  botRect: Phaser.Geom.Rectangle;
  passed: boolean;
}

interface Particle {
  o: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  life: number;
  g: number;
}

export class GameScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private player!: Player;
  private pipes: Pipes[] = [];
  private particles: Particle[] = [];
  private state: State = 'ready';
  private paused = false;
  private score = 0;
  private lastGapY = H * 0.4;
  private dyingT = 0;
  private overAt = 0;
  private newAchievements: Achievement[] = [];
  private finished = { best: 0, isNew: false };
  private runStarted = false;
  private cleanup: Array<() => void> = [];

  constructor() {
    super('Game');
  }

  create(): void {
    this.pipes = [];
    this.particles = [];
    this.state = 'ready';
    this.paused = false;
    this.score = 0;
    this.runStarted = false;
    this.newAchievements = [];
    this.lastGapY = H * 0.4;

    audio.stopCrash(); // never let an old crash sound bleed into the new run
    audio.musicPlay(true);

    this.backdrop = new Backdrop(this);
    this.player = new Player(this, BIRD_X, H * 0.42);

    const onPointer = () => this.flap();
    const onCmd = (c: string) => this.command(c);
    const onAch = (a: Achievement) => this.newAchievements.push(a);
    this.input.on('pointerdown', onPointer);
    bus.on('cmd', onCmd);
    bus.on('achievement', onAch);
    this.cleanup.push(() => {
      this.input.off('pointerdown', onPointer);
      bus.off('cmd', onCmd);
      bus.off('achievement', onAch);
    });

    const key = (e: KeyboardEvent) => {
      if (this.paused && e.code !== 'Escape') return; // a menu is open: leave keys (Space on buttons etc.) alone
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        if (e.repeat) return;
        if (this.state !== 'over') this.flap();
        else if (this.overAt > 0.5) this.command('restart');
      } else if (e.code === 'Escape') this.setPaused(!this.paused);
      else if (e.code === 'Enter' && this.state === 'over' && this.overAt > 0.5) this.command('restart');
    };
    const vis = () => document.hidden && this.setPaused(true);
    window.addEventListener('keydown', key);
    document.addEventListener('visibilitychange', vis);
    this.cleanup.push(() => window.removeEventListener('keydown', key), () => document.removeEventListener('visibilitychange', vis));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanup.forEach((f) => f());
      this.cleanup = [];
    });
    bus.emit('scene', 'game');
    bus.emit('state', 'ready');
    bus.emit('score', 0);
    bus.emit('paused', false);
  }

  // ------------------------------------------------------------ commands
  private command(c: string): void {
    if (c === 'pause') this.setPaused(true);
    else if (c === 'resume') this.setPaused(false);
    else if (c === 'restart') {
      if (this.runStarted && this.state === 'playing') stats.endRun(this.score, false);
      this.scene.restart();
    } else if (c === 'menu') {
      if (this.runStarted && this.state === 'playing') stats.endRun(this.score, false);
      audio.stopCrash();
      audio.musicStop(0);
      this.scene.start('MainMenu');
    }
  }

  private setPaused(p: boolean): void {
    if (p === this.paused) return;
    if (p && (this.state === 'dying' || this.state === 'over')) return;
    this.paused = p;
    if (p) audio.musicPause();
    else audio.musicPlay(false);
    bus.emit('paused', p);
  }

  // ------------------------------------------------------------ input
  private flap(): void {
    if (this.paused) return;
    if (this.state === 'ready') {
      this.state = 'playing';
      this.runStarted = true;
      stats.startRun();
      bus.emit('state', 'playing');
    }
    if (this.state !== 'playing') return;
    this.player.flap(DIFFICULTY[settings.s.difficulty]);
    stats.flap();
  }

  // ------------------------------------------------------------ loop
  update(_t: number, delta: number): void {
    if (this.paused) return;
    const dt = Math.min(delta, 50) / 1000; // clamp long frames; keeps physics stable
    const d = DIFFICULTY[settings.s.difficulty];
    this.updateParticles(dt);

    if (this.state === 'ready') {
      this.backdrop.update(dt, d.speed);
      this.player.hover(dt, H * 0.42);
      return;
    }
    if (this.state === 'playing') {
      this.backdrop.update(dt, d.speed);
      this.player.step(dt, d);
      this.movePipes(dt, d);
      this.checkCollisions();
    } else {
      this.player.step(dt, d); // falling after crash
      this.dyingT += dt;
      if (this.state === 'dying' && ((this.player.landed && this.dyingT > 0.55) || this.dyingT > 1.6)) this.finish();
      if (this.state === 'over') this.overAt += dt;
    }
  }

  private movePipes(dt: number, d: (typeof DIFFICULTY)['normal']): void {
    const last = this.pipes[this.pipes.length - 1];
    if (!last || last.x <= W + 20 - d.spacing) this.spawnPipes(d.gap);
    for (const p of this.pipes) {
      p.x -= d.speed * dt;
      p.top.x = p.bottom.x = p.x;
      p.topRect.x = p.botRect.x = p.x + 2;
      if (!p.passed && p.x + PIPE_W / 2 < this.player.x) {
        p.passed = true;
        this.score++;
        audio.playPoint();
        stats.pipe(this.score); // unlocks are announced on the bus
        bus.emit('score', this.score);
      }
    }
    while (this.pipes.length && this.pipes[0].x < -PIPE_W - 4) {
      const p = this.pipes.shift()!;
      p.top.destroy();
      p.bottom.destroy();
    }
  }

  private spawnPipes(gap: number): void {
    const margin = 56;
    const lo = margin + gap / 2, hi = GROUND_Y - margin - gap / 2;
    const gapY = Phaser.Math.Clamp(this.lastGapY + Phaser.Math.Between(-130, 130), lo, hi);
    this.lastGapY = gapY;
    const x = W + 20;
    const tint = this.backdrop.pipeTint;
    const top = this.add.image(x, gapY - gap / 2, 'pipe').setOrigin(0, 1).setFlipY(true).setDepth(5).setTint(tint);
    const bottom = this.add.image(x, gapY + gap / 2, 'pipe').setOrigin(0, 0).setDepth(5).setTint(tint);
    this.pipes.push({
      x,
      top,
      bottom,
      topRect: new Phaser.Geom.Rectangle(x + 2, gapY - gap / 2 - PIPE_H, PIPE_W - 4, PIPE_H),
      botRect: new Phaser.Geom.Rectangle(x + 2, gapY + gap / 2, PIPE_W - 4, PIPE_H),
      passed: false,
    });
  }

  private checkCollisions(): void {
    const c = this.player.circle;
    if (c.y - c.radius < 0 || c.y + c.radius >= GROUND_Y) return this.crash();
    for (const p of this.pipes) {
      if (Phaser.Geom.Intersects.CircleToRectangle(c, p.topRect) || Phaser.Geom.Intersects.CircleToRectangle(c, p.botRect)) return this.crash();
    }
  }

  // ------------------------------------------------------------ death
  private crash(): void {
    if (this.state !== 'playing') return; // guarantees one crash per run: sound, stats and fx fire once
    this.state = 'dying';
    this.dyingT = 0;
    this.player.die();
    audio.musicStop(350);
    audio.playCrash();
    this.finished = stats.endRun(this.score, true);
    const a = settings.s.animations;
    if (a.shake) this.cameras.main.shake(260, 0.012);
    if (a.particles) this.burst(this.player.x, this.player.y, 22, [0xf9c232, 0xffffff, 0xf2561d, 0x543847], 220, 500);
    bus.emit('state', 'dying');
  }

  private finish(): void {
    this.state = 'over';
    this.overAt = 0;
    if (this.finished.isNew && settings.s.animations.particles) {
      this.burst(W / 2, 90, 60, [0xf8c82f, 0xf7752b, 0x73bf2e, 0xffffff, 0x4ec0ca], 260, 380);
    }
    bus.emit('state', 'over');
    bus.emit('gameover', {
      score: this.score,
      best: this.finished.best,
      isNew: this.finished.isNew,
      achievements: this.newAchievements.map((a) => a.label),
    });
  }

  // ------------------------------------------------------------ particles
  private burst(x: number, y: number, n: number, colors: number[], speed: number, gravity: number): void {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
      const s = Phaser.Math.Between(2, 4) * 2;
      const o = this.add.rectangle(x, y, s, s, Phaser.Utils.Array.GetRandom(colors)).setDepth(9);
      this.particles.push({ o, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 60, life: 0.7 + Math.random() * 0.6, g: gravity });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vy += p.g * dt;
      p.o.x += p.vx * dt;
      p.o.y += p.vy * dt;
      p.o.setAlpha(Math.min(1, p.life * 3));
      if (p.life <= 0) {
        p.o.destroy();
        this.particles.splice(i, 1);
      }
    }
  }
}

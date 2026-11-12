import { bus } from '../bus';
import type { Achievement } from '../systems/Stats';
import { btn, h, root, toast } from './dom';

export function initHUD(): void {
  const hud = h('div', 'hidden');
  hud.id = 'hud';
  const score = h('div', 'score', '0');
  score.setAttribute('aria-live', 'off');
  const hint = h('div', 'hint', h('b', '', 'GET READY'), h('span', '', 'TAP / SPACE'));
  const pause = btn('II', () => bus.emit('cmd', 'pause'), 'pause-btn');
  pause.setAttribute('aria-label', 'Pause');
  hud.append(score, hint, pause);
  root().append(hud);

  bus.on('scene', (s: string) => hud.classList.toggle('hidden', s !== 'game'));
  bus.on('state', (s: string) => {
    hint.classList.toggle('hidden', s !== 'ready');
    pause.classList.toggle('hidden', s === 'dying' || s === 'over');
    score.classList.toggle('hidden', s === 'over');
  });
  bus.on('score', (n: number) => {
    score.textContent = String(n);
    if (n > 0) {
      score.classList.remove('pop');
      void score.offsetWidth; // restart the animation
      score.classList.add('pop');
    }
  });
  bus.on('achievement', (a: Achievement) => toast(`ACHIEVEMENT UNLOCKED\n${a.label}`, true));
}

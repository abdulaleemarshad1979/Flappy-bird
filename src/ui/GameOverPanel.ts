import { bus } from '../bus';
import { btn, h, root } from './dom';

interface Over {
  score: number;
  best: number;
  isNew: boolean;
  achievements: string[];
}

export function initGameOver(): void {
  const back = h('div', 'backdrop hidden');
  back.style.background = 'rgba(35, 20, 30, .35)';
  root().append(back);
  const hide = () => back.classList.add('hidden');
  bus.on('state', (s: string) => s !== 'over' && hide());
  bus.on('scene', hide);
  bus.on('gameover', (o: Over) => {
    const panel = h('div', 'panel go');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Game over');
    const scores = h('div', 'scores', h('div', '', h('small', '', 'SCORE'), String(o.score)), h('div', '', h('small', '', 'BEST'), String(o.best)));
    if (o.isNew) scores.append(h('div', 'new', 'NEW BEST!'));
    panel.append(h('h1', '', 'GAME OVER'), scores);
    if (o.achievements.length) panel.append(h('div', 'ach', 'UNLOCKED: ' + o.achievements.join(', ')));
    const restart = btn('RESTART', () => bus.emit('cmd', 'restart'), 'wide');
    panel.append(restart, btn('MAIN MENU', () => bus.emit('cmd', 'menu'), 'wide green'));
    back.replaceChildren(panel);
    back.classList.remove('hidden');
  });
}

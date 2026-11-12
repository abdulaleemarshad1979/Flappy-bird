import { bus } from '../bus';
import { ACHIEVEMENTS, stats } from '../systems/Stats';
import { btn, h, modal, root } from './dom';

function showStats(): void {
  const d = stats.d;
  const body = h('div', '', h('h2', '', 'HIGH SCORES'));
  const grid = h('div', 'statgrid');
  const rows: [string, number][] = [['BEST SCORE', d.best], ['GAMES PLAYED', d.games], ['TOTAL CRASHES', d.crashes], ['PIPES PASSED', d.pipes]];
  for (const [k, v] of rows) grid.append(h('span', '', k), h('b', '', String(v)));
  const list = h('ul', 'achs');
  for (const a of ACHIEVEMENTS) {
    const on = d.unlocked.includes(a.id);
    list.append(h('li', on ? 'on' : '', h('i', '', on ? '★' : '·'), h('span', '', `${a.label} - ${a.desc}`)));
  }
  const m = modal(body);
  body.append(grid, h('h2', '', 'ACHIEVEMENTS'), list, btn('CLOSE', () => m.close(), 'wide'));
}

function showHelp(): void {
  const body = h('div', '', h('h2', '', 'HOW TO PLAY'));
  const ul = h('ul', '');
  for (const t of [
    'TAP, CLICK or press SPACE to flap.',
    'Fly through the gaps between the pipes.',
    'Every pipe passed is 1 point.',
    'Touching a pipe, the ceiling or the ground ends the run.',
    'ESC pauses. CUSTOMIZE lets you use your own face, music and crash sound!',
  ]) ul.append(h('li', '', t));
  const m = modal(body);
  body.append(ul, btn('GOT IT', () => m.close(), 'wide'));
}

export function initMainMenu(): void {
  const menu = h('div', '');
  menu.id = 'menu';
  menu.append(
    btn('PLAY', () => bus.emit('cmd', 'play'), 'big'),
    btn('CUSTOMIZE', () => bus.emit('open-customize', { tab: 'character' }), 'green'),
    h(
      'div',
      'row',
      btn('SETTINGS', () => bus.emit('open-customize', { tab: 'gameplay' }), 'small sand'),
      btn('SCORES', showStats, 'small sand'),
      btn('HELP', showHelp, 'small sand'),
    ),
  );
  const ver = h('div', 'ver', 'AUTHU BIRD  v1.0');
  root().append(menu, ver);
  bus.on('scene', (s: string) => [menu, ver].forEach((e) => e.classList.toggle('hidden', s !== 'menu')));
}

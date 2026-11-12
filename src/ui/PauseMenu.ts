import { bus } from '../bus';
import { btn, h, root } from './dom';

export function initPauseMenu(): void {
  const back = h('div', 'backdrop hidden');
  const panel = h('div', 'panel menu-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Paused');
  const openCust = (tab: string) => {
    back.classList.add('hidden');
    bus.emit('open-customize', { tab, onClose: () => back.classList.remove('hidden') });
  };
  panel.append(
    h('h2', '', 'PAUSED'),
    btn('RESUME', () => bus.emit('cmd', 'resume')),
    btn('RESTART', () => bus.emit('cmd', 'restart'), 'green'),
    btn('CUSTOMIZE', () => openCust('character'), 'sand'),
    btn('AUDIO SETTINGS', () => openCust('audio'), 'sand'),
    btn('MAIN MENU', () => bus.emit('cmd', 'menu'), 'sand'),
  );
  back.append(panel);
  root().append(back);
  bus.on('paused', (p: boolean) => back.classList.toggle('hidden', !p));
  bus.on('scene', () => back.classList.add('hidden'));
}

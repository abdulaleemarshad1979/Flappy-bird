import { bus } from '../bus';

/** Tiny DOM helpers shared by all UI modules. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...kids: (Node | string | null)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) if (k !== null) e.append(k);
  return e;
}

export const root = (): HTMLElement => document.getElementById('ui')!;

export function btn(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = h('button', `px-btn ${cls}`.trim(), label);
  b.type = 'button';
  b.addEventListener('click', () => {
    b.blur(); // keep Space/Enter from re-triggering the focused button during play
    onClick();
  });
  return b;
}

export function toggle(label: string, on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const b = h('button', 'px-toggle', on ? 'ON' : 'OFF');
  b.type = 'button';
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-checked', String(on));
  b.setAttribute('aria-label', label);
  b.addEventListener('click', () => {
    on = !on;
    b.textContent = on ? 'ON' : 'OFF';
    b.setAttribute('aria-checked', String(on));
    onChange(on);
  });
  return h('div', 'line', h('span', '', label), b);
}

export function slider(label: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string, onInput: (v: number) => void): HTMLElement {
  const input = h('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.setAttribute('aria-label', label);
  const val = h('span', 'val', fmt(value));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    val.textContent = fmt(v);
    onInput(v);
  });
  return h('div', 'line', h('span', '', label), input, val);
}

export function segmented<T extends string>(opts: { value: T; label: string; swatch?: string }[], cur: T, onPick: (v: T) => void): HTMLElement {
  const wrap = h('div', 'seg');
  wrap.setAttribute('role', 'group');
  const buttons = opts.map((o) => {
    const b = h('button', '', o.label);
    if (o.swatch) {
      const sw = h('span', 'sw');
      sw.style.background = o.swatch;
      b.prepend(sw);
    }
    b.type = 'button';
    b.setAttribute('aria-pressed', String(o.value === cur));
    b.addEventListener('click', () => {
      buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onPick(o.value);
    });
    return b;
  });
  wrap.append(...buttons);
  return wrap;
}

export function toast(msg: string, gold = false): void {
  const host = document.getElementById('toasts') ?? root().appendChild(Object.assign(h('div'), { id: 'toasts' }));
  const t = h('div', gold ? 'toast gold' : 'toast', msg);
  t.setAttribute('role', 'status');
  host.append(t);
  setTimeout(() => t.remove(), gold ? 2600 : 3800);
}

/** Open a centered modal panel on a dimmed backdrop. */
export function modal(content: HTMLElement, onClose?: () => void): { close: () => void; el: HTMLElement } {
  const back = h('div', 'backdrop');
  const el = h('div', 'panel');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.style.width = '88%';
  el.style.maxHeight = '90%';
  el.style.overflowY = 'auto';
  el.append(content);
  back.append(el);
  root().append(back);
  const close = () => {
    back.remove();
    onClose?.();
  };
  return { close, el };
}

bus.on('toast', (m: string) => toast(m));

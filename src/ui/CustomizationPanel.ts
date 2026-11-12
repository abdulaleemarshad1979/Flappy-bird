import { bus } from '../bus';
import type { Difficulty } from '../game/GameConfig';
import { birdFrame } from '../game/TextureFactory';
import { assets, CHAR_OUT, renderCharacter } from '../systems/AssetManager';
import { audio, TRACKS } from '../systems/AudioManager';
import { settings, type Crop } from '../systems/SettingsManager';
import { storage } from '../systems/StorageManager';
import { btn, h, segmented, slider, toast, toggle } from './dom';

type Tab = 'character' | 'audio' | 'gameplay';
type Opts = { tab?: Tab; onClose?: () => void };

const TABS: [Tab, string][] = [['character', 'CHARACTER'], ['audio', 'AUDIO'], ['gameplay', 'GAMEPLAY']];
const pct = (v: number) => `${Math.round(v * 100)}%`;
let open = false;

function persistNote(persisted: boolean): void {
  if (!persisted) toast(storage.cacheAvailable ? 'Browser storage is full or blocked. This file stays active for this session only.' : 'Browser storage is unavailable here. This file stays active for this session only.');
}

/** Hidden file input + visible button. */
function uploadButton(label: string, accept: string, onFile: (f: File) => void): HTMLElement {
  const input = h('input');
  input.type = 'file';
  input.accept = accept;
  input.hidden = true;
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    input.value = '';
    if (f) onFile(f);
  });
  const b = btn(label, () => input.click(), 'small');
  b.append(input);
  return b;
}

export function initCustomization(): void {
  bus.on('open-customize', (o: Opts) => openPanel(o));
}

function openPanel({ tab = 'character', onClose }: Opts): void {
  if (open) return;
  open = true;
  bus.emit('cmd', 'pause'); // opening while playing pauses automatically (no-op on the menu)

  const back = h('div', 'backdrop');
  back.style.padding = '.8em';
  const panel = h('div', 'panel cust');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Customize');
  const tabs = h('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  const body = h('div', 'cust-body');
  let cleanups: (() => void)[] = [];
  let pending: { file: File; bmp: ImageBitmap } | null = null;

  const render = () => {
    cleanups.forEach((f) => f());
    cleanups = [];
    body.replaceChildren();
    body.scrollTop = 0;
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    if (tab === 'character') renderCharacterTab();
    else if (tab === 'audio') renderAudioTab();
    else renderGameplayTab();
  };
  const rerender = () => {
    const y = body.scrollTop;
    render();
    body.scrollTop = y;
  };

  for (const [id, label] of TABS) {
    const b = h('button', '', label);
    b.type = 'button';
    b.dataset.tab = id;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => {
      pending = null;
      audio.stopPreview();
      tab = id;
      render();
    });
    tabs.append(b);
  }

  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    cleanups.forEach((f) => f());
    pending?.bmp.close();
    audio.stopPreview();
    back.remove();
    open = false;
    onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      e.stopImmediatePropagation(); // don't let the game treat it as "resume"
      close();
    }
  };
  window.addEventListener('keydown', onKey, true);

  panel.append(tabs, body, h('div', 'cust-foot', btn('CLOSE', close, 'small sand')));
  back.append(panel);
  document.getElementById('ui')!.append(back);

  // ---------------------------------------------------------------- CHARACTER
  function renderCharacterTab(): void {
    const c = settings.s.character;
    const prev = document.createElement('canvas');
    prev.width = prev.height = CHAR_OUT;
    const draw = () => {
      const src = pending?.bmp ?? assets.charSource;
      prev.style.imageRendering = src && !settings.s.character.pixelate ? 'auto' : 'pixelated';
      if (src) renderCharacter(src, settings.s.character, prev);
      else {
        const x = prev.getContext('2d')!;
        x.clearRect(0, 0, CHAR_OUT, CHAR_OUT);
        x.imageSmoothingEnabled = false;
        x.drawImage(birdFrame(1), (CHAR_OUT - 38 * 4) / 2, (CHAR_OUT - 28 * 4) / 2, 38 * 4, 28 * 4);
      }
    };
    draw();
    const change = (fn: (o: typeof c) => void) => {
      settings.update((s) => fn(s.character));
      if (!pending && assets.hasCharacter) assets.redrawCharacter(); // live in the game
      draw();
    };

    const name = pending ? `PREVIEW: ${pending.file.name}` : settings.s.customs.character ? `ACTIVE: ${settings.s.customs.character}` : 'DEFAULT BIRD';
    const top = h('div', 'sect', h('div', 'preview-wrap', h('div', 'preview', prev)), h('div', 'fname', name));
    const row = h('div', 'btns');
    row.append(
      uploadButton('UPLOAD IMAGE', 'image/jpeg,image/png,image/webp', async (file) => {
        const r = await assets.preview(file, 'image');
        if (r.error || !r.bmp) return toast(r.error ?? 'Could not load image.');
        pending?.bmp.close();
        pending = { file, bmp: r.bmp };
        rerender();
      }),
    );
    if (pending) {
      row.append(
        btn('APPLY', async () => {
          const p = pending!;
          pending = null;
          const r = await assets.commit(p.file, p.bmp);
          toast('Character applied!');
          persistNote(r.persisted);
          rerender();
        }, 'small green'),
        btn('CANCEL', () => {
          pending?.bmp.close();
          pending = null;
          rerender();
        }, 'small sand'),
      );
    } else if (assets.hasCharacter) {
      row.append(
        btn('RESTORE DEFAULT', async () => {
          await assets.resetCharacter();
          toast('Default bird restored');
          rerender();
        }, 'small sand'),
      );
    }
    top.append(row);
    body.append(top);

    if (pending || assets.hasCharacter) {
      const ctl = h('div', 'sect', h('h3', '', 'LOOK'));
      ctl.append(
        segmented<Crop>([{ value: 'original', label: 'ORIGINAL' }, { value: 'circle', label: 'CIRCLE' }, { value: 'rounded', label: 'ROUNDED' }], c.crop, (v) => change((o) => (o.crop = v))),
        slider('ZOOM', c.zoom, 0.5, 3, 0.05, (v) => `${v.toFixed(2)}x`, (v) => change((o) => (o.zoom = v))),
        slider('X POS', c.x, -1, 1, 0.02, (v) => v.toFixed(2), (v) => change((o) => (o.x = v))),
        slider('Y POS', c.y, -1, 1, 0.02, (v) => v.toFixed(2), (v) => change((o) => (o.y = v))),
        toggle('PIXELATE', c.pixelate, (v) => change((o) => (o.pixelate = v))),
        toggle('OUTLINE', c.outline, (v) => change((o) => (o.outline = v))),
        toggle('SHADOW', c.shadow, (v) => change((o) => (o.shadow = v))),
        h('p', 'note', pending ? 'Press APPLY to use this picture in the game. Changes below update the preview.' : 'Changes update the game instantly. Hitbox is the same for every picture.'),
      );
      body.append(ctl);
    } else {
      body.append(h('p', 'note', 'Upload a JPG, PNG or WebP (face, selfie, meme, cartoon). It is cropped and blended into the pixel look. Drag the sliders to center the face.'));
    }
  }

  // ---------------------------------------------------------------- AUDIO
  function renderAudioTab(): void {
    const a = settings.s.audio;
    const cu = settings.s.customs;

    const soundSection = (kind: 'music' | 'crash', title: string, defaultName: string, onPreview: () => void, previewBtn?: HTMLButtonElement): HTMLElement => {
      const s = h('div', 'sect', h('h3', '', title), h('div', 'fname', cu[kind] ? `ACTIVE: ${cu[kind]}` : `DEFAULT: ${defaultName}`));
      const row = h('div', 'btns');
      row.append(
        uploadButton('UPLOAD', 'audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg', async (file) => {
          const r = await audio.setCustom(kind, file);
          if (!r.ok) return toast(r.error ?? 'Could not use that file.');
          toast('Audio applied!');
          persistNote(r.persisted);
          rerender();
        }),
        previewBtn ?? btn('PREVIEW', onPreview, 'small green'),
      );
      if (cu[kind]) row.append(btn('DEFAULT', async () => { await audio.resetCustom(kind); toast('Default restored'); rerender(); }, 'small sand'));
      s.append(row);
      return s;
    };

    // music
    const mPrev = btn('PREVIEW', () => audio.previewMusic(), 'small green');
    const syncPrev = () => (mPrev.textContent = audio.isMusicPlaying() ? 'STOP' : 'PREVIEW');
    bus.on('music-state', syncPrev);
    cleanups.push(() => bus.off('music-state', syncPrev));
    syncPrev();
    const music = soundSection('music', 'BACKGROUND MUSIC', TRACKS.find((t) => t.id === a.track)?.name ?? '', () => undefined, mPrev);
    if (!cu.music) {
      music.append(segmented(TRACKS.map((t) => ({ value: t.id, label: t.name })), a.track, (v) => {
        settings.update((s) => (s.audio.track = v));
        if (audio.isMusicPlaying()) audio.musicPlay(true);
      }));
    }
    music.append(
      slider('VOLUME', a.musicVolume, 0, 1, 0.05, pct, (v) => settings.update((s) => (s.audio.musicVolume = v))),
      toggle('MUTE MUSIC', a.musicMuted, (v) => settings.update((s) => (s.audio.musicMuted = v))),
      toggle('LOOP', a.loop, (v) => settings.update((s) => (s.audio.loop = v))),
    );

    body.append(
      music,
      soundSection('crash', 'CRASH SOUND', 'THUD', () => audio.preview('crash')),
    );
    const fx = h('div', 'sect', h('h3', '', 'EFFECTS'));
    fx.append(
      slider('VOLUME', a.sfxVolume, 0, 1, 0.05, pct, (v) => settings.update((s) => (s.audio.sfxVolume = v))),
      toggle('MUTE EFFECTS', a.sfxMuted, (v) => settings.update((s) => (s.audio.sfxMuted = v))),
      h('div', 'btns', btn('RESET AUDIO', async () => { await audio.resetAll(); settings.reset('audio'); toast('Audio reset'); rerender(); }, 'small sand')),
    );
    body.append(fx, h('p', 'note', 'MP3, WAV and (where your browser supports it) OGG. The crash sound plays once per crash and the music fades out.'));
  }

  // ---------------------------------------------------------------- GAMEPLAY
  function renderGameplayTab(): void {
    const s0 = settings.s;
    const sect = h('div', 'sect', h('h3', '', 'DIFFICULTY'));
    sect.append(
      segmented<Difficulty>([{ value: 'easy', label: 'EASY' }, { value: 'normal', label: 'NORMAL' }, { value: 'hard', label: 'HARD' }], s0.difficulty, (v) => settings.update((s) => (s.difficulty = v))),
      h('p', 'note', 'Easy: wide gaps, slow pipes. Normal: classic. Hard: tight gaps, fast pipes.'),
    );
    const snd = h('div', 'sect', h('h3', '', 'SOUND'));
    snd.append(
      toggle('MUSIC', s0.audio.musicEnabled, (v) => settings.update((s) => (s.audio.musicEnabled = v))),
      toggle('EFFECTS', s0.audio.sfxEnabled, (v) => settings.update((s) => (s.audio.sfxEnabled = v))),
    );
    const an = h('div', 'sect', h('h3', '', 'ANIMATIONS'));
    an.append(
      toggle('SCREEN SHAKE', s0.animations.shake, (v) => settings.update((s) => (s.animations.shake = v))),
      toggle('PARTICLES', s0.animations.particles, (v) => settings.update((s) => (s.animations.particles = v))),
      toggle('TILT', s0.animations.tilt, (v) => settings.update((s) => (s.animations.tilt = v))),
    );
    const rs = h('div', 'sect', h('h3', '', 'RESET'));
    let armed = false;
    const all = btn('RESET ALL SETTINGS', async () => {
      if (!armed) {
        armed = true;
        all.textContent = 'TAP AGAIN TO CONFIRM';
        return;
      }
      await assets.resetCharacter();
      await audio.resetAll();
      settings.reset('all');
      toast('All settings reset. Scores are kept.');
      rerender();
    }, 'small');
    rs.append(
      h('div', 'btns', btn('RESET GAMEPLAY', () => { settings.reset('gameplay'); toast('Gameplay settings reset'); rerender(); }, 'small sand'), all),
      h('p', 'note', 'Settings, best score and stats are stored in this browser only. Uploaded files are kept in browser storage and can disappear if you clear site data. Nothing syncs between devices.'),
    );
    if (!storage.cacheAvailable) rs.append(h('p', 'note warn', 'Browser file storage is unavailable here (needs HTTPS or localhost): uploaded files will only last for this session.'));
    body.append(sect, snd, an, rs);
  }

  render();
}

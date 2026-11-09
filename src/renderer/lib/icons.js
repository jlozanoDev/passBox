/**
 * Stroke icon set (24x24 grid, currentColor). Static, local data only —
 * no icon font and no network request.
 *
 * Each icon is a list of primitives:
 *   ['path', d] | ['circle', cx, cy, r] | ['rect', x, y, w, h, rx]
 */
const icon = (...primitives) => primitives;

export const ICONS = {
  search: icon(['path', 'm21 21-4.3-4.3'], ['circle', 11, 11, 7]),
  plus: icon(['path', 'M12 5v14'], ['path', 'M5 12h14']),
  copy: icon(['rect', 9, 9, 13, 13, 2], ['path', 'M5 15V5a2 2 0 0 1 2-2h10']),
  check: icon(['path', 'm20 6-11 11-5-5']),
  eye: icon(
    ['path', 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z'],
    ['circle', 12, 12, 3],
  ),
  eyeOff: icon(
    ['path', 'm3 3 18 18'],
    ['path', 'M10.6 10.6a3 3 0 0 0 4.2 4.2'],
    [
      'path',
      'M9.9 5.2A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.5',
    ],
    ['path', 'M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 3.2-.5'],
  ),
  pencil: icon(
    ['path', 'M12 20h9'],
    ['path', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'],
  ),
  trash: icon(
    ['path', 'M3 6h18'],
    ['path', 'M8 6V4h8v2'],
    ['path', 'm19 6-1 14H6L5 6'],
    ['path', 'M10 11v6'],
    ['path', 'M14 11v6'],
  ),
  star: icon([
    'path',
    'm12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9Z',
  ]),
  lock: icon(['rect', 4, 11, 16, 10, 2], ['path', 'M8 11V7a4 4 0 0 1 8 0v4']),
  unlock: icon(['rect', 4, 11, 16, 10, 2], ['path', 'M8 11V7a4 4 0 0 1 7.5-2']),
  shield: icon(['path', 'M12 22s8-3.6 8-10V5l-8-3-8 3v7c0 6.4 8 10 8 10Z']),
  shieldCheck: icon(
    ['path', 'M12 22s8-3.6 8-10V5l-8-3-8 3v7c0 6.4 8 10 8 10Z'],
    ['path', 'm9 12 2 2 4-4'],
  ),
  key: icon(
    ['circle', 7.5, 16.5, 3.5],
    ['path', 'M10.5 13.5 21 3'],
    ['path', 'M17 3h4v4'],
  ),
  wand: icon(
    [
      'path',
      'm12 3 1.7 4.6L18.3 9.3l-4.6 1.7L12 15.6l-1.7-4.6L5.7 9.3l4.6-1.7Z',
    ],
    ['path', 'M5 3v4'],
    ['path', 'M3 5h4'],
    ['path', 'M18 17v4'],
    ['path', 'M16 19h4'],
  ),
  activity: icon(['path', 'M3 12h4l3 8 4-16 3 8h4']),
  settings: icon(
    ['circle', 12, 12, 3],
    [
      'path',
      'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
    ],
  ),
  cloud: icon([
    'path',
    'M17.5 19a4.5 4.5 0 0 0 .4-9A7 7 0 0 0 4.3 11 4 4 0 0 0 6 19Z',
  ]),
  x: icon(['path', 'M18 6 6 18'], ['path', 'm6 6 12 12']),
  chevronRight: icon(['path', 'm9 18 6-6-6-6']),
  chevronDown: icon(['path', 'm6 9 6 6 6-6']),
  chevronLeft: icon(['path', 'm15 18-6-6 6-6']),
  alert: icon(
    [
      'path',
      'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
    ],
    ['path', 'M12 9v4'],
    ['path', 'M12 17h.01'],
  ),
  refresh: icon(['path', 'M21 12a9 9 0 1 1-3-6.7'], ['path', 'M21 3v6h-6']),
  terminal: icon(['path', 'm4 17 6-6-6-6'], ['path', 'M12 19h8']),
  database: icon(
    ['path', 'M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5'],
    ['ellipse', 12, 5, 8, 3],
    ['path', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  ),
  note: icon(
    ['path', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z'],
    ['path', 'M14 2v6h6'],
    ['path', 'M8 13h8'],
    ['path', 'M8 17h5'],
  ),
  globe: icon(
    ['circle', 12, 12, 9],
    ['path', 'M3 12h18'],
    ['path', 'M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z'],
  ),
  sun: icon(
    ['circle', 12, 12, 4],
    ['path', 'M12 2v2'],
    ['path', 'M12 20v2'],
    ['path', 'm4.9 4.9 1.4 1.4'],
    ['path', 'm17.7 17.7 1.4 1.4'],
    ['path', 'M2 12h2'],
    ['path', 'M20 12h2'],
    ['path', 'm4.9 19.1 1.4-1.4'],
    ['path', 'm17.7 6.3 1.4-1.4'],
  ),
  moon: icon(['path', 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z']),
  monitor: icon(
    ['rect', 2, 4, 20, 12, 2],
    ['path', 'M8 20h8'],
    ['path', 'M12 16v4'],
  ),
  user: icon(['circle', 12, 8, 4], ['path', 'M4 21a8 8 0 0 1 16 0']),
  clipboard: icon(
    ['rect', 8, 2, 8, 4, 1],
    [
      'path',
      'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
    ],
  ),
  arrowRight: icon(['path', 'M5 12h14'], ['path', 'm12 5 7 7-7 7']),
  arrowLeft: icon(['path', 'M19 12H5'], ['path', 'm12 19-7-7 7-7']),
  menu: icon(['path', 'M4 6h16'], ['path', 'M4 12h16'], ['path', 'M4 18h16']),
  dot: icon(['circle', 12, 12, 4]),
};

export const CATEGORY_ICONS = {
  password: 'key',
  api_token: 'terminal',
  database: 'database',
  note: 'note',
  other: 'globe',
};

export const CATEGORY_LABELS = {
  password: 'Contraseña',
  api_token: 'Token de API',
  database: 'Base de datos',
  note: 'Nota',
  other: 'Otra',
};

const CODES = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m',
};

const enabled = () =>
  !process.env.NO_COLOR && process.stdout.isTTY && process.env.TERM !== 'dumb';

function paint(name) {
  return (text) => (enabled() ? `${CODES[name]}${text}${CODES.reset}` : String(text));
}

export const style = {
  bold: paint('bold'), dim: paint('dim'), red: paint('red'),
  green: paint('green'), yellow: paint('yellow'), blue: paint('blue'), cyan: paint('cyan'),
};

export const symbol = { ok: '✓', error: '✗', warn: '!', arrow: '└' };

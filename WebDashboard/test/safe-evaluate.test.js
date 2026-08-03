import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicate safeEvaluate from server.js (no eval, no Function)
function safeEvaluate(expr) {
  const tokens = [];
  let pos = 0;
  while (pos < expr.length) {
    const ch = expr[pos];
    if (/\s/.test(ch)) { pos++; continue; }
    if ('+-*/()'.includes(ch)) { tokens.push({ t: 'op', v: ch }); pos++; continue; }
    if (/[\d.]/.test(ch)) {
      let num = '';
      while (pos < expr.length && /[\d.]/.test(expr[pos])) { num += expr[pos]; pos++; }
      const n = parseFloat(num);
      if (isNaN(n)) throw new Error('Invalid number: ' + num);
      tokens.push({ t: 'num', v: n });
      continue;
    }
    throw new Error('Unexpected character: ' + ch);
  }
  let i = 0;
  function peek() { return i < tokens.length ? tokens[i] : null; }
  function consume(t) { const tok = tokens[i]; if (tok && tok.t === t) { i++; return tok; } throw new Error('Expected ' + t); }
  function parseAddSub() {
    let left = parseMulDiv();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = consume('op').v;
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function parseMulDiv() {
    let left = parseUnary();
    while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = consume('op').v;
      const right = parseUnary();
      if (op === '*') { left *= right; }
      else { if (right === 0) throw new Error('Division by zero'); left /= right; }
    }
    return left;
  }
  function parseUnary() {
    if (peek() && peek().t === 'op' && peek().v === '-') { consume('op'); return -parsePrimary(); }
    if (peek() && peek().t === 'op' && peek().v === '+') { consume('op'); return parsePrimary(); }
    return parsePrimary();
  }
  function parsePrimary() {
    if (!peek()) throw new Error('Unexpected end of expression');
    if (peek().t === 'num') return consume('num').v;
    if (peek().t === 'op' && peek().v === '(') {
      consume('op');
      const val = parseAddSub();
      if (!peek() || peek().t !== 'op' || peek().v !== ')') throw new Error('Missing closing parenthesis');
      consume('op');
      return val;
    }
    throw new Error('Unexpected token: ' + (peek()?.v || '?'));
  }
  const result = parseAddSub();
  if (i !== tokens.length) throw new Error('Unexpected trailing characters');
  if (!isFinite(result)) throw new Error('Result is not finite');
  return result;
}

describe('safeEvaluate', () => {
  it('basic arithmetic', () => {
    assert.equal(safeEvaluate('25 * 48 + 120'), 25 * 48 + 120);
    assert.equal(safeEvaluate('10 + 20 * 3'), 10 + 20 * 3);
    assert.equal(safeEvaluate('(10 + 20) * 3'), (10 + 20) * 3);
    assert.equal(safeEvaluate('-5 + 3'), -5 + 3);
    assert.equal(safeEvaluate('100 / 4'), 100 / 4);
    assert.equal(safeEvaluate('2.5 * 4'), 2.5 * 4);
    assert.equal(safeEvaluate('1 + 2 + 3 + 4'), 1 + 2 + 3 + 4);
    assert.equal(safeEvaluate('10 - 5 - 2'), 10 - 5 - 2);
    assert.equal(safeEvaluate('0'), 0);
    assert.equal(safeEvaluate('-3'), -3);
    assert.equal(safeEvaluate('+5'), 5);
  });

  it('nested parentheses', () => {
    assert.equal(safeEvaluate('((2 + 3) * (4 + 1))'), 25);
    assert.equal(safeEvaluate('(1 + (2 * (3 + 4)))'), 1 + (2 * (3 + 4)));
  });

  it('division by zero throws', () => {
    assert.throws(() => safeEvaluate('1 / 0'), /Division by zero/);
  });

  it('rejects non-arithmetic input', () => {
    assert.throws(() => safeEvaluate('constructor.constructor("return 1")()'), /Unexpected character/);
    assert.throws(() => safeEvaluate('process.env'), /Unexpected character/);
    assert.throws(() => safeEvaluate('require("fs")'), /Unexpected character/);
    assert.throws(() => safeEvaluate('1; process.exit()'), /Unexpected character/);
    assert.throws(() => safeEvaluate('__proto__'), /Unexpected character/);
  });

  it('rejects malformed expressions', () => {
    assert.throws(() => safeEvaluate(''), /Unexpected end/);
    assert.throws(() => safeEvaluate('1 +'), /Unexpected end/);
    assert.throws(() => safeEvaluate('(1 + 2'), /Missing closing parenthesis/);
    assert.throws(() => safeEvaluate('1 2'), /Unexpected trailing/);
  });
});

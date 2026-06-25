import { describe, it, expect } from 'vitest';
import { validateSpec } from '../src/spec/validateSpec';
import type { UISpec } from '../src/spec/types';

describe('validateSpec (never-throw, Charter P11/B9)', () => {
  it('accepts an empty spec and a clean spec', () => {
    expect(validateSpec({}).ok).toBe(true);
    const clean: UISpec = {
      currency: { code: 'EUR', decimals: 2 },
      betLadder: { levels: [1, 2, 5], index: 1 },
      autoplay: { options: [10, 25, Infinity] },
      menu: {
        settings: [
          { kind: 'slider', id: 'music', initial: 0.7 },
          { kind: 'select', id: 'lang', options: [{ value: 'en', label: 'EN' }] },
        ],
      },
    };
    const r = validateSpec(clean);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('flags duplicate and blank ids', () => {
    const r = validateSpec({
      menu: {
        settings: [
          { kind: 'toggle', id: 'x' },
          { kind: 'toggle', id: 'x' },
          { kind: 'text', id: '', text: '' },
        ],
      },
    });
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain('dup-id');
    expect(codes).toContain('blank-id');
    expect(r.ok).toBe(false);
  });

  it('flags empty bet ladder and out-of-range index', () => {
    expect(validateSpec({ betLadder: { levels: [] } }).issues.map((i) => i.code)).toContain('empty-levels');
    expect(validateSpec({ betLadder: { levels: [1, 2], index: 5 } }).issues.map((i) => i.code)).toContain('index-oor');
  });

  it('flags bad autoplay options but allows Infinity', () => {
    expect(validateSpec({ autoplay: { options: [10, 0, -5] } }).issues.filter((i) => i.code === 'bad-option')).toHaveLength(2);
    expect(validateSpec({ autoplay: { options: [10, Infinity] } }).ok).toBe(true);
  });

  it('flags a select with no options and a slider out of 0..1', () => {
    expect(validateSpec({ menu: { settings: [{ kind: 'select', id: 's', options: [] }] } }).issues.map((i) => i.code)).toContain('select-empty');
    expect(validateSpec({ menu: { settings: [{ kind: 'slider', id: 'v', initial: 2 }] } }).issues.map((i) => i.code)).toContain('slider-range');
  });

  it('flags an unknown anchor in a control override', () => {
    const r = validateSpec({ controls: { spin: { layout: { anchor: 'nowhere' as never } } } });
    expect(r.issues.map((i) => i.code)).toContain('bad-anchor');
  });

  it('recurses into groups and never throws on garbage', () => {
    const junk = { menu: { settings: [{ kind: 'group', id: 'g', children: [{ kind: 'wat', id: 'q' }] }] } } as unknown as UISpec;
    expect(validateSpec(junk).issues.map((i) => i.code)).toContain('unknown-kind');
    expect(() => validateSpec(null as unknown as UISpec)).not.toThrow();
    expect(validateSpec(null as unknown as UISpec).ok).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { cleanSourceUrl } from '../src/core/exporting';

describe('image source address', () => {
  it('keeps a normal http(s) address', () => {
    expect(cleanSourceUrl('https://example.com/a/logo.png')).toBe('https://example.com/a/logo.png');
    expect(cleanSourceUrl('http://localhost:8080/x.svg')).toBe('http://localhost:8080/x.svg');
  });
  it('drops anything that is not an http(s) address', () => {
    expect(cleanSourceUrl('javascript:alert(1)')).toBeUndefined();
    expect(cleanSourceUrl('data:image/png;base64,AAAA')).toBeUndefined();
    expect(cleanSourceUrl('not a url')).toBeUndefined();
    expect(cleanSourceUrl(42)).toBeUndefined();
    expect(cleanSourceUrl(undefined)).toBeUndefined();
  });
  it('drops very long addresses', () => {
    expect(cleanSourceUrl('https://example.com/' + 'a'.repeat(2100))).toBeUndefined();
  });
});

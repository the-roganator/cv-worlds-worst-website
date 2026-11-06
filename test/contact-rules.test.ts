import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_LENGTH, MAX_NAME_LENGTH, readContactForm, validateContactForm } from '../src/contact.ts';

const valid = { name: 'Ada', email: 'ada@example.org', message: 'Is the ladder still available?' };

describe('the contact form', () => {
  it('accepts a complete form', () => {
    expect(validateContactForm(valid)).toEqual({});
  });

  it('trims what was typed', () => {
    const fields = new URLSearchParams({ name: '  Ada ', email: ' ada@example.org ', message: ' Hello. ' });
    expect(readContactForm(fields)).toEqual({ name: 'Ada', email: 'ada@example.org', message: 'Hello.' });
  });

  it('asks for each missing field', () => {
    expect(Object.keys(validateContactForm({ name: '', email: '', message: '' }))).toEqual([
      'name',
      'email',
      'message',
    ]);
  });

  it.each(['ada', 'ada@', '@example.org', 'ada@example', 'ada @example.org', 'ada@@example.org'])(
    'rejects the address %s',
    (email) => {
      expect(validateContactForm({ ...valid, email }).email).toBeDefined();
    },
  );

  it('limits the length of a name and a message', () => {
    expect(validateContactForm({ ...valid, name: 'a'.repeat(MAX_NAME_LENGTH) })).toEqual({});
    expect(validateContactForm({ ...valid, name: 'a'.repeat(MAX_NAME_LENGTH + 1) }).name).toBeDefined();
    expect(validateContactForm({ ...valid, message: 'a'.repeat(MAX_MESSAGE_LENGTH) })).toEqual({});
    expect(validateContactForm({ ...valid, message: 'a'.repeat(MAX_MESSAGE_LENGTH + 1) }).message).toBeDefined();
  });
});

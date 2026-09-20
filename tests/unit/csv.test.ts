import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvObjects, toCsv } from '@/lib/domain/csv';

describe('parseCsv', () => {
  it('parses quoted fields, escaped quotes, CRLF and BOM', () => {
    const text = '﻿a,b,c\r\n1,"two, with comma","say ""hi"""\r\n\r\n4,5,6\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'two, with comma', 'say "hi"'],
      ['4', '5', '6'],
    ]);
  });

  it('parses header rows into objects with normalised keys', () => {
    const { headers, rows } = parseCsvObjects('Roll Number,Full Name,email\nODL1, Asha ,asha@x.in');
    expect(headers).toEqual(['roll_number', 'full_name', 'email']);
    expect(rows).toEqual([{ roll_number: 'ODL1', full_name: 'Asha', email: 'asha@x.in' }]);
  });

  it('round-trips through toCsv', () => {
    const csv = toCsv(['a', 'b'], [['x,y', 'he said "no"'], [1, null]]);
    expect(csv).toBe('a,b\r\n"x,y","he said ""no"""\r\n1,\r\n');
    expect(parseCsv(csv)).toEqual([
      ['a', 'b'],
      ['x,y', 'he said "no"'],
      ['1', ''],
    ]);
  });
});

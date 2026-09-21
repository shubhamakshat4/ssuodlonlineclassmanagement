import { describe, expect, it } from 'vitest';
import { parseCsvObjects } from '@/lib/domain/csv';
import { SPECS, specFor, templateCsv, timetableSpec, validateRows } from '@/lib/admin/csv-specs';

describe('CSV templates', () => {
  it('every template parses back with exactly the spec columns and validates cleanly', () => {
    for (const spec of SPECS) {
      const csv = templateCsv(spec);
      const { headers, rows } = parseCsvObjects(csv);
      expect(headers, spec.key).toEqual(spec.columns.map((c) => c.name));
      expect(rows.length, spec.key).toBe(spec.sampleRows.length);
      const v = validateRows(spec, headers, rows);
      expect(v.issues, `${spec.key}: ${JSON.stringify(v.issues)}`).toHaveLength(0);
      expect(v.ok).toHaveLength(rows.length);
    }
  });

  it('specFor resolves keys and rejects unknown ones', () => {
    expect(specFor('timetable')?.title).toBe('Timetable slots');
    expect(specFor('nope')).toBeUndefined();
  });
});

describe('validateRows', () => {
  it('reports a missing required column once, with the expected header', () => {
    const { headers, rows } = parseCsvObjects('code\nBBA-ODL');
    const v = validateRows(SPECS[0], headers, rows);
    expect(v.ok).toHaveLength(0);
    expect(v.issues[0].message).toMatch(/Missing required column\(s\): name/);
    expect(v.issues[0].message).toMatch(/Expected header: code,name,is_active/);
  });

  it('keeps good rows, reports bad rows by CSV line number, and maps ok indexes back to lines', () => {
    const text = ['batch_code,subject_code,teacher_email,day,start_time,end_time,effective_from,effective_to', 'BBA-ODL-2026,BBA101,t@x.in,Mon,18:00,19:00,2026-07-01,', 'BBA-ODL-2026,BBA101,not-an-email,Funday,19:00,18:00,2026/07/01,', 'bba-odl-2026,bba101,T@X.IN,6,9:30,10:30,2026-07-01,2026-12-31'].join('\n');
    const { headers, rows } = parseCsvObjects(text);
    const v = validateRows(timetableSpec, headers, rows);
    expect(v.ok).toHaveLength(2);
    expect(v.issues).toHaveLength(1);
    expect(v.issues[0].line).toBe(3);
    expect(v.issues[0].message).toMatch(/teacher_email/);
    expect(v.issues[0].message).toMatch(/day/);
    expect(v.issues[0].message).toMatch(/effective_from/);
    // normalisation: codes upper-cased, email lower-cased, day names → numbers, times zero-padded
    expect(v.ok[1]).toMatchObject({ batch_code: 'BBA-ODL-2026', subject_code: 'BBA101', teacher_email: 't@x.in', day: 6, start_time: '09:30', end_time: '10:30', effective_to: '2026-12-31' });
    expect(v.ok[0].day).toBe(1);
    expect(v.ok[0].effective_to).toBeUndefined();
    expect(v.lineOf(1)).toBe(4);
  });

  it('rejects end before start and effective_to before effective_from', () => {
    const { headers, rows } = parseCsvObjects('batch_code,subject_code,teacher_email,day,start_time,end_time,effective_from,effective_to\nBB-1,S1,t@x.in,Mon,19:00,18:00,2026-07-01,2026-06-01');
    const v = validateRows(timetableSpec, headers, rows);
    expect(v.issues[0].message).toMatch(/end_time must be after start_time/);
    expect(v.issues[0].message).toMatch(/effective_to must be on\/after/);
  });

  it('parses yes/no booleans and defaults', () => {
    const { headers, rows } = parseCsvObjects('code,name,is_active\nX1,One,no\nX2,Two,\nX3,Three,maybe');
    const v = validateRows(SPECS[0], headers, rows);
    expect(v.ok.map((r) => r.is_active)).toEqual([false, true]);
    expect(v.issues[0].line).toBe(4);
    expect(v.issues[0].message).toMatch(/yes\/no/);
  });
});

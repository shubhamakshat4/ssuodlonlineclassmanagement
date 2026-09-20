import { describe, expect, it } from 'vitest';
import { dateRangesOverlap, findClashes, timesOverlap, type SlotLike } from '@/lib/domain/clash';

const base: SlotLike = {
  id: 'a',
  batch_id: 'batch-1',
  teacher_id: 'teacher-1',
  day_of_week: 1,
  start_time: '10:00:00',
  end_time: '11:00:00',
  effective_from: '2026-07-01',
  effective_to: null,
  is_active: true,
};

describe('timesOverlap', () => {
  it('treats touching ranges as not overlapping', () => {
    expect(timesOverlap('10:00', '11:00', '11:00', '12:00')).toBe(false);
    expect(timesOverlap('10:00', '11:00', '10:30', '12:00')).toBe(true);
    expect(timesOverlap('10:00', '11:00', '09:00', '10:01')).toBe(true);
  });
});

describe('dateRangesOverlap', () => {
  it('handles open-ended ranges', () => {
    expect(dateRangesOverlap('2026-07-01', null, '2026-09-01', null)).toBe(true);
    expect(dateRangesOverlap('2026-07-01', '2026-08-31', '2026-09-01', null)).toBe(false);
    expect(dateRangesOverlap('2026-07-01', '2026-09-01', '2026-09-01', '2026-12-01')).toBe(true);
  });
});

describe('findClashes', () => {
  it('flags the same teacher double-booked in another batch', () => {
    const c = findClashes({ ...base, id: 'new', batch_id: 'batch-2', start_time: '10:30', end_time: '11:30' }, [base]);
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe('teacher');
  });

  it('flags the same batch double-booked with another teacher', () => {
    const c = findClashes({ ...base, id: 'new', teacher_id: 'teacher-2' }, [base]);
    expect(c[0].kind).toBe('batch');
  });

  it('flags an exact duplicate as both', () => {
    expect(findClashes({ ...base, id: 'new' }, [base])[0].kind).toBe('both');
  });

  it('ignores other days, non-overlapping times, disjoint date ranges, inactive slots and itself', () => {
    expect(findClashes({ ...base, id: 'new', day_of_week: 2 }, [base])).toHaveLength(0);
    expect(findClashes({ ...base, id: 'new', start_time: '11:00', end_time: '12:00' }, [base])).toHaveLength(0);
    expect(findClashes({ ...base, id: 'new', effective_from: '2027-01-01' }, [{ ...base, effective_to: '2026-12-31' }])).toHaveLength(0);
    expect(findClashes({ ...base, id: 'new' }, [{ ...base, is_active: false }])).toHaveLength(0);
    expect(findClashes(base, [base])).toHaveLength(0);
    expect(findClashes({ ...base, is_active: false }, [{ ...base, id: 'b' }])).toHaveLength(0);
  });
});

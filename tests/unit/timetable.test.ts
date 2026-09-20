import { describe, expect, it } from 'vitest';
import { expandSlots, type HolidayInput, type SlotInput } from '@shared/timetable.ts';

const TZ = 'Asia/Kolkata';
const slot = (over: Partial<SlotInput> = {}): SlotInput => ({
  id: 'slot-1',
  batch_subject_id: 'bs-1',
  teacher_id: 't-1',
  day_of_week: 1, // Monday
  start_time: '10:00:00',
  end_time: '11:00:00',
  effective_from: '2026-07-01',
  effective_to: null,
  is_active: true,
  batch_id: 'batch-1',
  ...over,
});

// 2026-09-21 is a Monday.
const now = new Date('2026-09-20T20:00:00Z'); // 01:30 IST on Mon 21 Sep (the nightly run)

describe('expandSlots', () => {
  it('generates one session per matching weekday inside the horizon with IST-correct instants', () => {
    const out = expandSlots([slot()], [], { horizonDays: 21, tz: TZ, now });
    // 21 days from Mon 21 Sep .. Sun 11 Oct contain Mondays 21, 28 Sep and 5 Oct
    expect(out.map((s) => s.scheduled_start)).toEqual(['2026-09-21T04:30:00.000Z', '2026-09-28T04:30:00.000Z', '2026-10-05T04:30:00.000Z']);
    expect(out[0].scheduled_end).toBe('2026-09-21T05:30:00.000Z');
    expect(out[0]).toMatchObject({ timetable_slot_id: 'slot-1', batch_subject_id: 'bs-1', teacher_id: 't-1', status: 'scheduled', sync_status: 'pending', provider: 'teams' });
  });

  it('uses the calendar date in the zone, not UTC (run happens at 01:30 IST = previous UTC day)', () => {
    // At 20:00Z on Sunday 20 Sep it is already Monday in IST, so Monday 21 Sep is included.
    const out = expandSlots([slot()], [], { horizonDays: 1, tz: TZ, now });
    expect(out).toHaveLength(1);
    const outUtc = expandSlots([slot()], [], { horizonDays: 1, tz: 'UTC', now });
    expect(outUtc).toHaveLength(0);
  });

  it('skips global holidays and batch-specific holidays for that batch only', () => {
    const holidays: HolidayInput[] = [
      { date: '2026-09-28', batch_id: null },
      { date: '2026-10-05', batch_id: 'batch-2' },
    ];
    const out = expandSlots([slot(), slot({ id: 'slot-2', batch_id: 'batch-2', batch_subject_id: 'bs-2' })], holidays, { horizonDays: 21, tz: TZ, now });
    const b1 = out.filter((s) => s.timetable_slot_id === 'slot-1').map((s) => s.scheduled_start.slice(0, 10));
    const b2 = out.filter((s) => s.timetable_slot_id === 'slot-2').map((s) => s.scheduled_start.slice(0, 10));
    expect(b1).toEqual(['2026-09-21', '2026-10-05']);
    expect(b2).toEqual(['2026-09-21']);
  });

  it('honours effective_from / effective_to inclusively', () => {
    const out = expandSlots([slot({ effective_from: '2026-09-28', effective_to: '2026-10-05' })], [], { horizonDays: 21, tz: TZ, now });
    expect(out.map((s) => s.scheduled_start.slice(0, 10))).toEqual(['2026-09-28', '2026-10-05']);
  });

  it('ignores inactive slots and inactive offerings', () => {
    expect(expandSlots([slot({ is_active: false })], [], { horizonDays: 21, tz: TZ, now })).toHaveLength(0);
    expect(expandSlots([slot({ offering_active: false })], [], { horizonDays: 21, tz: TZ, now })).toHaveLength(0);
  });

  it('is deterministic and sorted by start time', () => {
    const slots = [slot({ id: 'b', day_of_week: 3, start_time: '18:00', end_time: '19:00' }), slot({ id: 'a' })];
    const out = expandSlots(slots, [], { horizonDays: 7, tz: TZ, now });
    expect(out.map((s) => s.timetable_slot_id)).toEqual(['a', 'b']);
    expect(expandSlots(slots, [], { horizonDays: 7, tz: TZ, now })).toEqual(out);
  });

  it('accepts an explicit from date', () => {
    const out = expandSlots([slot()], [], { from: '2026-10-01', horizonDays: 7, tz: TZ });
    expect(out.map((s) => s.scheduled_start.slice(0, 10))).toEqual(['2026-10-05']);
  });
});

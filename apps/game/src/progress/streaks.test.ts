import { afterEach, describe, expect, it } from 'vitest';
import { daysBetween, localDateString, streakFrom } from './streaks';

/**
 * The machine running these tests has one timezone, and a calculation that
 * wrongly uses UTC can agree with the right answer in it. So the timezone-
 * sensitive tests run in several, picked to include east and west of UTC, a
 * half-hour offset, the far-east date line, and zones with DST changes.
 */
const JANUARY_OFFSET_MINUTES = {
  UTC: 0,
  'Pacific/Auckland': -780,
  'Pacific/Kiritimati': -840,
  'Asia/Kolkata': -330,
  'America/Los_Angeles': 480,
  'America/New_York': 300,
  'Europe/London': 0,
  'Australia/Sydney': -660,
} as const;
const ZONES = Object.keys(JANUARY_OFFSET_MINUTES) as Array<keyof typeof JANUARY_OFFSET_MINUTES>;

const originalTz = process.env.TZ;
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

function inZone(zone: keyof typeof JANUARY_OFFSET_MINUTES): void {
  process.env.TZ = zone;
  // Guard against the runtime ignoring the change: if it did, every zone would
  // be silently testing the same offset and the point of looping is lost.
  expect(new Date(2026, 0, 15, 12).getTimezoneOffset()).toBe(JANUARY_OFFSET_MINUTES[zone]);
}

describe('localDateString', () => {
  it.each(ZONES)('formats as YYYY-MM-DD in local time (%s)', (zone) => {
    inZone(zone);
    const noon = new Date(2026, 9, 10, 12, 0, 0);
    expect(localDateString(noon.getTime())).toBe('2026-10-10');
  });

  it.each(ZONES)('pads single-digit months and days (%s)', (zone) => {
    inZone(zone);
    const early = new Date(2026, 0, 5, 9, 0, 0);
    expect(localDateString(early.getTime())).toBe('2026-01-05');
  });

  it.each(ZONES)('uses local time, not UTC: a late-evening session is still today (%s)', (zone) => {
    // 11:30pm local. West of UTC this is already tomorrow in UTC, and a child
    // told their streak broke because of that would be right to object.
    inZone(zone);
    expect(localDateString(new Date(2026, 9, 10, 23, 30, 0).getTime())).toBe('2026-10-10');
  });

  it.each(ZONES)('uses local time, not UTC: a just-after-midnight session is today (%s)', (zone) => {
    // 00:30 local. East of UTC this is still yesterday in UTC.
    inZone(zone);
    expect(localDateString(new Date(2026, 9, 10, 0, 30, 0).getTime())).toBe('2026-10-10');
  });

  it.each(ZONES)('is right at the turn of a month, a year and a leap day (%s)', (zone) => {
    inZone(zone);
    expect(localDateString(new Date(2026, 9, 31, 23, 59, 0).getTime())).toBe('2026-10-31');
    expect(localDateString(new Date(2027, 0, 1, 0, 1, 0).getTime())).toBe('2027-01-01');
    expect(localDateString(new Date(2028, 1, 29, 23, 59, 0).getTime())).toBe('2028-02-29');
    expect(localDateString(new Date(2028, 2, 1, 0, 1, 0).getTime())).toBe('2028-03-01');
  });
});

describe('streakFrom', () => {
  it('is zero when the child has never played', () => {
    expect(streakFrom(null, '2026-10-10')).toBe(0);
  });

  it('is one when they played today for the first time', () => {
    expect(streakFrom('2026-10-10', '2026-10-10')).toBe(1);
  });

  it('counts yesterday as still going', () => {
    expect(streakFrom('2026-10-09', '2026-10-10')).toBe(1);
  });

  it('is broken by a missed day', () => {
    expect(streakFrom('2026-10-08', '2026-10-10')).toBe(0);
  });

  it('stays broken however long the gap', () => {
    expect(streakFrom('2026-01-01', '2026-10-10')).toBe(0);
    expect(streakFrom('2025-10-10', '2026-10-10')).toBe(0);
  });

  it('counts calendar days, not 24-hour periods', () => {
    // 7pm Monday then 8am Tuesday is two days running. Telling a child
    // otherwise would be both wrong and unkind.
    expect(streakFrom('2026-10-12', '2026-10-13')).toBe(1);
  });

  describe('from real timestamps, in any timezone', () => {
    const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();

    it.each(ZONES)('keeps the run alive 7pm Monday to 8am Tuesday, only 13 hours (%s)', (zone) => {
      inZone(zone);
      const monday = localDateString(at(2026, 10, 12, 19));
      const tuesday = localDateString(at(2026, 10, 13, 8));
      expect(streakFrom(monday, tuesday)).toBe(1);
    });

    it.each(ZONES)('keeps the run alive 7am Monday to 11pm Tuesday, a gap of 40 hours (%s)', (zone) => {
      // More than a day and a half apart, yet consecutive calendar days. A
      // 24-hour-period rule would break the streak here.
      inZone(zone);
      const monday = localDateString(at(2026, 10, 12, 7));
      const tuesday = localDateString(at(2026, 10, 13, 23));
      expect(streakFrom(monday, tuesday)).toBe(1);
    });

    it.each(ZONES)('breaks the run 11pm Monday to 1am Wednesday, only 26 hours (%s)', (zone) => {
      // Barely over a day, yet a whole calendar day (Tuesday) was missed.
      inZone(zone);
      const monday = localDateString(at(2026, 10, 12, 23));
      const wednesday = localDateString(at(2026, 10, 14, 1));
      expect(streakFrom(monday, wednesday)).toBe(0);
    });

    it.each(ZONES)('keeps the run alive across clocks going forward and back, every day for three years (%s)', (zone) => {
      // Spans every DST change in the listed zones, a 23- and a 25-hour day
      // each, plus two year ends and the 2028 leap day. A rule built on
      // elapsed hours breaks on exactly these days.
      inZone(zone);
      let previous = localDateString(at(2026, 1, 1, 12));
      for (let i = 1; i < 1100; i += 1) {
        const date = localDateString(new Date(2026, 0, 1 + i, 12).getTime());
        expect(date > previous, `${previous} -> ${date}`).toBe(true);
        expect(streakFrom(previous, date), `${previous} -> ${date}`).toBe(1);
        previous = date;
      }
      expect(previous).toBe('2029-01-04');
    });

    it.each(ZONES)('breaks the run when exactly one day is skipped, every day for three years (%s)', (zone) => {
      inZone(zone);
      for (let i = 2; i < 1100; i += 1) {
        const earlier = localDateString(new Date(2026, 0, 1 + i - 2, 23, 30).getTime());
        const later = localDateString(new Date(2026, 0, 1 + i, 0, 30).getTime());
        expect(streakFrom(earlier, later), `${earlier} -> ${later}`).toBe(0);
      }
    });
  });

  it('handles a month boundary', () => {
    expect(streakFrom('2026-10-31', '2026-11-01')).toBe(1);
    expect(streakFrom('2026-10-30', '2026-11-01')).toBe(0);
  });

  it('handles a year boundary', () => {
    expect(streakFrom('2026-12-31', '2027-01-01')).toBe(1);
    expect(streakFrom('2026-12-30', '2027-01-01')).toBe(0);
  });

  it('handles a leap day', () => {
    expect(streakFrom('2028-02-29', '2028-03-01')).toBe(1);
    expect(streakFrom('2028-02-28', '2028-02-29')).toBe(1);
    expect(streakFrom('2028-02-28', '2028-03-01')).toBe(0);
  });

  it('knows that February has no 29th in a non-leap year, including 2100', () => {
    expect(streakFrom('2027-02-28', '2027-03-01')).toBe(1);
    expect(streakFrom('2100-02-28', '2100-03-01')).toBe(1);
    expect(streakFrom('2000-02-28', '2000-03-01')).toBe(0);
  });

  it('treats a future stored date as today, not as a broken streak', () => {
    // Clock changes and timezone travel happen. Punishing a child for it is
    // the wrong call, so the benefit of the doubt goes to them.
    expect(streakFrom('2026-10-11', '2026-10-10')).toBe(1);
  });

  it('is not tripped by a future date more than a day ahead', () => {
    expect(streakFrom('2026-10-20', '2026-10-10')).toBe(1);
  });
});

describe('daysBetween', () => {
  it('is zero for the same day', () => {
    expect(daysBetween('2026-10-10', '2026-10-10')).toBe(0);
  });

  it('counts whole days, whatever the length of the months between', () => {
    expect(daysBetween('2026-01-31', '2026-03-01')).toBe(29);
    expect(daysBetween('2028-01-31', '2028-03-01')).toBe(30);
    expect(daysBetween('2026-10-10', '2027-10-10')).toBe(365);
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
  });

  it('is negative when the second date is earlier', () => {
    expect(daysBetween('2026-10-11', '2026-10-10')).toBe(-1);
  });

  it.each(ZONES)('is a whole number of days even across a clock change (%s)', (zone) => {
    // Arithmetic done on UTC midnights has no 23- or 25-hour days.
    inZone(zone);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-04-04', '2026-04-06')).toBe(2);
  });
});

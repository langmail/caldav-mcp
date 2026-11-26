import ICAL from "ical.js";
import type { Alarm } from "ts-caldav";

// ts-caldav reads an absolute alarm trigger (`TRIGGER;VALUE=DATE-TIME:…`) back
// as an ISO string such as "2026-11-27T08:00:00Z", but its writer hands every
// trigger to ical.js as a duration, which throws on that string. So an event
// or todo read with such an alarm can't be written back unchanged. Upstream
// report: #192.
const DURATION = /^[+-]?P/u;

/**
 * Prepares alarms read from the server for ts-caldav's writer: an absolute
 * trigger becomes an `ICAL.Time`, which ical.js writes as
 * `TRIGGER;VALUE=DATE-TIME:…`. Relative triggers pass through unchanged.
 */
export function toWritableAlarms(alarms: Alarm[]): Alarm[] {
	return alarms.map((alarm) =>
		DURATION.test(alarm.trigger)
			? alarm
			: {
					...alarm,
					// ts-caldav types the trigger as a string but passes it to ical.js
					// as is, and ical.js accepts an ICAL.Time.
					trigger: ICAL.Time.fromDateTimeString(
						alarm.trigger
					) as unknown as string,
				}
	);
}

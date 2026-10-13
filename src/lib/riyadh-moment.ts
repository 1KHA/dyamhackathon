/**
 * moment with Asia/Riyadh as the default zone — for react-big-calendar and the
 * mentor slot form. Everything created through it (moment(), moment(string),
 * the calendar's grid, picked slots) is Saudi local time on every device.
 * Import this BEFORE calling momentLocalizer(): the localizer measures the
 * zone when it is created.
 *
 * The 10-year data build (~12 KB gzipped) is used rather than Riyadh alone:
 * react-big-calendar also looks up the DEVICE's zone (moment.tz.guess()) and
 * crashes when that zone has no data. See src/lib/riyadh-time.ts.
 */
import moment from 'moment-timezone/builds/moment-timezone-with-data-10-year-range';
import 'moment/locale/ar';
import { APP_TIME_ZONE } from './riyadh-time';

moment.tz.setDefault(APP_TIME_ZONE);
moment.locale('ar');

export default moment;

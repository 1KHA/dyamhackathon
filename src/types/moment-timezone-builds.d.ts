// The prebuilt moment-timezone bundles have no typings of their own; they are
// the same API as 'moment-timezone' (see src/lib/riyadh-moment.ts).
declare module 'moment-timezone/builds/moment-timezone-with-data-10-year-range' {
  import moment = require('moment-timezone');
  export = moment;
}

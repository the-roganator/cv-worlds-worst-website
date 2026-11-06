/**
 * The feature flags the shop asks about. A page asks `request.flag(name)` only with a name on this list, and `tsc`
 * refuses any other, so which flags exist is said here, in one place, and a new flag is a line here as well as the
 * change behind it.
 *
 * A name is lower-case letters and digits, in words joined by hyphens (`big-buttons`): the flag context treats any
 * other as off, and a test holds each name here to it. Whether a flag is on is flagd's to say, not this list's.
 */
export const FLAG_NAMES = [] as const;

/** A flag the shop may ask about. */
export type FlagName = (typeof FLAG_NAMES)[number];

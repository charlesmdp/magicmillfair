// The cards that come by themselves, to make an offer in full — each six times at the most, counted from the
// first visit, each time with words of its own; who comes back after a while sees the last one that is due, and
// the earlier ones are counted as seen (main.js keeps when the first visit was, `mmf.first`, and how many of each
// were passed: `mmf.passcards`, `mmf.accountcards`).
//
//   the Game Pass, to who plays without it: fifteen minutes after the first visit, then one hour, two hours, a
//   day, two days and three days after it (what the pass gives is said by items.js: PASS)
//   an account, to who plays without one: in between — ten minutes, forty, an hour and a half, half a day, a day
//   and a half, two days and a half —; never again once they have one

const MIN = 60_000, HOUR = 60 * MIN;
/** When each card of the Game Pass is due: so long after the first visit (ms). */
export const PASS_TIMES = [15 * MIN, HOUR, 2 * HOUR, 24 * HOUR, 48 * HOUR, 72 * HOUR];

/** What each says: a line over the title, the title, a sentence under it, and the button that leaves it. */
export const PASS_LINES = [
  {
    eyebrow: 'Fifteen minutes in the oasis',
    title: 'You clearly like it here.',
    lead: 'Fifteen minutes is how it starts. Next thing you know you have a favourite bench and opinions about the boulder. The Game Pass is for those who are staying:',
    no: 'Maybe later',
  },
  {
    eyebrow: 'One hour at the end of the world',
    title: 'An hour already — and still in the factory colour?',
    lead: 'Billy the alligator has noticed, and he is worried about your personal brand. Sixteen more colours, four sizes, every hat: your robot deserves a glow-up.',
    no: 'I like my robot plain',
  },
  {
    eyebrow: 'Two hours!',
    title: 'Two hours. The pier knows your footsteps.',
    lead: 'At this point you are not visiting, you are commuting — and commuters deserve a jetpack. A hat for every mood comes with it:',
    no: 'Not today',
  },
  {
    eyebrow: 'You came back',
    title: 'Back the next day. The oasis noticed.',
    lead: 'Somewhere a vending machine hummed a little louder. People who come back the next day tend to stay — and the ones who stay look better in a hat:',
    no: 'Maybe tomorrow',
  },
  {
    eyebrow: 'Two days at Atomic Oasis',
    title: 'Two days in. You know the boulder’s timetable by heart.',
    lead: 'That is dedication, and dedication deserves to be seen from the island: a Titan-sized robot, in black, with a jetpack and a crown.',
    no: 'Not yet',
  },
  {
    eyebrow: 'Three days at Atomic Oasis',
    title: 'Three days. You are a local now.',
    lead: 'Locals get the good stuff — and keep the lights of the oasis on for everybody else. The guy on the couch who makes this game thanks you in advance:',
    no: 'Maybe next time',
  },
];

/** When each card of an account is due: so long after the first visit (ms) — each between two of the Game Pass. */
export const ACCOUNT_TIMES = [10 * MIN, 40 * MIN, 90 * MIN, 12 * HOUR, 36 * HOUR, 60 * HOUR];

/** What each card of an account says (as PASS_LINES). */
export const ACCOUNT_LINES = [
  {
    eyebrow: 'Ten minutes in the oasis',
    title: 'Shall we remember you?',
    lead: 'Long enough for a best score, a favourite bench, maybe a grudge against a boulder. An account keeps all of it, wherever you play from.',
    no: 'Not now',
  },
  {
    eyebrow: 'Forty minutes, still nobody',
    title: 'Anyone could be you right now.',
    lead: 'Your name goes to whoever types it first — and your scores with it. An account locks it to you, behind a password only you know.',
    no: 'I will risk it',
  },
  {
    eyebrow: 'An hour and a half!',
    title: 'Your robot would like a passport.',
    lead: 'It has seen the pier, the big wheel, possibly the bottom of the acid pond. With an account it travels to your phone, your laptop, your cousin’s computer — and comes back.',
    no: 'It can stay home',
  },
  {
    eyebrow: 'You came back',
    title: 'Welcome back. We almost forgot you.',
    lead: 'Almost: this browser remembered. Another browser, a cleared cache, a new phone — and you are a stranger again. An account fixes that for good.',
    no: 'Maybe next time',
  },
  {
    eyebrow: 'A day and a half at Atomic Oasis',
    title: 'Your days in a row deserve a safe.',
    lead: 'The animals of light come to those who keep coming back. Keep the count in an account, and a new phone will not send you back to day one.',
    no: 'Not yet',
  },
  {
    eyebrow: 'Two and a half days',
    title: 'Last time we ask. Promise.',
    lead: 'You are practically a local, and locals get their name on the door. A name, a password, thirty seconds — and the oasis remembers you everywhere.',
    no: 'Leave me nameless',
  },
];

/** What an account gives, as the tiles of its card: a few words in bold, a few more under them. */
export const ACCOUNT_PERKS = [
  ['Your name', 'nobody else can use it'],
  ['Scores that last', 'week, month and all time'],
  ['Every device', 'purchases, streak, animals'],
  ['No small print', 'a name, a password — done'],
];

/** The last of `times` whose moment has come since `first` and that was not passed (`seen` passed so far): its number, or -1. */
function due(times, first, seen, now) {
  if (!Number.isFinite(first) || first <= 0 || !Number.isFinite(now)) return -1;
  let k = -1;
  for (let i = 0; i < times.length; i++) if (now - first >= times[i]) k = i;
  return k >= Math.max(0, Number(seen) || 0) ? k : -1;
}

/**
 * Which card of the Game Pass is due, `now`: its number (0 … 5), or -1 when none is. `first`: when this visitor
 * first came (ms); `seen`: how many of the six were already passed (shown, or skipped because a later one came).
 */
export const passDue = (first, seen, now) => due(PASS_TIMES, first, seen, now);

/** Which card of an account is due, `now` (as passDue). */
export const accountDue = (first, seen, now) => due(ACCOUNT_TIMES, first, seen, now);

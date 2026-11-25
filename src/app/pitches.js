// The card of the Game Pass, as it comes by itself to who plays without it: six times at the most — fifteen
// minutes after their first visit, then one hour, two hours, a day, two days and three days after it —, each
// time with words of its own. Who comes back after a while sees the last one that is due; the earlier ones are
// counted as seen (main.js keeps when the first visit was, `mmf.first`, and how many were passed, `mmf.passcards`).
// What the pass gives is said by items.js (PASS); here are only the words that bring it up.

const MIN = 60_000, HOUR = 60 * MIN;
/** When each card is due: so long after the first visit (ms). */
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

/**
 * Which card of the Game Pass is due, `now`: its number (0 … 5), or -1 when none is. `first`: when this visitor
 * first came (ms); `seen`: how many of the six were already passed (shown, or skipped because a later one came).
 */
export function passDue(first, seen, now) {
  if (!Number.isFinite(first) || first <= 0 || !Number.isFinite(now)) return -1;
  let due = -1;
  for (let k = 0; k < PASS_TIMES.length; k++) if (now - first >= PASS_TIMES[k]) due = k;
  return due >= Math.max(0, Number(seen) || 0) ? due : -1;
}

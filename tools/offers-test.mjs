// The checks of the cards that come by themselves (src/app/pitches.js) — the Game Pass's and an account's —,
// without a browser: when each of the six is due, that a visitor who comes back after a while gets the last one
// that is due and not the others, that the two never fall at the same moment, and that each says something of
// its own. (The cards in the running game: tools/shop-test.mjs.)
// usage: node tools/offers-test.mjs
import { check, done } from './lib/check.mjs';
import { PASS_TIMES, PASS_LINES, passDue, ACCOUNT_TIMES, ACCOUNT_LINES, ACCOUNT_PERKS, accountDue } from '../src/app/pitches.js';
import { PASS } from '../server/items.js';

const MIN = 60_000, HOUR = 60 * MIN, T0 = Date.UTC(2026, 10, 25, 9, 0);

check('six cards: fifteen minutes, one hour, two hours, a day, two days and three days after the first visit',
  PASS_TIMES.join() === [15 * MIN, HOUR, 2 * HOUR, 24 * HOUR, 48 * HOUR, 72 * HOUR].join() && PASS_LINES.length === PASS_TIMES.length, PASS_TIMES.map((t) => `${t / MIN} min`).join(', '));

const at = (ms, seen = 0) => passDue(T0, seen, T0 + ms);
const cases = {
  'a newcomer, ten minutes in: nothing yet': [at(10 * MIN), -1],
  'fifteen minutes in: the first': [at(15 * MIN), 0],
  'half an hour in, the first seen: nothing': [at(30 * MIN, 1), -1],
  'an hour in, the first seen: the second': [at(61 * MIN, 1), 1],
  'two hours in, two seen: the third': [at(2 * HOUR + MIN, 2), 2],
  'back the next day with one seen: the fourth — the second and the third are skipped': [at(25 * HOUR, 1), 3],
  'back after two days with four seen: the fifth': [at(49 * HOUR, 4), 4],
  'back after a week with nothing seen: the sixth, and only it': [at(7 * 24 * HOUR, 0), 5],
  'back after a week with the six seen: nothing, ever again': [at(7 * 24 * HOUR, 6), -1],
  'no first visit known: nothing': [passDue(0, 0, T0), -1],
  'a first visit in the future (a clock put back): nothing': [passDue(T0 + HOUR, 0, T0), -1],
};
const wrong = Object.entries(cases).filter(([, [got, want]]) => got !== want);
check('which card is due: the last one whose time has come and that was not passed — never one already passed', wrong.length === 0, wrong.length ? wrong.map(([k, [got, want]]) => `${k}: ${got} instead of ${want}`).join(' | ') : `${Object.keys(cases).length} cases`);

const titles = new Set(PASS_LINES.map((l) => l.title)), leads = new Set(PASS_LINES.map((l) => l.lead)), nos = new Set(PASS_LINES.map((l) => l.no));
check('each card says something of its own: a line over its title, a title, a sentence, a way to say no — six of each, all different',
  PASS_LINES.every((l) => l.eyebrow && l.title && l.lead && l.no) && titles.size === 6 && leads.size === 6 && nos.size === 6 && new Set(PASS_LINES.map((l) => l.eyebrow)).size === 6, [...titles].join(' / '));
check('they are short enough for the card: a title of 60 letters at most, a sentence of 200, a way to say no of 24',
  PASS_LINES.every((l) => l.title.length <= 60 && l.lead.length <= 200 && l.no.length <= 24 && l.eyebrow.length <= 40), PASS_LINES.map((l) => `${l.title.length}/${l.lead.length}`).join(' '));
check('what the card says the pass gives is what the pass gives: its five lines, in a few words each',
  PASS.summary.length === PASS.perks.length && PASS.summary.every(([what, more]) => what && more && what.length <= 18 && more.length <= 26), PASS.summary.map(([w]) => w).join(', '));

// ---- the cards of an account: six too, each between two of the Game Pass
// (the first comes five minutes in — "au bout de 5mn de jeu", asked the owner: it is the question itself, "How should we call you?")
check('six cards of an account too, each between two of the Game Pass: five minutes, forty, an hour and a half, half a day, a day and a half, two days and a half',
  ACCOUNT_TIMES.join() === [5 * MIN, 40 * MIN, 90 * MIN, 12 * HOUR, 36 * HOUR, 60 * HOUR].join() && ACCOUNT_LINES.length === ACCOUNT_TIMES.length
  && ACCOUNT_TIMES.every((t, k) => t < PASS_TIMES[k] && (k === 0 || t > PASS_TIMES[k - 1])), ACCOUNT_TIMES.map((t) => `${t / MIN} min`).join(', '));
const acc = (ms, seen = 0) => accountDue(T0, seen, T0 + ms);
const accCases = {
  'four minutes in: nothing yet': [acc(4 * MIN), -1],
  'five minutes in: the first': [acc(5 * MIN), 0],
  'ten minutes in: the first': [acc(10 * MIN), 0],
  'forty-one minutes in, the first seen: the second': [acc(41 * MIN, 1), 1],
  'back the next morning with one seen: the fourth (half a day) — the second and the third are skipped': [acc(14 * HOUR, 1), 3],
  'back after a week with nothing seen: the sixth, and only it': [acc(7 * 24 * HOUR, 0), 5],
  'back after a week with the six seen: nothing, ever again': [acc(7 * 24 * HOUR, 6), -1],
  'no first visit known: nothing': [accountDue(0, 0, T0), -1],
};
const accWrong = Object.entries(accCases).filter(([, [got, want]]) => got !== want);
check('which card of an account is due: the last one whose time has come and that was not passed', accWrong.length === 0, accWrong.length ? accWrong.map(([k, [got, want]]) => `${k}: ${got} instead of ${want}`).join(' | ') : `${Object.keys(accCases).length} cases`);
const aTitles = new Set(ACCOUNT_LINES.map((l) => l.title)), aLeads = new Set(ACCOUNT_LINES.map((l) => l.lead));
check('each card of an account says something of its own, short enough for the card — and the first is still "Shall we remember you?"',
  ACCOUNT_LINES.every((l) => l.eyebrow && l.title && l.lead && l.no && l.title.length <= 60 && l.lead.length <= 200 && l.no.length <= 24 && l.eyebrow.length <= 40)
  && aTitles.size === 6 && aLeads.size === 6 && new Set(ACCOUNT_LINES.map((l) => l.no)).size === 6 && ACCOUNT_LINES[0].title === 'Shall we remember you?', [...aTitles].join(' / '));
check('what an account gives, as four tiles of a few words each', ACCOUNT_PERKS.length === 4 && ACCOUNT_PERKS.every(([what, more]) => what && more && what.length <= 18 && more.length <= 26), ACCOUNT_PERKS.map(([w]) => w).join(', '));

done();

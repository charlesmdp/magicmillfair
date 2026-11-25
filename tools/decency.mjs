// Prints the fingerprints of words, to add them to the lists of server/decency.js — where no word is written.
//
//   printf 'a word\na few words\n' | node tools/decency.mjs
//
// For each line given: its fingerprint, and where it goes. One word → WORDS (and, when it has a doubled
// letter, its squeezed fingerprint → SQUEEZED; a word of six letters or more that nothing innocent contains
// may also go to LONG, its length then being one of SIZES). Several words → PHRASES (PHRASE: the longest one,
// in words). A word that only a name must not hold → MILD and SQMILD. The words themselves are not printed.
import { fold, print } from '../server/decency.js';

let text = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) text += chunk;
let n = 0;
for (const line of text.split('\n')) {
  const w = fold(line.trim()).replace(/[^a-z0-9 ]/g, ' ').replace(/ +/g, ' ').trim();
  if (!w) continue;
  n++;
  const several = w.includes(' ');
  console.log(several ? `${n}\t${print(w)}\tPHRASES (${w.split(' ').length} words)` : `${n}\t${print(w)}\tWORDS · squeezed ${print(w.replace(/(.)\1+/g, '$1'))} · ${w.length} letters`);
}
if (!n) console.log('Give the words on the standard input, one a line.');

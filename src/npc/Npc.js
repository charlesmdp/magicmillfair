// Characters one can talk to. The words come from the server when it has a brain to lend (POST /api/npc, see
// server/npc.js); otherwise from a handful of lines kept here, so that the character is never mute.
// Billy the alligator is a life coach: one says anything to him — a question or not — and he answers one
// sentence at a time. What is said to him, and what he answers, is seen by nobody else.
import { hasApi, callApi } from '../net/api.js';

const PERSONAS = {
  alligator: {
    name: 'Billy',
    title: 'Life coach',
    ask: 'Say anything to Billy (only you two hear it)…',
    greet: [
      'Welcome, champ! Tell me anything: a question, a dream, a bad day. This stays between us.',
      'Billy, life coach. One sentence from you, one from me, one breakthrough. What is on your mind?',
      'I can see you have potential, champ. Mostly in the legs. So, how are we doing today?',
    ],
    rules: [
      [/^\s*(hi|hello|hey|yo|bonjour|salut|coucou|hola|ciao)\b/i, ['Hello, champ: honey found in ancient Egyptian tombs was still good to eat, so nothing sweet is ever late, and what are we working on today?', 'Hey, champ! An octopus has three hearts and still starts every day with one hello, so what are we working on?']],
      [/\b(thanks?|thank you|merci|cheers)\b/i, ['Gratitude is the compound interest of the soul, champ, and unlike a banana, which is slightly radioactive, it has no half-life.', 'You did the work, champ: I only held the vision board.']],
      [/\b(bye|goodbye|see you|au revoir|ciao|à plus)\b/i, ['Go get them, champ: the deck will still be here when the world has been conquered.']],
      [/\b(how are you|ça va|comment vas|how do you do)\b/i, ['Living the dream on a beanbag, champ: a sloth takes a month to digest one meal and nobody calls it unproductive.']],
      [/\b(i won|i did it|i beat|best time|record|gagn[ée]|réussi)\b/i, ['A cheetah can only sprint for about half a minute before it must lie down, champ, and you are still standing, so what is next?']],
      [/\b(i lost|i died|i fell|fail|failed|perdu|tomb[ée]|rat[ée])\b/i, ['Sharks are older than trees, champ, and nobody lasts that long by swimming into the same mistake twice, so go round next time and call it growth.']],
      [/\b(who|what) are you|your name|t'es qui|qui es[- ]tu\b/i, ['I am Billy, and I am the alligator I needed when I was younger.', 'Billy: part alligator, part vision board.']],
      [/\b(waterfall|cascade|chute)\b/i, ['West past the great pond, champ, then upstream like a salmon, a fish that climbs waterfalls on purpose and has never once asked for directions.']],
      [/\b(mostly up|climb|stones?|grimp|pierres?)\b/i, ['One stone at a time, champ: a flea jumps over a hundred times its own length with no vision board, and you only need the next stone.']],
      [/\b(stuck|bloqu|coinc)/i, ['Being stuck is just standing still with ambition: type /kill and start over lighter.']],
      [/\b(money|rich|business|startup|company|argent|entreprise|boîte)\b/i, ['Sell one thing to one person who really wants it, champ: every empire started as a lemonade stand that showed up twice.']],
      [/\b(job|work|boss|travail|boulot|patron)\b/i, ['A hermit crab never leaves its shell before it has tried on the next one, champ, so start shopping for shells today and move when one fits.']],
      [/\b(love|friend|alone|amour|ami|seul)\b/i, ['Wave first, champ: connection is just courage with good timing.']],
      [/\b(shark|swim|sea|requin|nager|mer)\b/i, ['Know your limits and swim just inside them: the shark handles everyone who skips that workshop.']],
      [/\b(mushroom|champignon)\b/i, ['Not every opportunity should be eaten, champ, and the red ones with white spots least of all.']],
      [/\b(temple|stairs|stairway|escalier)\b/i, ['The stairway in the west is long, champ, and so is everything worth standing on top of.']],
      [/\b(village|sky gate|teleport)/i, ['Step through the Sky Gate by the lane north of the mill: sometimes the view you need is one decision away.']],
      [/\b(war|nuclear|bomb|apocalypse|end of the world|robots?|atomic|guerre|nucléaire|bombe)\b/i, ['The world ended and you still showed up, champ: that is a growth mindset in one sentence.', 'Every apocalypse is a pivot, champ: we lost a planet and kept the big wheel.']],
      [/\b(tired|sad|afraid|scared|fatigu|triste|peur)\b/i, ['Sit down for a minute, champ: dolphins sleep with half a brain at a time, and you are allowed to rest the whole thing.']],
      [/\b(meaning|life|why|sens|vie|pourquoi)\b/i, ['The meaning of life is the next small thing done properly, and yes, that does include breakfast.']],
    ],
    idle: [
      'The answer was inside you all along, champ, which is convenient, because I charge by the sentence.',
      'Whatever it is, start before you are ready, champ: a day on Venus is longer than its year, and it still gets round.',
      'Wombats make cube-shaped droppings, champ, which proves that anything can be done differently if you commit to it.',
      'Fall seven times, stand up eight, and find out who keeps moving that stone.',
      'You miss every jump you do not take, champ, and a fair few of the ones you do.',
      'Be the robot you want to see in the world.',
    ],
  },
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class Npc {
  constructor(id) {
    this.id = id;
    this.persona = PERSONAS[id] || PERSONAS.alligator;
    this.name = this.persona.name;
    this.ask = this.persona.ask;
    this.title = this.persona.title || '';
  }

  greeting() { return pick(this.persona.greet); }

  _canned(text) {
    for (const [test, lines] of this.persona.rules) if (test.test(text)) return pick(lines);
    return pick(this.persona.idle);
  }

  /** What the character answers to `text`, a question or not (never throws). */
  async reply(text) {
    let answer = null;
    // (the server says whether it has a brain to lend: without one, the lines kept here)
    if ((await hasApi())?.npc) {
      const body = await callApi('api/npc', { method: 'POST', body: { npc: this.id, messages: [{ role: 'user', content: text }] } });
      if (body && typeof body.reply === 'string' && body.reply.trim()) answer = body.reply.trim().slice(0, 200);
    }
    return answer || this._canned(text);
  }
}

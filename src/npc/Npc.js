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
      [/^\s*(hi|hello|hey|yo|bonjour|salut|coucou|hola|ciao)\b/i, ['Hello, champ: showing up is half the journey, so what are we working on today?', 'Hey, champ! The best time to say hello was yesterday, and the second best is right now.']],
      [/\b(thanks?|thank you|merci|cheers)\b/i, ['Gratitude is the compound interest of the soul, champ, and you have just made a deposit.', 'You did the work, champ: I only held the vision board.']],
      [/\b(bye|goodbye|see you|au revoir|ciao|à plus)\b/i, ['Go get them, champ: the deck will still be here when the world has been conquered.']],
      [/\b(how are you|ça va|comment vas|how do you do)\b/i, ['Living the dream on a beanbag, champ: the secret is to pick a small dream and a big beanbag.']],
      [/\b(i won|i did it|i beat|best time|record|gagn[ée]|réussi)\b/i, ['That is what happens when preparation meets a full tank, champ, so which stone is next?']],
      [/\b(i lost|i died|i fell|fail|failed|perdu|tomb[ée]|rat[ée])\b/i, ['Every champion has a pond they should not have jumped into, champ, so walk round it next time and call that growth.']],
      [/\b(who|what) are you|your name|t'es qui|qui es[- ]tu\b/i, ['I am Billy, and I am the alligator I needed when I was younger.', 'Billy: part alligator, part vision board.']],
      [/\b(waterfall|cascade|chute)\b/i, ['Head west past the great pond, champ: the ones who reach the waterfall are the ones who keep walking upstream.']],
      [/\b(mostly up|climb|stones?|grimp|pierres?)\b/i, ['Success is ninety metres of small jumps, so take them one stone at a time and never look down at your comfort zone.']],
      [/\b(stuck|bloqu|coinc)/i, ['Being stuck is just standing still with ambition: type /kill and start over lighter.']],
      [/\b(money|rich|business|startup|company|argent|entreprise|boîte)\b/i, ['Sell one thing to one person who really wants it, champ: every empire started as a lemonade stand that showed up twice.']],
      [/\b(job|work|boss|travail|boulot|patron)\b/i, ['Do not leave the stone you stand on until you can see the next one, but do start looking for it today.']],
      [/\b(love|friend|alone|amour|ami|seul)\b/i, ['Wave first, champ: connection is just courage with good timing.']],
      [/\b(shark|swim|sea|requin|nager|mer)\b/i, ['Know your limits and swim just inside them: the shark handles everyone who skips that workshop.']],
      [/\b(mushroom|champignon)\b/i, ['Not every opportunity should be eaten, champ, and the red ones with white spots least of all.']],
      [/\b(temple|stairs|stairway|escalier)\b/i, ['The stairway in the west is long, champ, and so is everything worth standing on top of.']],
      [/\b(village|sky gate|teleport)/i, ['Step through the Sky Gate by the lane north of the mill: sometimes the view you need is one decision away.']],
      [/\b(tired|sad|afraid|scared|fatigu|triste|peur)\b/i, ['Sit down for a minute, champ: even the big wheel only goes round because it stops to let people on.']],
      [/\b(meaning|life|why|sens|vie|pourquoi)\b/i, ['The meaning of life is the next small thing done properly, and yes, that does include breakfast.']],
    ],
    idle: [
      'The answer was inside you all along, champ, which is convenient, because I charge by the sentence.',
      'Whatever it is, start before you are ready and finish before you are bored.',
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

// Characters one can talk to. The words come from the server when it has a brain to lend (POST /api/npc, see
// server/npc.js); otherwise from a handful of lines kept here, so that the character is never mute.
// Billy the alligator is a life coach: he answers questions, one sentence at a time, and nothing else.
import { hasApi, callApi } from '../net/api.js';

const PERSONAS = {
  alligator: {
    name: 'Billy',
    ask: 'Ask Billy a question…',
    greet: [
      'Welcome, champ! Ask me anything: every answer starts with a question.',
      'Billy, life coach. One question, one sentence, one breakthrough. What is yours?',
      'I can see you have potential, champ. Mostly in the legs. What do you want to know?',
    ],
    notAQuestion: [
      'I only coach questions, champ: put a question mark on that dream and ask me again.',
      'Growth starts with a question mark — where is yours?',
      'That is a statement; winners ask, so what is your question?',
    ],
    rules: [
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
const isQuestion = (text) => /[?？؟]/.test(text);

export class Npc {
  constructor(id) {
    this.id = id;
    this.persona = PERSONAS[id] || PERSONAS.alligator;
    this.name = this.persona.name;
    this.ask = this.persona.ask;
  }

  greeting() { return pick(this.persona.greet); }

  _canned(text) {
    for (const [test, lines] of this.persona.rules) if (test.test(text)) return pick(lines);
    return pick(this.persona.idle);
  }

  /** What the character answers to `text` (never throws). Only a question gets an answer. */
  async reply(text) {
    if (!isQuestion(text)) return pick(this.persona.notAQuestion);
    let answer = null;
    // (the server says whether it has a brain to lend: without one, the lines kept here)
    if ((await hasApi())?.npc) {
      const body = await callApi('api/npc', { method: 'POST', body: { npc: this.id, messages: [{ role: 'user', content: text }] } });
      if (body && typeof body.reply === 'string' && body.reply.trim()) answer = body.reply.trim().slice(0, 200);
    }
    return answer || this._canned(text);
  }
}

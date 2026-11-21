// Characters one can talk to. The words come from the server when it has a brain to lend (POST /api/npc, see
// server/npc.js); otherwise from a handful of lines kept here, so that the character is never mute.

const PERSONAS = {
  alligator: {
    name: 'Al',
    greet: ['Oh, hello! Pull up a beanbag.', 'Well, well. A visitor. Mind the tail.', 'You look like someone who has climbed too many stairs.'],
    rules: [
      [/\b(hello|hi|hey|salut|bonjour|coucou|yo)\b/i, ['Hello yourself. Lovely day for doing nothing.', 'Hi! I would get up, but I will not.']],
      [/\b(who|what) are you|your name|t'es qui|qui es[- ]tu\b/i, ['Al. Alligator. Professional lounger, amateur philosopher.', 'They call me Al. I call this chair "home".']],
      [/\b(eat|bite|hungry|dangerous|mange|mordre)\b/i, ['Relax. I am on a strict diet of orange juice and gossip.', 'I only bite deadlines.']],
      [/\b(work|laptop|job|bosse|travail)\b/i, ['Work? Here? The wifi is powered by ducks.', 'I tried a laptop once. The keys are very small for these hands.']],
      [/\b(swim|water|pond|sea|shark|nager|requin|étang)\b/i, ['The pond is mine. The sea belongs to a cousin with worse manners.', 'Do not swim too far out. He does not ask questions.']],
      [/\b(secret|hidden|cave|grotto|acid|cach)/i, ['Behind the waterfall, they say. And somewhere, a pond you should not drink from.', 'A cove nobody finds by walking. That is all I will say.']],
      [/\b(drink|juice|cocktail|boire)\b/i, ['Orange, mango, a drop of pond. Family recipe.']],
      [/\b(joke|funny|blague)\b/i, ['Why do alligators never win at hide and seek? Because we are always "spotted". No? Fine.']],
      [/\b(bye|goodbye|see you|ciao|au revoir|salut à)\b/i, ['Off you go. The chair will keep me company.', 'Later, alligator. Yes, I am allowed to say it.']],
      [/\?$/, ['Good question. I will think about it for a few hours.', 'Hmm. Ask the heron, he pretends to know everything.']],
    ],
    idle: ['Mmh.', 'Is that so.', 'Tell me more. Slowly. I am in no hurry.', 'The pond agrees with you.', 'Fascinating. Pass me that cushion?'],
  },
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class Npc {
  constructor(id) {
    this.id = id;
    this.persona = PERSONAS[id] || PERSONAS.alligator;
    this.name = this.persona.name;
    this.history = []; // { role: 'user' | 'assistant', content }
    this.remote = true; // until the server says it has nothing to offer
  }

  greeting() { return pick(this.persona.greet); }

  _canned(text) {
    for (const [test, lines] of this.persona.rules) if (test.test(text)) return pick(lines);
    return pick(this.persona.idle);
  }

  /** What the character answers to `text` (never throws). */
  async reply(text) {
    this.history.push({ role: 'user', content: text });
    let answer = null;
    if (this.remote) {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/npc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ npc: this.id, messages: this.history.slice(-10) }) });
        const body = res.ok ? await res.json() : null;
        if (body && typeof body.reply === 'string' && body.reply.trim()) answer = body.reply.trim().slice(0, 400);
        else this.remote = res.status !== 404 && res.status !== 501 && res.status !== 405 ? this.remote : false; // no brain there: stop asking
      } catch { /* offline: the lines below */ }
    }
    if (!answer) answer = this._canned(text);
    this.history.push({ role: 'assistant', content: answer });
    if (this.history.length > 24) this.history.splice(0, this.history.length - 24);
    return answer;
  }
}

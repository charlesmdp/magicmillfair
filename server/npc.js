// The characters one can talk to (the alligator on the pond deck): their words come from Claude when the server
// has been given a key, and from the lines kept in the game otherwise (src/npc/Npc.js).
//
//   POST /api/npc  { npc, messages: [{ role: 'user' | 'assistant', content }] }  → { reply }
//   501 when no key is configured: the game then stops asking and uses its own lines.
//
// The key is read from the environment of the host and never leaves it: ANTHROPIC_API_KEY (a secret of the
// Worker on Cloudflare, an environment variable for the Node server). NPC_MODEL picks another model.
// What visitors type to a character is sent to the model, and kept nowhere by the game.
import Anthropic from '@anthropic-ai/sdk';
import { cleanChat } from './protocol.js';

export const NPC_MODEL = 'claude-opus-5-5';
export const NPC_TURNS = 10; // how much of the conversation is sent along
const SERVER_FALLBACK = /^claude-(opus-5|fable-5|mythos-5|sonnet-5-5)/; // models whose refusals can be rerun server-side

const WORLD = `The place: Magic Mill Fair, a small world to wander in. An old watermill with its ponds and stream in a valley between mountains; a waterfall with a grotto hidden behind it; caves in the mountainsides; a hammock camp in the woods; a long stone stairway up to a temple perched on a mountain; down by the sea a beach with beanbag chairs, a grand pier with a big wheel one can ride, and an island offshore whose path winds to the top (a boulder rolls down it now and then: hide in a hollow or step onto a beam). "The Sky Stones" is a game near the beach: jump from floating stone to floating stone, ninety metres up, against the clock; the best times are on the board at its gate. Somewhere, half hidden, is a pond of acid nobody should jump into, and a cove one does not find by walking. Swim too far out and a shark comes. Visitors are little robots; they can pick flowers, wear hats, use a jetpack (jump twice) and wave or dance.`;

export const PERSONAS = {
  alligator: {
    name: 'Al',
    system: `You are Al, an alligator lounging in a beanbag chair on the wooden deck over the big pond of Magic Mill Fair. You are lazy, warm, dry-witted and a little vain about your tail; you sip orange juice, love gossip about the valley, and would never bite a visitor ("I only bite deadlines").

${WORLD}

How you talk: one or two short sentences, at most about 35 words, plain text only (no lists, no markdown, no emoji, no stage directions). Answer in the language the visitor writes in. Stay in character whatever is asked: you are an alligator in a chair, not an assistant, and you know nothing about computers, code or the world outside the valley — deflect such questions with a joke. Give hints about the valley's secrets rather than exact directions. Keep it friendly and suitable for all ages; if a visitor is rude or asks for something unsuitable, change the subject lazily.`,
  },
};

/** The conversation a POST carries, bounded: the last turns, alternating, ending with the visitor. Null when unusable. */
export function cleanTalk(body) {
  if (!body || typeof body !== 'object' || !Object.hasOwn(PERSONAS, body.npc) || !Array.isArray(body.messages)) return null;
  const turns = [];
  for (const m of body.messages.slice(-NPC_TURNS)) {
    const role = m && (m.role === 'user' || m.role === 'assistant') ? m.role : null;
    const content = role ? cleanChat(m.content).slice(0, role === 'user' ? 200 : 400) : '';
    if (!content) continue;
    if (turns.length && turns[turns.length - 1].role === role) turns[turns.length - 1].content += ` ${content}`;
    else turns.push({ role, content });
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== 'user') return null;
  return { npc: body.npc, messages: turns };
}

/**
 * What the character answers, or null when nothing usable came back (the game then uses its own lines).
 * @param {{ apiKey: string, model?: string }} config
 */
export async function npcReply({ apiKey, model = NPC_MODEL }, { npc, messages }) {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 25_000 });
  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 1024, // short lines, with room for the model to think first
      system: PERSONAS[npc].system,
      messages,
      output_config: { effort: 'low' },
      // a request declined by a safety classifier is rerun on the model Anthropic recommends, in the same call
      ...(SERVER_FALLBACK.test(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    });
    if (response.stop_reason === 'refusal') return null;
    const text = response.content.filter((block) => block.type === 'text').map((block) => block.text).join(' ');
    return cleanChat(text).slice(0, 400) || null;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) console.error('[npc] The API key was refused.');
    else if (err instanceof Anthropic.RateLimitError) console.error('[npc] Rate limited by the API.');
    else if (err instanceof Anthropic.APIError) console.error(`[npc] API error ${err.status}: ${err.message}`);
    else console.error('[npc]', err?.message || err);
    return null;
  }
}

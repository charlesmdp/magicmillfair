// The small print of the fair, in plain words: the terms of use and the privacy policy that the settings open
// (ui/LegalView.js). Keep them true: when the game starts to use something new — a service, a script, a
// thing it remembers — say so here, and change the date.
//
// WHO: the two lines below are for whoever runs the game to fill in (a name — a person or a company — and an
// address people can write to). Left empty, the pages say how to reach the maker without them.
export const LEGAL = {
  updated: '24 November 2026',
  operator: '', // e.g. 'Atomic Oasis is run by …'
  contact: '', // e.g. 'hello@your-domain'
};

const reach = () => (LEGAL.contact ? `write to ${LEGAL.contact}` : 'ask in the chat for an administrator (their name carries a badge), or write to the address given by whoever sent you here');

/** Each: { title, lead, short: [the short version], sections: [{ icon, title, text: [a paragraph | [a list]] }] } */
export const TERMS = () => ({
  title: 'Terms of use',
  lead: 'The rules of the fair. There are hardly any, but here they are.',
  short: ['Wander, play, talk: it is free, and nobody needs an account.', 'Be kind. Whoever spoils the fair for the others is shown the door.', 'What you buy is a digital extra for this game — nothing else, nowhere else.'],
  sections: [
    { icon: '🎡', title: 'What this is', text: [
      `Atomic Oasis is a small world to walk about in with other people, in a web browser. ${LEGAL.operator || 'It is made and run by an independent maker — one person, not a company with a legal department.'} By playing you agree to these terms; if you do not, simply close the page.`,
      'You must be old enough to use online services on your own in your country (13 in many places, 15 or 16 in others) — or have the say-so of a parent or guardian, who then agrees to these terms for you. Buying anything needs an adult.',
    ] },
    { icon: '🤝', title: 'Behave like a guest', text: [
      'Other visitors are real people. In the chat, with your name, with what you put on a panel or a plaque:',
      ['no harassment, hate, threats or sexual content;', 'nothing illegal, no spam, no advertising outside the places sold for it;', 'no cheating at the games, no tampering with the game or its servers, no pretending to be somebody else.'],
      'Administrators can remove a line from a board, put somebody out of a room, or keep them out — for an hour, a day or for good — when they judge it necessary. The chat is not filtered and not recorded: say hello before you say anything else.',
    ] },
    { icon: '🛍️', title: 'The shop', text: [
      'Everything can be visited for free. The shop sells extras: hats, paints, trails, jetpacks, fireworks, the Game Pass, places for sponsors, plaques. They are digital items that exist in this game only; they cannot be exchanged, resold or turned back into money.',
      'Payments are made on Stripe: the game never sees your card. Prices are in US dollars; your bank may add its own fees. An item is yours as soon as the payment is confirmed — it is delivered at once, at your request, which in many countries means the usual right to change your mind within 14 days no longer applies once it is delivered. If something went wrong — paid and nothing arrived, bought by mistake — ' + reach() + ': a fair request gets a refund.',
      'The Game Pass is paid by the month until you stop it (from the shop: "Look after it, or stop it"); it then lasts to the end of the month already paid. What it lends — hats, sizes, colours — goes back when it ends; what you bought separately stays.',
    ] },
    { icon: '📣', title: 'Sponsors and plaques', text: [
      'The panel of a game goes to the highest bid, paid once; whoever is outbid is refunded in full, automatically. Other places (a gondola, a backdrop, a village) are by the month.',
      'A plaque for a companion is paid once and stays for as long as the game exists. What a sponsor sends — words, a picture, a link — is shown at once; a plaque is engraved once an administrator has looked at it. Either can be taken down at any time if it breaks these terms — with or without a refund, as the administrator judges; a place paid by the month then stops being charged. Send only what you have the right to show.',
    ] },
    { icon: '🧾', title: 'Accounts', text: [
      'An account is optional: a name and a password that keep what is yours on every device. Choose a password you use nowhere else, and keep the recovery code that is shown once — passwords are never stored in a readable form, so nobody can read yours back to you.',
    ] },
    { icon: '🌦️', title: 'No promises about the weather', text: [
      'The game is offered as it is. It may change, break, lose a score, be unavailable for a while or, one day, close. It is made with care, but without any guarantee that it will always work or that it suits a particular purpose; to the extent the law allows, its maker is not liable for losses that follow from using it. Nothing here takes away rights that the consumer law of your country gives you and that cannot be waived.',
    ] },
    { icon: '✏️', title: 'Changes, and who to talk to', text: [
      'These terms may be updated as the game grows; the date below says when they last were. Carrying on playing after a change means accepting it.',
      `A question, a complaint, a request? You can ${reach()}.`,
    ] },
  ],
});

export const PRIVACY = () => ({
  title: 'Privacy',
  lead: 'What the fair knows about you, why, and for how long. No advertising, no selling of data, no tracking across other sites by the game itself.',
  short: ['You can play without giving your name, an e-mail or anything else.', 'Your browser gives itself a random name; that is how the game knows what is yours.', 'A few outside services are used. They are all listed below.'],
  sections: [
    { icon: '🗂️', title: 'What stays in your browser', text: [
      'The game keeps a few things in the storage of your browser (not cookies): a random identifier it made up for this browser, the name and the look of your robot, your settings, whether you have heard the opening story — and, for an administrator, their key. Clearing the data of the site in your browser removes all of it.',
    ] },
    { icon: '📡', title: 'What the server sees while you play', text: [
      ['Where your robot is, what it looks like, what it does, what you say in the chat: passed on to the visitors of your room so that they can see you. Chat lines are not stored.', 'Your IP address, your browser and system, the random identifier of your browser and, roughly, where you connect from (country, region, town — told by the host, Cloudflare): shown to the administrators while you are connected, so that they can keep the place safe.'],
    ] },
    { icon: '💾', title: 'What is kept', text: [
      ['Scores: the name you chose and your score, on the public boards of the games.', 'Visits: counts by day and by country for 90 days, and the last 300 visits (time, name, country and town, the first characters of the browser identifier) — to know whether anybody comes.', 'Days in a row: one counter per browser, for the animals of light.', 'Purchases: what your browser or your account owns; for the Game Pass and the bids, the references Stripe gives (never a card number).', 'Accounts, if you make one: its name, a salted hash of the password and of the recovery code, the browsers signed in, the look of your robot — and an e-mail address only if you gave one, used for nothing but sending you a code when you forget the password.', 'Sponsors and plaques: the words, the link and the picture you sent.', 'Bans: the address, the browser identifier and the name of somebody who was kept out, until the ban is lifted.'],
      'All of this is stored with the host of the game (Cloudflare). It is kept for as long as the game needs it — a score while its board exists, an account until you ask for it to be deleted.',
    ] },
    { icon: '🧩', title: 'The outside services', text: [
      ['Cloudflare — hosts the site, runs the server of the game and its storage, and (where e-mails are switched on) sends them. It sees every request, as any host does.', 'Stripe — takes the payments, on its own form. It receives what you type there and applies its own privacy policy.', 'Anthropic — when you talk to Billy the alligator, the one line you said is sent to its Claude API to write his answer. Nothing else goes with it, and the game does not keep the conversation.', 'Ship or Die (ship-or-die.com) — a small script from the hackathon the game takes part in, loaded with the page to count its visits. Like any script fetched from another site, it lets that site see your IP address, your browser and the address of the page.'],
      'There are no advertising networks and no social-network buttons.',
    ] },
    { icon: '⚖️', title: 'Why the game is allowed to', text: [
      'To make the game work at all (showing you to the others, keeping what you bought: the performance of a contract with you), to keep it safe and to know roughly how many people visit (a legitimate interest), and to meet legal duties about payments. Nothing is used to build a profile of you or to make automated decisions about you.',
    ] },
    { icon: '🙋', title: 'Your rights', text: [
      `You can ask what is held about you, have it corrected or deleted, or object to its use — ${reach()}. Give the name of your account, or the identifier of your browser (it is written at the bottom of this page), so that the right records can be found. If you live in the European Union or the United Kingdom you can also complain to your data-protection authority.`,
      'Some of the services above are based in the United States; data sent to them leaves your country under the safeguards those companies provide.',
    ] },
    { icon: '🧒', title: 'Children', text: [
      'The game is not aimed at young children and does not knowingly keep personal data about them. A parent who believes their child gave some can ask for it to be removed.',
    ] },
  ],
});

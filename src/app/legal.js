// The small print of the fair, in plain words: the terms of use, the privacy policy and the legal notice that the
// settings open (ui/LegalView.js). Keep them true: when the game starts to use something new — a service, a
// script, a thing it remembers — say so here, and change the date.
//
// WHO: the lines below say who makes and runs the game (a company, its registration number, its address) and
// the mailbox people can write to. Left empty, the pages say how to reach the maker without them.
export const LEGAL = {
  updated: '26 November 2026',
  maker: 'MY BIG LEO',
  operator: 'It is made and run by MY BIG LEO, a SASU (a French simplified joint-stock company with a single shareholder) with a share capital of €36,000, registered in Paris (RCS Paris 880 338 827), 14 rue Charles V, 75004 Paris, France.',
  contact: 'atomicoasisgame@gmail.com',
};

// The legal notice (in France, the "mentions légales" of a company's site: law no. 2004-575, art. 1-1): who
// publishes the site and who hosts it. A line left empty is not shown. Still to be given by the owner (see
// README, "The small print"): a telephone number, the director of publication, the consumer mediator.
export const NOTICE = {
  company: 'MY BIG LEO',
  form: 'SASU (société par actions simplifiée unipersonnelle) with a share capital of €36,000',
  address: '14 rue Charles V, 75004 Paris, France (domiciled with ABC LIV)',
  registration: 'RCS Paris 880 338 827 — SIREN 880 338 827, SIRET 880 338 827 00012',
  vat: 'FR15880338827', // (its intra-community VAT number)
  phone: '',
  director: '', // (the director of publication: the company's legal representative)
  host: { name: 'Cloudflare, Inc.', address: '101 Townsend Street, San Francisco, CA 94107, United States', phone: '+1 888 993 5273' },
  mediator: '', // (the consumer mediator the company has joined: its name and its site)
};

const reach = () => (LEGAL.contact ? `write to ${LEGAL.contact}` : 'ask in the chat for an administrator (their name carries a badge), or write to the address given by whoever sent you here');

/** The legal notice, as LegalView shows it (same shape as the two others). */
export const LEGAL_NOTICE = () => {
  const N = NOTICE;
  return {
    title: 'Legal notice',
    lead: 'Who publishes this site, who hosts it, and how to reach them.',
    short: [`Atomic Oasis is published by ${N.company}${N.address ? `, ${N.address}` : ''}.`, `It is hosted by ${N.host.name}${/\.$/.test(N.host.name) ? '' : '.'}`, LEGAL.contact ? `To reach the publisher: ${LEGAL.contact}.` : 'To reach the publisher: ask in the chat for an administrator.'],
    sections: [
      { icon: '🏢', title: 'The publisher', text: [[`${N.company}${N.form ? `, ${N.form}` : ''}`, N.address ? `Registered office: ${N.address}` : '', N.registration, N.vat ? `VAT number: ${N.vat}` : '', N.phone ? `Telephone: ${N.phone}` : '', LEGAL.contact ? `E-mail: ${LEGAL.contact}` : ''].filter(Boolean)] },
      ...(N.director ? [{ icon: '🖋️', title: 'Director of publication', text: [N.director] }] : []),
      { icon: '🖥️', title: 'The host', text: [[N.host.name, N.host.address, `Telephone: ${N.host.phone}`]] },
      ...(N.mediator ? [{ icon: '🤝', title: 'If something goes wrong with a purchase', text: [`Write to us first (${LEGAL.contact}). If we cannot settle it between us, you may turn, free of charge, to the consumer mediator: ${N.mediator}.`] }] : []),
    ],
  };
};

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
      'Administrators can remove a line from a board, put somebody out of a room, or keep them out — for an hour, a day or for good — when they judge it necessary. The chat is not filtered. What is said in it is kept for fourteen days, for the administrators to read and act on abuse (see Privacy): say hello before you say anything else.',
    ] },
    { icon: '🛍️', title: 'The shop', text: [
      'Everything can be visited for free. The shop sells extras: hats, paints, trails, jetpacks, fireworks, the Game Pass, places for sponsors, plaques. They are digital items that exist in this game only; they cannot be exchanged, resold or turned back into money.',
      'Payments are made on Stripe: the game never sees your card. Prices are in US dollars; your bank may add its own fees. An item is yours as soon as the payment is confirmed — it is delivered at once, at your request, which in many countries means the usual right to change your mind within 14 days no longer applies once it is delivered. If something went wrong — paid and nothing arrived, bought by mistake — ' + reach() + ': a fair request gets a refund.',
      'A room of your own, where that is sold, is paid by the month until you stop it. When it is no longer paid for it falls asleep — nobody can enter it — and is kept for thirty days; after that it is freed, with its name and its boards of scores.',
      'The Game Pass is paid by the month until you stop it (from the shop: "Look after it, or stop it"); it then lasts to the end of the month already paid. What it lends — hats, sizes, colours — goes back when it ends; what you bought separately stays.',
    ] },
    { icon: '📣', title: 'Sponsors and plaques', text: [
      'The panel of a game goes to the highest bid, paid once; whoever is outbid is refunded in full, automatically. Other places (a gondola, a beach hut, a backdrop, a village) are by the month — a gondola or a beach hut can also be bought once, for good.',
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
    ...(LEGAL.operator ? [{ icon: '🏠', title: 'Who is behind the game', text: [
      `Atomic Oasis — ${LEGAL.operator.replace(/^It is /, 'it is ')} It is that company which decides what the game keeps and why, and which answers for it. To reach it: ${reach()}.`,
    ] }] : []),
    { icon: '🗂️', title: 'What stays in your browser', text: [
      'The game keeps a few things in the storage of your browser (not cookies): a random identifier it made up for this browser, the name and the look of your robot, your settings, whether you have heard the opening story — and, for an administrator, their key. Clearing the data of the site in your browser removes all of it.',
    ] },
    { icon: '📡', title: 'What the server sees while you play', text: [
      ['Where your robot is, what it looks like, what it does, what you say in the chat: passed on to the visitors of your room so that they can see you.', 'What you say in the chat is also kept for the administrators to read: the line, the name over your robot, the room and the time — the last 5,000 lines at the most, for 14 days at the most, then deleted. With each line the server also keeps, apart, the IP address and the random identifier of the browser that said it: they are never shown, not even to the administrators, and serve only if an administrator decides to put the author of that line out, or to keep them out; they are deleted with the line — or, when its author is kept out, kept with that ban, still unseen, until it is lifted. What you say to Billy the AI is not chat: it is not there.', 'Your IP address, your browser and system, the random identifier of your browser and, roughly, where you connect from (country, region, town — told by the host, Cloudflare): shown to the administrators while you are connected, so that they can keep the place safe.'],
    ] },
    { icon: '💾', title: 'What is kept', text: [
      ['Scores: your score on the public boards of the games — under the name of your account when you have one, under the name you chose (and for the day only) when you have not. With a score at a booth, in the flying theatre or at the arcade, the page sends what you did in the game — where the pointer went, when you clicked or pressed a key — so that the server can play a great score again before it believes it; that is read once and not kept.', 'Visits: counts by day and by country for 90 days, and the last 300 visits (time, name, country and town, the first characters of the browser identifier) — to know whether anybody comes.', 'Days in a row: one counter per browser, for the animals of light.', 'Purchases: what your browser or your account owns; for the Game Pass and the bids, the references Stripe gives (never a card number). When you take the Game Pass without an account that has an address, the word of thanks goes to the address you gave Stripe at the payment: the game uses it for that one message and does not keep it.', 'Accounts, if you make one: its name, a salted hash of the password and of the recovery code, the browsers signed in, the look of your robot — and an e-mail address only if you gave one, used only to write to you about that account: a welcome when you make it, a word of thanks if you take the Game Pass, and a code when you forget the password. No newsletter, and nothing in those messages counts whether you opened them.', 'Sponsors and plaques: the words, the link and the picture you sent. What a sponsor pays is public: it is written next to their name on the wall of thanks.', 'A room of your own, if you have one: its name, the account that pays for it, a salted hash of its password (never the password), and the scores made in it.', 'Bans: the address, the browser identifier, the account and the name of somebody who was kept out — or kept out in silence, which they are not told — until the ban is lifted.'],
      'All of this is stored with the host of the game (Cloudflare). It is kept for as long as the game needs it — a score while its board exists, an account until you ask for it to be deleted.',
    ] },
    { icon: '🧩', title: 'The outside services', text: [
      ['Cloudflare — hosts the site, runs the server of the game and its storage, and (where e-mails are switched on) sends them. It sees every request, as any host does.', 'Stripe — takes the payments, on its own form. It receives what you type there and applies its own privacy policy.', 'Anthropic — when you talk to Billy the AI (the alligator), the line you said is sent to its Claude API to write his answer — with the few lines of your own conversation with him just before it (the last three exchanges, which your browser keeps for ten minutes at the most), so that he can follow. Nothing else goes with it, nobody else\'s words ever do, and the game\'s server does not keep the conversation.', 'Ship or Die (ship-or-die.com) — a small script from the hackathon the game takes part in, loaded with the page to count its visits. Like any script fetched from another site, it lets that site see your IP address, your browser and the address of the page.'],
      'There are no advertising networks and no social-network buttons.',
    ] },
    { icon: '⚖️', title: 'Why the game is allowed to', text: [
      'To make the game work at all (showing you to the others, keeping what you bought: the performance of a contract with you), to keep it safe and to know roughly how many people visit (a legitimate interest), and to meet legal duties about payments. Nothing is used to build a profile of you. One thing is decided by a program: a great score is played again by the server before it goes on a board, and one that does not come out of its game waits until a person has looked at it.',
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

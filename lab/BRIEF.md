# Brief pour la session principale

Ce message vient du propriétaire du jeu. Il a été préparé avec l'autre session Claude (« le labo »), qui
construit des nouveautés sur la branche `claude/optimistic-ritchie-xi2mys` sans jamais modifier tes fichiers.

Il contient deux choses : **(A)** ce que le labo a livré et comment l'intégrer, **(B)** des chantiers nouveaux
(mises à jour, page admin, salles, rooms privées, sky villages, anti-triche).

Lis-le en entier avant de commencer. Ensuite : propose-moi un ordre de livraison, pose-moi toutes tes questions
en une fois, puis avance. Je ne suis pas développeur : explique tes choix en mots simples, et dis-moi
franchement ce qui est vérifié et ce qui ne l'est pas.

Déjà demandé par ailleurs, donc pas répété ici : le plein écran, les visiteurs en double, la boutique plus
compacte, la fenêtre « Who is here ».

---

## A. Le labo : ce qui existe, et comment cohabiter

### A1. État des lieux

- La branche du labo est **à jour avec la tienne** (elle contient ton commit `b4ebe31`). La fusion a été
  faite et vérifiée : aucun conflit, et sur le résultat `node tools/slide-test.mjs` (69 contrôles),
  `node tools/oak-test.mjs` (25) et `node tools/extras-test.mjs` (15) passent, ainsi que la compilation du jeu.
  Tu peux donc fusionner `origin/claude/optimistic-ritchie-xi2mys` directement.
- Lis `lab/INTEGRATION.md` : il décrit chaque nouveauté en détail. Ce brief ne le répète pas.
- Tout ce que le labo a ajouté est dans des **fichiers nouveaux**. Rien de ce qui existait n'a été modifié.

### A2. Qui touche à quoi (pour qu'il n'y ait jamais de conflit)

Le labo continue de travailler (retouches du toboggan, refonte du chêne). Pour que je puisse te demander de
re-fusionner sa branche à tout moment sans casse :

- **Au labo, tu n'y touches pas** : `src/extras/**`, `src/world/zones/games/slide/**`,
  `src/world/zones/games/oak/**`, `server/stats.js`, `public/opendata/**`, `public/opendate/**`, `lab/**`,
  `tools/slide-test.mjs`, `tools/oak-test.mjs`, `tools/oak-course.mjs`, `tools/extras-test.mjs`.
  Si un changement y est nécessaire, dis-le-moi : je le transmets au labo.
- **Tout le reste est à toi** ; le labo n'y touche pas.

### A3. Ce dont les nouveautés dépendent chez toi

Les nouveautés se branchent sur le jeu en marche à travers l'objet `app` (celui que tu ranges aujourd'hui dans
`window.__mmf`). Si tu modifies l'un des points ci-dessous, relance les trois tests du labo ; s'ils cassent,
dis-le-moi plutôt que de corriger dans ses fichiers.

- `app` : `engine`, `world`, `player`, `hud`, `input`, `rig`, `fair` (`fov`, `session`), `presence`, `audio.play`,
  `who`, `setMode`, `setCam`, `refreshShop`, `ready`, `frames`.
- `world` : `zones` (objets `{ update(dt, time, camera) }`), `actionSources`, `collision` (`addPlatform`,
  `addCircle`, `circles`, `bulky`, `platforms`, `caves`, `caveAt`), `forest` (ses tableaux `matrices`, `info`,
  `grid`, `all`, `species[…]`, `_mkLeaf`, `a2c`), `data.heightAt`, `materials`, `scene`, `bakeShadows`, `ripples`.
- `player` : `pos`, `vel`, `grounded`, `cave`, `canFly`, `driver`, `teleport`, `update`, `riding`, `cheat`,
  `gravity`, `boost`, `jet`, `dead`.
- `hud` : `note`, `setRun`, `addChat`, `_channel`, `chatChannel`, `chanBtn`, `chatInput`, `panel` (les réglages :
  le labo y insère une ligne avant le titre « Your robot »), `_robot`, `setAdmin`, `setFreeCamera`.
- `presence` : `_emit`, `on('blast')`, `color`.
- Modules : `Parts`/`MeshBuilder`, `distanceCuller`, `canvasBoard`, `makeMaterial` et ses blocs GLSL, `LAYER`,
  `course.js` (`reach`, `formatTime`), `TreeBuilder` (l'espèce `elder` et la formule de graine
  `1337 + si * 101 + v * 17`), `layout.js` (`ZONES`, la ligne `elder` de `HERO_TREES`), et côté serveur les
  exports de `visitors.js`, `api.js`, `token.js`, `scores.js` qu'utilise `lab/worker.js`.

### A4. À intégrer tout de suite (petit et sans risque)

1. **Fusionner** la branche du labo.
2. **Les interrupteurs.** Chaque nouveauté est un « extra » (`src/extras/index.js`) qu'on allume ou non :
   `slide`, `oak`, `caves`, `stats`. Une ligne suffit, une fois le jeu lancé :
   `import('./extras/index.js').then(({ loadExtras }) => loadExtras(app, { … }))`. Passe-lui `app` directement
   (pas `window.__mmf`, voir B6.4). Les valeurs doivent venir du système de « releases » de la partie B1, pour
   que j'allume chaque jeu quand je veux, sans nouvelle livraison. Valeurs de départ :
   **`caves: true`, `stats: true`, `slide: false`, `oak: false`**.
3. **Grottes = lieux sûrs** (`caves`) : dans une grotte le chat passe sur « Nearby » et y reste, un message le
   dit à l'entrée, et ce qui est dit à proximité ne traverse pas la roche (quelqu'un sur les marches au-dessus
   de la grotte de la cascade ne le voit pas). Aujourd'hui ce filtre est fait par chaque navigateur. Si tu
   veux le durcir : que chaque joueur envoie dans son état le numéro de la grotte où il est, et que
   `Room.around()` (`server/protocol.js`) ne livre un message « nearby » qu'entre joueurs de la même grotte.
4. **La page des chiffres** (`stats`) — il reste trois branchements côté serveur, chez toi :
   - `server/routes.js`, dans `route()` : `const stats = await statsRoute(req, ctx); if (stats) return stats;`
     (`import { statsRoute } from './stats.js'`). `lab/worker.js` montre le même branchement pour un Worker.
   - Là où un paiement est accordé (boutique, Game Pass, panneaux, plaques, gondoles) :
     `await noteSale(ctx.store, { cents, pass })` ; et pour un remboursement `await noteRefund(ctx.store, { cents, pass })`.
     Sans cela « argent généré » et « Game Pass vendus » restent à zéro.
   - Si tu sais combien de joueurs sont connectés (voir B4), fournis `ctx.here = async () => nombre` : la page
     affichera le chiffre exact au lieu d'une estimation.
   La page elle-même est `public/opendata/index.html` (adresse `/opendata` ; `/opendate` y renvoie) et la ligne
   « The game in figures » s'ajoute toute seule dans la roue crantée. Le comptage démarre à l'activation : dans
   la page admin (B2), prévois de quoi saisir les valeurs de départ (`POST /api/stats/set`, clé du propriétaire :
   `{ money, passes, people }`).
5. **L'icône** : copie les quatre fichiers de `lab/favicon/` sur ceux de `public/` (`favicon.svg`,
   `favicon-32.png`, `icon-192.png`, `apple-touch-icon.png`). Vérifie que `tools/make-icons.mjs` ne ramène pas
   l'ancienne à la prochaine régénération.
6. **Le tableau des scores du toboggan** : dans `BOARDS` (`server/scores.js`)
   `slide: { order: 'asc', min: 39_000, max: 3600_000 }`, son nom dans `server/catalog.js`, et dans `main.js`
   `app.slideDone = (ms) => scoreGame('slide', …)` (l'extra l'appelle à la fin d'une descente). Son panneau :
   voir `lab/INTEGRATION.md`.
7. **Le toboggan reste éteint** tant que je ne dis rien : il me reste des choses à y changer, au labo.
8. **Le grand chêne reste éteint** : il n'est pas livrable en l'état, le labo le refait. Ne l'intègre pas plus
   loin que son interrupteur.

---

## B. Les nouveaux chantiers

### B1. Mises à jour : livrer quand je veux, sans laisser personne sur une vieille version

Dans les jours qui viennent je veux sortir, l'une après l'autre : les sky villages, le toboggan, le chêne, etc.
Je veux décider **du moment** depuis une page admin, et que les joueurs connectés suivent sans rien faire.

Deux mécanismes, complémentaires :

1. **Les « releases » : des interrupteurs gardés par le serveur.** Le code est livré éteint ; je l'allume
   depuis la page admin et tout le monde le voit en quelques secondes, sans nouvelle livraison.
   - Un seul objet, gardé dans le carnet (une clé `release`), avec ses valeurs par défaut dans
     `src/app/config.js` : par exemple
     `{ slide: false, oak: false, caves: true, stats: true, sky: 'hidden', userRooms: false }`.
     Tout futur interrupteur va là.
   - Il est servi à tout le monde (dans `/api/status` ou une route à lui) et **poussé aux joueurs connectés**
     quand il change (un message du relais à toutes les rooms), avec une relecture de secours toutes les
     quelques minutes.
   - Côté joueur : un extra qui s'allume se charge à chaud (`loadExtras` le fait ; le toboggan et le chêne
     redessinent les ombres fixes, un à-coup d'une fraction de seconde). Ce qui s'éteint, ou ce qui ne peut pas
     se faire à chaud, passe par le rafraîchissement ci-dessous.
2. **Les nouvelles versions du code.** Chaque version a déjà un identifiant (`__BUILD__.commit`).
   - Le serveur doit connaître la version en ligne et la dire aux joueurs (à la connexion au relais, et dans
     la relecture périodique).
   - Si elle diffère de celle du navigateur : un bandeau « A new version of the fair is ready », un compte à
     rebours et un bouton « Refresh now » ; puis rechargement automatique **à un moment sûr** — jamais pendant
     un jeu de stand, une course, une montée chronométrée, un paiement ou une phrase en cours de frappe.
   - Après rechargement le joueur revient au même endroit et dans la même room (tu as déjà un rechargement
     « au même endroit » pour le changement de qualité : réutilise-le).
   - Vérifie que `index.html` n'est jamais gardé en cache (les fichiers à empreinte, eux, peuvent l'être).
   - Une livraison coupe les connexions au relais (Cloudflare redémarre les Durable Objects) : la reconnexion
     doit déboucher sur ce contrôle de version, pas sur un joueur muet.
   - Depuis la page admin : un bouton « tout le monde se rafraîchit » et une annonce à toutes les rooms.
   - Après une mise à jour, un petit « What's new » une seule fois, à partir de `src/app/news.js`.

Attention à la compatibilité : pendant une livraison, de vieux navigateurs sont encore connectés. Un
changement du protocole doit rester lisible par eux, ou attendre qu'ils aient rechargé.

### B2. Une page admin

Une page `/admin` (hors du jeu), ouverte avec ma clé de propriétaire (celle de `/admin <clé>` ; envoyée en
`Authorization: Bearer`, jamais dans l'adresse). Les administrateurs que j'ai nommés peuvent en voir une partie
(scores, panneaux, exclusions) ; les releases sont pour moi seul. Sections :

- **Releases** : chaque interrupteur de B1 (dont les sky villages : caché / bientôt / ouvert) ; la version en
  ligne et combien de joueurs connectés sont encore sur l'ancienne ; « tout le monde se rafraîchit » ; annonce.
- **High scores** : par tableau et par période, **refuser une ligne** (tu as déjà
  `DELETE /api/scores?board=&name=`) ; voir les scores signalés par l'anti-triche (B6) ; exclure quelqu'un des
  tableaux.
- **Sponsors** : **acceptés par défaut**. Aujourd'hui rien ne s'affiche avant mon accord ; je veux l'inverse
  pour les sponsors : ce qui est payé s'affiche tout de suite, et je peux **refuser après coup** (le panneau
  est retiré ; dis-moi comment tu traites le remboursement).
- **Plaques des compagnons** (chiens, chats… autour du chien doré) : là c'est le contraire, **elles attendent
  mon accord** avant de s'afficher (comme aujourd'hui) : liste des plaques en attente, avec leur image, et
  accepter / refuser.
- **Rooms** : la liste des rooms et leur nombre de présents (B4) ; plus tard les rooms des joueurs (B5).
- **Exclusions** : la liste, en ajouter (normale ou silencieuse, B6), en retirer.
- **Chiffres** : lien vers `/opendata` et saisie des valeurs de départ (A4.4).

### B3. Sky villages : caché, puis « bientôt », puis ouvert

Je veux sortir les sky villages en trois temps, depuis la page admin. Un interrupteur `sky` à trois valeurs
(il remplace `FEATURES.skyGate`) :

- `hidden` : **rien** — ni le portail, ni les villages sur les montagnes, ni leur nom sur la carte, ni une
  allusion dans les nouvelles ou chez les personnages.
- `soon` : le portail est là, fermé, avec « Soon, the sky will open » (ou mieux, propose). On ne voyage pas.
  Dis-moi si les villages se voient d'en bas à ce stade ; par défaut : non.
- `open` : tout, comme prévu.

Garde `?sky=1` pour moi seul (administrateur), pour voir avant tout le monde.

### B4. Les salles communes : 200 au plus, des arrivants bien répartis, et pouvoir changer

Aujourd'hui une room accepte 250 personnes et c'est le navigateur qui, quand elle est pleine, essaie
« room-2 », « room-3 »… Résultat : une room bondée et une room presque vide. Je veux :

- **200 personnes au plus** par room (jamais dépassé, même par un lien d'invitation ; moi, je rentre toujours).
- **Une affectation faite par le serveur**, qui connaît le nombre de présents de chaque room.
- **Une logique qui évite qu'on se sente seul.** Ma demande de départ : à partir d'environ 50 personnes dans
  une room, ouvrir la suivante et partager les arrivants. Proposition du labo, à toi de l'améliorer :
  1. une nouvelle room commune s'ouvre quand toutes les rooms ouvertes ont au moins ~50 présents ;
  2. tant qu'une room a moins de ~20 présents (elle « démarre »), **tous** les arrivants y vont : elle se
     remplit vite, personne n'y reste seul longtemps ;
  3. ensuite les arrivants sont **partagés** entre les rooms non pleines, en favorisant la moins remplie, pour
     que toutes restent vivantes ;
  4. une room qui se vide (moins de ~8 présents alors qu'une autre a de la place) ne reçoit plus d'arrivants,
     et on propose à ses occupants de rejoindre l'autre — jamais de déplacement forcé ;
  5. quelqu'un qui revient (reconnexion, rafraîchissement, mise à jour) retrouve sa room si elle a de la place.
  Les seuils sont des réglages, pas des constantes enfouies. Donne-moi une **simulation** (arrivées et départs
  sur une journée) qui montre la taille des rooms dans le temps, pour que je juge la logique.
- **Changer de room** quand il y en a plusieurs : la liste (nom, nombre de présents) dans le jeu, un clic, et
  la présence se reconnecte sans recharger la page ; le joueur garde sa place dans le monde.
- **Rejoindre un ami** : un lien vers sa room y mène si elle n'est pas pleine ; sinon on le dit et on propose
  une autre room.
- Dis clairement ce qui est **par room** (le chat, qui on voit, le bouton rouge) et ce qui est **commun à
  toutes** (les high scores, mes annonces, les releases).
- **À trancher avec moi** : aujourd'hui n'importe qui crée une room gratuite en écrivant `?room=nimporte` dans
  l'adresse. Si les rooms privées deviennent payantes (B5), il faut fermer cette porte en production (en
  gardant de quoi faire tes tests).

### B5. Des rooms créées par les joueurs — à construire, mais **cachées** pour l'instant

Pour une prochaine mise à jour : construis-le derrière l'interrupteur `userRooms: false` (aucun bouton, aucune
route qui réponde tant qu'il est éteint).

- Un joueur **achète** une room à lui (par la boutique, comme le reste ; il faut un compte). Le prix et la
  formule (une fois, ou par mois) : demande-moi.
- Elle est **persistante** : son nom, son propriétaire, ses réglages et ses scores restent, même vide.
- **Mot de passe facultatif**, choisi par le propriétaire : gardé comme ceux des comptes (jamais en clair),
  jamais dans l'adresse (un échange qui donne un billet de courte durée pour entrer).
- **Son propre tableau des scores, en plus des high scores communs** : à chaque stand, on voit le classement
  de la room et celui du monde. Un score fait dans une room privée compte aussi pour le monde.
- **Pas de sky villages** dans une room de joueur : les 50 villages n'existent que dans les rooms communes.
  Quand on achète sa room, c'est vraiment sa room.
- À me proposer : ce que le propriétaire peut faire (renommer, changer le mot de passe, remettre son tableau à
  zéro, mettre quelqu'un dehors), si ces rooms apparaissent dans la liste ou seulement par lien, leur taille,
  et ce qui se passe quand on arrête de payer.

### B6. Anti-triche

Six mesures. Les vraies protections sont côté serveur ; le navigateur appartient au joueur.

1. **Vérifier les objets payants côté serveur.** Aujourd'hui le relais transporte la couleur et l'allure
   (chapeau, peinture, traînée, compagnon, taille, jetpack) sans vérifier que le joueur les possède : un
   navigateur modifié porte ce qu'il veut. Je veux que le relais demande au carnet ce que l'appareil ou le
   compte possède (Game Pass compris, et la journée gratuite du jetpack) et **ramène au défaut** ce qui n'est
   pas possédé — à la connexion et à chaque changement ; à relire après un achat.
2. **Lier les scores aux comptes.** Aujourd'hui un score est posté sous un nom libre : n'importe qui peut
   écrire sous le nom d'un autre. Règle proposée (dis-moi si tu vois mieux) :
   - tout le monde peut jouer et voir son score ;
   - un **invité** n'apparaît que dans le classement **du jour** ;
   - pour **la semaine, le mois et tous les temps**, il faut un compte (gratuit) ; au moment du score, on le
     propose (« You would be #3 this week — create an account to keep it ») ;
   - le nom d'un compte est réservé : personne d'autre ne poste dessous ;
   - les scores déjà en place : dis-moi ce que tu proposes (les garder marqués comme anciens, ou repartir).
3. **Limiter les connexions par adresse.** Un nombre maximal de connexions simultanées par adresse IP (par
   room et au total) et de nouvelles connexions par minute. Des valeurs larges et réglables — une école, un
   café ou un opérateur mobile partagent une adresse. Un message clair en cas de refus ; pas de limite pour moi.
4. **Retirer l'accès console en production.** Ne plus exposer `window.__mmf` (ni rien d'autre de global) dans
   la version en ligne. À garder en développement (`import.meta.env.DEV`) — tes tests et ceux du labo s'en
   servent — et dans la page du labo : sa compilation définit `__LAB__` exprès, expose l'objet quand
   `typeof __LAB__ !== 'undefined'`. Les extras, eux, reçoivent `app` en argument : ils n'en ont pas besoin.
   Sois honnête avec moi : c'est un ralentisseur, pas un mur.
5. **Rejouer les parties de stand.** Pour les jeux de stand (les quatre premiers, les six nouveaux, Wing It,
   la borne d'arcade) : le serveur donne la graine avec la note de départ, le navigateur enregistre les gestes,
   et le serveur **rejoue la partie** pour vérifier le score — **seulement quand le score entrerait dans un
   top 5** (d'une des quatre périodes ; plus tard d'une room privée aussi). Cela demande que la règle de chaque
   jeu soit séparée de son affichage et donne le même résultat partout. Un score qui ne se rejoue pas est
   refusé sans le dire et signalé dans la page admin.
   Pour les jeux de parcours (Mostly Up, la course, le toboggan, plus tard le chêne), pas de rejeu ; garde les
   bornes de temps, et étudie ceci : le relais voit passer les positions — il peut attester qu'il a bien vu ce
   joueur faire le parcours pendant cette durée, sans téléportation. Dis-moi ce que ça coûterait.
6. **Bannir en silence.** En plus de l'exclusion actuelle (qui le dit au joueur) : une exclusion dont le joueur
   ne s'aperçoit pas. Il joue normalement ; ce qu'il écrit n'est vu que de lui ; ses scores n'apparaissent que
   pour lui ; ses panneaux et plaques ne s'affichent pas. Par appareil, par compte et par adresse ; posée depuis
   « Who is here » et depuis la page admin.

---

## C. Méthode

1. **Ordre proposé** (dis-moi si tu en vois un meilleur) : (1) A4, petit et sûr ; (2) B1 + B2, parce que tout
   le reste se sort avec ; (3) B3 ; (4) B4 ; (5) B6, en commençant par ce qui est côté serveur (objets payants,
   comptes, limites, exclusion silencieuse), le rejeu ensuite ; (6) B5, caché.
2. **Livre par étapes** : chaque étape doit pouvoir être mise en ligne seule, sans casser le jeu actuel. La
   base du jeu reste celle d'aujourd'hui ; j'allume les nouveautés une à une.
3. **Rien ne se perd** : comptes, achats, scores, panneaux, plaques. Tout changement de ce que garde le carnet
   doit relire l'ancien format. Si tu ajoutes une classe de Durable Object, dis-moi ce que cela change au
   déploiement.
4. **Vérifie** : tes tests (`net-test`, `shop-test`, `walk-test`…) et les trois du labo après chaque étape ;
   pour les salles, une simulation de charge (pas seulement deux onglets) ; pour les mises à jour, un essai
   réel d'une version à la suivante avec un joueur connecté.
5. **Dis-moi ce qui n'a pas pu être vérifié** (par exemple : pas essayé avec 200 vraies personnes, pas essayé
   sur un vrai téléphone).
6. **Questions à me poser plutôt que deviner** : le prix et la formule des rooms privées ; la règle des
   comptes pour les scores ; les limites par adresse ; ce que cache exactement l'exclusion silencieuse ; le
   remboursement d'un sponsor refusé ; ce qu'on voit des villages en mode « bientôt » ; les rooms gratuites par
   adresse.

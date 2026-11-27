### War Through the Ages (`ages`)

A long toy battlefield stands in the west meadow, a dozen metres south of the cars' table (its middle at
(-259.3, -18.6); 36 × 8 m, turned sixteen degrees off the north so that the grass under it is nearly level — it
varies by 0.8 m — and its top stands level over it). One asks to play under a blue arch at (-239.6, -13.0),
sixteen metres in front of it. It is painted like a booth of the fair: a skirt of red and cream planks, a road of
sand between two lawns, a backdrop of painted hills and clouds, five striped posts with bunting and bulbs, its
name on a board. **A base stands at each end of the road: one's own on the left, the other's — played by the
game — on the right.** While nobody plays, a base of stone and a base of the atom face each other and one's own
robots of the five ages stand on the road, age by age, over a board that names them.

Gold comes with time (six a second in the first age, 115 in the last) and with each robot of the other side that
falls. With it one sends **robots that march and fight by themselves** — three an age: a brawler (cheap, sturdy
for its price), a shooter (frail, hits from afar), a heavy one (slow, dear, very hard to bring down) — and
builds **turrets** on one's base (three places; the first is there from the start). On the road a side walks in
one column and **the sturdy ones go in front by themselves** (a heavy one steps past whatever is lighter, a
brawler past a shooter): the first of each column fights the first of the other, the shooters behind shoot over
its shoulders, and at the other's gate **the shooters bombard the base** over the heads of those who fight
there — it is they who bring a base down, and the sturdy ones who keep them alive meanwhile. Every robot that
falls is experience for both sides: enough of it and one **passes to the next age** — stone, iron, powder,
steam, the atom —, with its robots (clubber, slinger, brute · swordsman, archer, knight on a horse on wheels ·
buccaneer, musketeer, cannon · trooper, gunner, tank · sentinel, blaster, colossus), its turret, more gold and
a stouter base, which keeps its wounds. The next age is there for both sides at about the same moment: who
takes it first has, for a while, robots twice as strong. Each age has its **great blow** — stones from the sky,
a rain of arrows, a broadside, an air raid, the atom —, which falls on every robot the other has on the road
1.6 s after it is called and comes back after 45 s. The other base falls: won, and the score is the time it
took.

**What one buys is on a panel of the game's own**, there only while a war is on: six buttons along the bottom
of the screen — the three robots of one's age, its turret, its great blow, the next age —, each with its
picture (the robots and turrets are drawn by the game's renderer from the very models), its price, and a veil
that lifts as it comes back; over them one's gold and what comes every second, and the experience towards the
next age; over each base, how much of it stands. A finger or a mouse presses a button; the keys 1 … 6 do the
same; and so do the stick (left and right choose a button) and the jump key (it presses it). One's robot stands
on the roof of the base on the left; the camera stands in front of the stage and does not move. Blue is one's
own and red is the other's, in every age: on the body of every robot, on the flag it carries on its back, on
the banners of the bases.

**The other general plays by the same rules** — the same gold, the same prices, the same six buttons, pressed
through the same door (`press`) — from a seed: it looks at the road a little less than once a second, sends
brawlers and shooters and a heavy one in ten, builds a turret an age. It is cautious: it keeps a fifth of its
gold in its coffers and holds a council of 26 s before each new age, so that whoever presses "next age" at once
has that long with stronger robots. **After six minutes of war it has learnt**: its coffers are spent on heavy
ones and shooters, no more councils, its great blow on three robots — a war that drags is usually lost.

The player that plays by itself (three looks a second, each acted on a third of a second late, one button at a
time: a shooter, a heavy one, in turn; a turret in the iron and steam ages; its great blow on three or more;
the next age at once) wins every one of forty wars in 2:07 to 2:58 (half of them under 2:41), its base hardly
touched, in the powder or the steam age. A newcomer (one look a second, brawlers and shooters and now and then
a heavy one, four seconds to see that the next age is lit, no turret) wins all forty in 3:41 to 5:42 (half
under 4:33), in the atom age. A clumsy one (any of the six buttons, lit or not, every two seconds or so) wins
three of forty; who hammers the first button loses every war in a little over three minutes; who does nothing
loses in 1:47 to 1:53. For the game's boards: `ages: { order: 'asc', min: 80_000, max: 900_000 }` — a war is
called off after a quarter of an hour; the least is not a proof: the rules alone forbid a victory before 31 s,
and the quickest of 320 wars played 160 other ways took 2:08.

What it adds to the world (only when it is on): one group, `ages` — the stage, the two bases in their five
dresses (two of them shown), the arch —, one box that keeps one from walking through the table; while a war is
on, the armies (one mesh a kind of robot), its panel in the page, and the keys 1 … 6, which it takes before the
game hears them (they would make one's robot wave). Its music (`TUNES.ages`) reads `heatOf`: the age one has
reached.

What it does not do, and what nobody has seen: **nobody has played it with a hand** — every figure above is a
player written in its rules, and "four or five minutes for a newcomer" is one such player, not a person.
Before the sixth minute the other general hardly ever reaches one's base (the newcomer's base ends at 90 to
100 %): whether that is restful or dull is its owner's to say — `GENERAL.thrift`, `GENERAL.council` and
`GENERAL.bold` in its rules are the three knobs. Nothing of the battle is seen by the others: another visitor
sees one's robot on the roof of the left base, and the stage as it is while nobody plays. On a telephone it was
only looked at in a page of a telephone's size held sideways (844 × 390): the buttons sit between the stick and
the two round buttons, the bases reach under the corners of the game's own display; held upright the stage is a
thin strip, which nobody has looked at. While a war is on, what the game says at the bottom of the screen is
behind the panel (it goes when the war is over, so that the score is read). The shadows of the robots are the
round ones drawn under them (and the real-time ones where the device has them); the bases are not in the
shadows drawn once for what never moves.

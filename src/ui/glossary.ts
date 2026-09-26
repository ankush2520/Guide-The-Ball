/* ============================================================
   GLOSSARY

   The single description of every thing that can be on a board.
   It replaced a hand-written list under the board, which is what
   let a country ship an item the game never explained anywhere.

   The panel marks whatever is on the CURRENT board, so the list
   is always complete but never generic.

   It is also the ONE REGISTRY of "new thing" intro cards (Part M;
   it absorbed the old MECH_TIPS one-liners). An entry with an
   `intro` introduces itself the first time a level has it: a
   card before the board is playable, its `icon` drawn with the
   entity's own code (ui/introIcons), and the matching objects on
   the board pulsing (`highlight`). Once seen, `key` is recorded
   in tipsSeen and the card never comes back on its own - the Info
   panel can replay a board's cards. `covers` lists the entity
   kinds an entry explains: in a dev build, a level holding a kind
   no entry covers logs a warning, so no mechanic ships unexplained.
   ============================================================ */
import type { Circle, Level } from '../levels/types';
import type { EntityKind } from '../entities/Entity';
import { fishAt } from '../levels/fish';
import { SPARE_FROM } from '../managers/RewardManager';

/** What an intro's `has` may ask besides the level: facts about the player. */
export interface IntroCtx { spares: number; hint: boolean; }

export interface GlossaryEntry {
  /** Stable id - the tipsSeen key and the card's key. */
  key: string;
  cls: string;
  has: (lv: Level, ctx?: IntroCtx) => boolean;
  name: string;
  long: string;
  /** Entity kinds this entry explains (the dev guard). */
  covers?: EntityKind[];
  /** Listed in the Info panel's "On the board"? Default yes. */
  onBoard?: boolean;
  /* ---- the intro card (absent: never carded) ---- */
  title?: string;
  /** One friendly line, about fifteen words. */
  intro?: string;
  /** Which drawing the card shows - ui/introIcons. */
  icon?: string;
  /** The board objects to pulse while the card is up. */
  highlight?: (lv: Level, simT: number) => Circle[];
}

export const GLOSSARY: GlossaryEntry[] = [
  { key: 'balls', cls: 'bl', onBoard: false, has: () => true, name: 'Balls',
    long: 'Every level gives you a few balls. A miss uses one; running out lets you restart ' +
          'the level free, or watch an ad to keep going with your ramps where they are.',
    title: '3 balls per level', icon: 'balls',
    intro: 'Miss them all? Restart the level, or watch an ad to keep going.' },
  { key: 'target', cls: 'tg', has: () => true, name: 'Target', covers: ['target'],
    long: 'Land the ball anywhere inside the ring and the level is cleared.' },
  { key: 'obstacle', cls: 'ob', has: lv => lv.obstacles.length > 0, name: 'Obstacle', covers: ['obstacle'],
    long: 'Knocks the ball off at an unexpected angle - but the same shot always bounces the ' +
          'same way, so a bounce you have seen once can be planned for. Safest is to route ' +
          'around it.',
    title: 'Bumper', icon: 'obstacle', intro: 'Knocks your ball off course. Same shot, same bounce.',
    highlight: lv => lv.obstacles },
  /* Directly after the obstacle, because the ONE thing a player has to learn
     here is the difference between the two, and a list that separates them
     makes that comparison harder than it needs to be. */
  { key: 'fire', cls: 'fr', has: lv => lv.fires.length > 0, name: 'Fire', covers: ['fire'],
    long: 'ENDS YOUR DROP THE INSTANT YOU TOUCH IT. It does not bounce you like the red ' +
          'obstacle does - there is no recovering from it, so the route has to miss it ' +
          'completely. It is the flickering one with flames; the plain red circle only ' +
          'knocks you off course.',
    title: 'Fire', icon: 'fire', intro: 'Touch it and your drop is over. Steer well clear!',
    highlight: lv => lv.fires },
  { key: 'breakable', cls: 'bk', has: lv => lv.breakables.length > 0, name: 'Breakable block',
    covers: ['breakable'],
    long: 'Bounces you off exactly like an obstacle, then shatters and is gone. It stays ' +
          'gone for your next drop on this level, so a first attempt can be spent clearing a path.',
    title: 'Cracked bumper', icon: 'breakable', intro: 'Bounces your ball once, then shatters.',
    highlight: lv => lv.breakables },
  { key: 'movingTarget', cls: 'mt', has: lv => !!lv.targetMove, name: 'Moving target',
    long: 'This target moves at a steady rate - side to side, or up and down - and it is already ' +
          'moving when the level opens: watch where it is and time your drop. It always starts ' +
          'from the same spot when you enter the level, and Replay drops at the same moment ' +
          'again. The pale track it rides on is its own: ramps cannot be drawn across it.',
    title: 'Moving target', icon: 'movingTarget', intro: "It's already moving. Time your drop to meet it.",
    highlight: lv => [lv.target] },
  { key: 'wind', cls: 'wd', has: lv => lv.wind.length > 0, name: 'Wind', covers: ['wind'],
    long: 'Pushes the ball steadily while it is inside the band, and stops the moment it leaves. ' +
          'The fan and the gusts coming off it show which way it blows (under the sea it is a ' +
          'current, and the bubbles show the way).',
    title: 'Wind', icon: 'wind', intro: "Pushes your ball while it's inside. The fan and gusts show which way.",
    highlight: lv => lv.wind.map(z => ({ x: Math.max(40, Math.min(440, z.x + z.w / 2)), y: z.y + z.h / 2, r: Math.min(60, z.h / 2) })) },
  { key: 'thunder', cls: 'th', has: lv => !!lv.storm, name: 'Thunder', covers: ['storm', 'rain'],
    long: 'Lightning strikes a fixed set of spots in a fixed order, over and over. Each spot ' +
          'flickers just before it is hit, and a strike that catches the ball ENDS YOUR DROP. ' +
          'The rhythm is the same every time, so a drop can be timed to slip between strikes.',
    title: 'Thunder', icon: 'thunder',
    intro: 'A spot flickers, then lightning strikes and ends your drop. Same rhythm every time!',
    highlight: lv => (lv.storm ? lv.storm.points.map(p => ({ x: p.x, y: p.y, r: 45 })) : []) },
  { key: 'fish', cls: 'fs', has: lv => !!(lv.fish && lv.fish.length), name: 'Eater fish', covers: ['fish', 'sea'],
    long: 'The purple fish with teeth. It EATS THE BALL - touching it ends your drop, like fire. ' +
          'It swims back and forth along the same wavy path every time, shown faintly under it, ' +
          'so time your drop for when it is out of the way.',
    title: 'Eater fish', icon: 'fish', intro: 'Swims the same wavy path. Touch it and your ball gets eaten!',
    highlight: (lv, t) => (lv.fish ?? []).map(f => { const c = fishAt(f, t); return { x: c.x, y: c.y, r: f.r + 6 }; }) },
  { key: 'oval', cls: 'ov', has: lv => lv.ovals.length > 0, name: 'Giant rock', covers: ['oval'],
    long: 'A huge solid rock. Nothing goes through it - the ball bounces off it like a wall - so ' +
          'the way to the target is around it.',
    title: 'Giant rock', icon: 'oval', intro: 'Too big to go through. Find the way around.',
    highlight: lv => lv.ovals.map(o => ({ x: o.x, y: o.y, r: Math.min(o.rx, 140) })) },
  /* The player's own item. Its card normally comes with the level-10 gift;
     this entry catches a player who reaches a need-spring board without it. */
  { key: 'spring', cls: 'sp', has: lv => !!lv.needsSpring, onBoard: false, name: 'Spring',
    long: 'The brass COIL out of your bag, and the only thing in the game that can give the ' +
          'ball back speed it has lost - every ordinary bounce loses a little. It does not go ' +
          'on the board: it goes on a RAMP YOU DREW, and makes that ramp throw FOUR TIMES ' +
          'harder. Open the bag, tap Use, then tap the ramp you want it on. It only leaves ' +
          'your bag if the ball really bounces off it AND that drop wins - a spring that sat ' +
          'on a ramp the ball never touched costs you nothing.',
    title: 'New power: Spring!', icon: 'spring',
    intro: 'Put it on your ramp to launch 4x harder. Only used if you win.' },
  { key: 'spareRamp', cls: 'rp', onBoard: false, name: 'Spare ramp',
    has: (lv, ctx) => lv.id >= SPARE_FROM && !!ctx && ctx.spares > 0,
    long: 'One extra ramp from your bag, for a level you are stuck on - at most one per level. ' +
          'It is only used up if you win with it, and a clear that needed one earns at most 2 stars.',
    title: 'Spare ramp', icon: 'spareRamp', intro: 'One extra ramp for a stuck level. Max 2 stars when used.' },
  { key: 'hint', cls: 'hn', onBoard: false, name: 'Hint', has: (_lv, ctx) => !!ctx && ctx.hint,
    long: 'The lightbulb shows one ramp layout that is proven to win this level, as a dashed ' +
          'outline to trace. Your first hint is free; after that it costs an ad. A clear with a ' +
          'hint earns at most 2 stars.',
    title: 'Hint', icon: 'hint', intro: 'Shows one ramp that wins. Max 2 stars when used.' },
  { key: 'box', cls: 'bx', has: lv => lv.boxes.length > 0, name: 'Mystery box', covers: ['box'],
    long: 'A chest. Touch it with the ball mid-drop and it pays out something random - coins, ' +
          'a spare ramp, sometimes a spring or a free spin of the wheel. Like a star it ' +
          'never changes where the ball goes, and each one can only be opened ONCE: after that ' +
          'the board shows the empty outline where it was.',
    title: 'Mystery box', icon: 'box', intro: 'Hit it with the ball for a surprise reward!',
    highlight: lv => lv.boxes.map(b => ({ x: b.x, y: b.y, r: 22 })) },
  /* Straight after the chest, because it is the same prize out of a different
     place, and "this target has one" is the only new thing to learn. It is a
     per-level fact, said by a flash on every visit, so it has no card. */
  { key: 'gift', cls: 'gf', has: lv => !!lv.targetGift, name: 'Gift target',
    long: 'There is a present sitting INSIDE this target - the same one a chest holds. Land in ' +
          'it and the gift is unwrapped for you before the win card, and it pays the same kind ' +
          'of prize. Once only, like a chest: clear the board again and the target is empty.' },
  { key: 'star', cls: 'st', has: lv => lv.stars.length > 0, name: 'Gold star', covers: ['star'],
    long: 'Collect it by passing close. Purely optional: it never changes where the ball goes ' +
          'and never affects winning. Your best count per level is remembered.',
    title: 'Gold star', icon: 'star', intro: 'Optional pickup. Grab it if you can.',
    highlight: lv => lv.stars.map(p => ({ x: p.x, y: p.y, r: 16 })) },
  { key: 'ice', cls: 'sl', has: lv => lv.slippery.length > 0, name: 'Ice', covers: ['slippery'],
    long: 'Bounces inside this band lose almost no speed, so the ball carries much further and ' +
          'is far harder to settle where you want it.',
    title: 'Ice', icon: 'ice', intro: 'Bounces here keep almost all their speed.',
    highlight: lv => lv.slippery.map(z => ({ x: Math.max(40, Math.min(440, z.x + z.w / 2)), y: z.y + z.h / 2, r: Math.min(60, z.h / 2) })) },
  { key: 'tricky', cls: 'wl', has: lv => lv.targetType !== 'OPEN', name: 'Wall', covers: ['wall'],
    long: 'Fixed level scenery guarding the target. It bounces the ball the same predictable way ' +
          'your ramps do - it just is not yours to move - and it means the target can only be ' +
          'reached from its open side.',
    title: 'Tricky target', icon: 'tricky', intro: 'This target can only be entered from one side.',
    highlight: lv => [{ x: lv.target.x, y: lv.target.y, r: lv.target.r + 22 }] },
  { key: 'ramp', cls: 'rp', has: () => true, name: 'Your ramp',
    long: 'What you draw: drag anywhere on empty board and the ramp is the line you drag, any ' +
          'length and any angle you like. The ball mirrors off it like a real bounce and loses a ' +
          'little speed.' },
  { key: 'ball', cls: 'bl', has: () => true, name: 'Ball',
    long: 'Falls from the marker at the top the instant you tap empty board. Gravity does the ' +
          'rest; you never steer it directly.' },
];

/** The entries that introduce themselves with a card. */
export const INTROS = GLOSSARY.filter(g => g.intro);

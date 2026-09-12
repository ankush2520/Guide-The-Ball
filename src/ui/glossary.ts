/* ============================================================
   GLOSSARY

   The single description of every thing that can be on a board.
   It replaced a hand-written list under the board, which is what
   let Solmesa ship a booster the game never explained anywhere.

   The panel marks whatever is on the CURRENT board, so the list
   is always complete but never generic.
   ============================================================ */
import type { Level } from '../levels/types';

export interface GlossaryEntry {
  cls: string;
  has: (lv: Level) => boolean;
  name: string;
  long: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  { cls: 'tg', has: () => true, name: 'Target',
    long: 'Land the ball anywhere inside the ring and the level is cleared.' },
  { cls: 'ob', has: lv => lv.obstacles.length > 0, name: 'Obstacle',
    long: 'Bounces the ball off at a RANDOM angle. Plan around it, not through it - a route ' +
          'that depends on hitting one is a gamble, not a plan.' },
  /* Directly after the obstacle, because the ONE thing a player has to learn
     here is the difference between the two, and a list that separates them
     makes that comparison harder than it needs to be. */
  { cls: 'fr', has: lv => lv.fires.length > 0, name: 'Fire',
    long: 'ENDS YOUR DROP THE INSTANT YOU TOUCH IT. It does not bounce you like the red ' +
          'obstacle does - there is no recovering from it, so the route has to miss it ' +
          'completely. It is the flickering one with flames; the plain red circle only ' +
          'knocks you off course.' },
  { cls: 'mt', has: lv => !!lv.targetMove, name: 'Moving target',
    long: 'This target slides side to side at a steady rate, and it starts moving when you ' +
          'drop. Where it will be is fixed - it depends only on how long the ball has been ' +
          'falling - so it is a timing puzzle you can plan, not a reflex test.' },
  { cls: 'bk', has: lv => lv.breakables.length > 0, name: 'Breakable block',
    long: 'Bounces you randomly exactly like an obstacle, then shatters and is gone. It stays ' +
          'gone for your next drop on this level, so a first attempt can be spent clearing a path.' },
  { cls: 'bs', has: lv => lv.boosters.length > 0, name: 'Booster',
    long: 'Fires the ball along the arrow at a fixed speed, every single time. Unlike an ' +
          'obstacle there is nothing random about it - the arrow is exactly the heading you leave on.' },
  { cls: 'pt', has: lv => lv.portals.length > 0, name: 'Portal',
    long: 'Two rings of the same colour. Go into one and you come out of the other keeping your ' +
          'direction, unless the exit has an arrow, which turns you to face it.' },
  { cls: 'wd', has: lv => lv.wind.length > 0, name: 'Wind',
    long: 'Pushes the ball steadily while it is inside the band, and stops the moment it leaves. ' +
          'The drifting streaks show which way it blows.' },
  { cls: 'sl', has: lv => lv.slippery.length > 0, name: 'Ice',
    long: 'Bounces inside this band lose almost no speed, so the ball carries much further and ' +
          'is far harder to settle where you want it.' },
  { cls: 'st', has: lv => lv.stars.length > 0, name: 'Gold star',
    long: 'Collect it by passing close. Purely optional: it never changes where the ball goes ' +
          'and never affects winning. Your best count per level is remembered.' },
  { cls: 'rp', has: () => true, name: 'Your ramp',
    long: 'What you place. The ball mirrors off it like a real bounce and loses a little speed.' },
  { cls: 'wl', has: lv => lv.walls.length > 0, name: 'Wall',
    long: 'Fixed level scenery guarding the target. It bounces the ball the same predictable way ' +
          'your ramps do - it just is not yours to move.' },
  { cls: 'bl', has: () => true, name: 'Ball',
    long: 'Falls from the marker at the top the instant you press Drop Ball. Gravity does the ' +
          'rest; you never steer it directly.' },
];

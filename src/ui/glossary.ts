/* ============================================================
   GLOSSARY

   The single description of every thing that can be on a board.
   It replaced a hand-written list under the board, which is what
   let a country ship an item the game never explained anywhere.

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
    long: 'This target slides side to side at a steady rate, and it is already moving when ' +
          'the level opens - watch where it is and time your drop, the way you plan around ' +
          'fire. It always starts from the same spot when you enter the level, and Replay ' +
          'drops at the same moment again. The pale track it rides on is its own: ramps ' +
          'cannot be drawn across it.' },
  { cls: 'bk', has: lv => lv.breakables.length > 0, name: 'Breakable block',
    long: 'Bounces you randomly exactly like an obstacle, then shatters and is gone. It stays ' +
          'gone for your next drop on this level, so a first attempt can be spent clearing a path.' },
  { cls: 'bs', has: lv => lv.boosters.length > 0, name: 'Booster pad',
    long: 'The orange DISC. Fires the ball along its arrow at a fixed speed, every single time. ' +
          'Unlike an obstacle there is nothing random about it - the arrow is exactly the heading ' +
          'you leave on.' },
  /* The player's own item, straight after the level's own pad: the two are
     different shapes doing different jobs, and the only thing to learn is
     which is which. This one is always listed - it is in the bag, not on the
     board - so `has` is never true and it never gets the "on this level" mark. */
  { cls: 'sp', has: () => false, name: 'Spring',
    long: 'The brass COIL out of your bag, and the only thing in the game that can give the ' +
          'ball back speed it has lost - every ordinary bounce loses a little. It does not go ' +
          'on the board: it goes on a RAMP YOU DREW, and makes that ramp throw FOUR TIMES ' +
          'harder. Open the bag, tap Use, then tap the ramp you want it on. It only leaves ' +
          'your bag if the ball really bounces off it AND that drop wins - a spring that sat ' +
          'on a ramp the ball never touched costs you nothing.' },
  { cls: 'wd', has: lv => lv.wind.length > 0, name: 'Wind',
    long: 'Pushes the ball steadily while it is inside the band, and stops the moment it leaves. ' +
          'The drifting streaks show which way it blows.' },
  { cls: 'sl', has: lv => lv.slippery.length > 0, name: 'Ice',
    long: 'Bounces inside this band lose almost no speed, so the ball carries much further and ' +
          'is far harder to settle where you want it.' },
  { cls: 'st', has: lv => lv.stars.length > 0, name: 'Gold star',
    long: 'Collect it by passing close. Purely optional: it never changes where the ball goes ' +
          'and never affects winning. Your best count per level is remembered.' },
  { cls: 'bx', has: lv => lv.boxes.length > 0, name: 'Mystery box',
    long: 'A chest. Touch it with the ball mid-drop and it pays out something random - coins, ' +
          'balls, a spare ramp, sometimes a spring or a free spin of the wheel. Like a star it ' +
          'never changes where the ball goes, and each one can only be opened ONCE: after that ' +
          'the board shows the empty outline where it was.' },
  /* Straight after the chest, because it is the same prize out of a different
     place, and "this target has one" is the only new thing to learn. */
  { cls: 'gf', has: lv => !!lv.targetGift, name: 'Gift target',
    long: 'There is a present sitting INSIDE this target - the same one a chest holds. Land in ' +
          'it and the gift is unwrapped for you before the win card, and it pays the same kind ' +
          'of prize. Once only, like a chest: clear the board again and the target is empty.' },
  { cls: 'rp', has: () => true, name: 'Your ramp',
    long: 'What you draw: drag anywhere on empty board and the ramp is the line you drag, any ' +
          'length and any angle you like. The ball mirrors off it like a real bounce and loses a ' +
          'little speed.' },
  { cls: 'wl', has: lv => lv.walls.length > 0, name: 'Wall',
    long: 'Fixed level scenery guarding the target. It bounces the ball the same predictable way ' +
          'your ramps do - it just is not yours to move.' },
  { cls: 'bl', has: () => true, name: 'Ball',
    long: 'Falls from the marker at the top the instant you tap empty board. Gravity does the ' +
          'rest; you never steer it directly.' },
];

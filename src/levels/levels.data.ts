/* ============================================================
   LEVELS

   Each: id, name, maxBlocks, spawn, obstacles, target, targetType.
   Wall segments are DERIVED from targetType by buildWalls() at
   load time and are REAL collidable geometry - see initLevel()
   and resolveCollisions(). They are never stored here.

   Countries 2+ are machine-generated and solver-verified: every one
   was proved winnable by the same sweep the original twenty were
   held to, before it was allowed in. Do not hand-edit inside the
   markers - change the template and re-run the generator, or the
   next run will overwrite you:

     node tools/genlevels.mjs <country> --write
   ============================================================ */
import type { RawLevel } from './types';

export const RAW_LEVELS: RawLevel[] = [

  /* ---- Country 1: Verdholm (hand-designed, frozen) ---- */
  { id:1, name:"First Drop", maxBlocks:1, targetType:'OPEN',
    spawn:{x:140,y:40},
    obstacles:[],
    target:{x:330,y:686,r:46} },
  { id:2, name:"Long Reach", maxBlocks:1, targetType:'OPEN',
    spawn:{x:372,y:40},
    obstacles:[],
    target:{x:118,y:700,r:42} },
  { id:3, name:"Watch Out", maxBlocks:1, targetType:'OPEN',
    spawn:{x:232,y:40},
    obstacles:[{x:170,y:452,r:36}],
    target:{x:92,y:636,r:27} },
  { id:4, name:"Two Steps", maxBlocks:2, targetType:'OPEN',
    spawn:{x:68,y:40},
    obstacles:[],
    target:{x:398,y:712,r:38} },
  { id:5, name:"Around It", maxBlocks:2, targetType:'OPEN',
    spawn:{x:344,y:40},
    obstacles:[{x:250,y:560,r:52}],
    target:{x:140,y:664,r:40} },
  { id:6, name:"The Gap", maxBlocks:2, targetType:'OPEN',
    spawn:{x:120,y:40},
    obstacles:[{x:214,y:424,r:36},{x:356,y:424,r:36}],
    target:{x:368,y:604,r:40} },
  { id:7, name:"One Shot", maxBlocks:1, targetType:'OPEN',
    spawn:{x:404,y:40},
    obstacles:[{x:300,y:404,r:40},{x:152,y:560,r:36}],
    target:{x:196,y:700,r:22} },
  { id:8, name:"Staircase", maxBlocks:3, targetType:'OPEN',
    spawn:{x:240,y:40},
    obstacles:[{x:228,y:420,r:44},{x:282,y:524,r:42}],
    target:{x:426,y:620,r:46} },
  { id:9, name:"Tight Corridor", maxBlocks:2, targetType:'OPEN',
    spawn:{x:84,y:40},
    obstacles:[{x:206,y:300,r:32},{x:214,y:440,r:32},{x:206,y:580,r:32}],
    target:{x:300,y:716,r:40} },
  { id:10, name:"Cross Court", maxBlocks:2, targetType:'OPEN',
    spawn:{x:428,y:40},
    obstacles:[{x:296,y:430,r:38},{x:170,y:302,r:36}],
    target:{x:60,y:628,r:40} },
  { id:11, name:"One Way In", maxBlocks:2, targetType:'SIDE_WALL', wallSide:'left',
    spawn:{x:156,y:40},
    obstacles:[],
    target:{x:392,y:668,r:40} },
  { id:12, name:"The Pocket", maxBlocks:2, targetType:'POCKET', wallSide:'right',
    spawn:{x:396,y:40},
    obstacles:[{x:330,y:470,r:38}],
    target:{x:250,y:690,r:46} },
  { id:13, name:"Threading It", maxBlocks:3, targetType:'NARROW_GAP', gapW:52,
    spawn:{x:260,y:40},
    obstacles:[{x:180,y:420,r:36}],
    target:{x:94,y:596,r:38} },
  { id:14, name:"Steady Hands", maxBlocks:2, targetType:'NARROW_GAP', gapW:44,
    spawn:{x:96,y:40},
    obstacles:[{x:222,y:380,r:36},{x:304,y:520,r:34}],
    target:{x:352,y:736,r:38} },
  { id:15, name:"The Basket", maxBlocks:3, targetType:'ENCLOSED',
    spawn:{x:384,y:40},
    obstacles:[{x:300,y:398,r:38},{x:140,y:500,r:36}],
    target:{x:200,y:648,r:40} },
  { id:16, name:"Breather", maxBlocks:2, targetType:'OPEN',
    spawn:{x:216,y:40},
    obstacles:[{x:302,y:340,r:34},{x:248,y:482,r:36},{x:370,y:566,r:32}],
    target:{x:286,y:596,r:46} },
  { id:17, name:"Full House", maxBlocks:2, targetType:'SIDE_WALL', wallSide:'left',
    spawn:{x:128,y:40},
    obstacles:[{x:240,y:380,r:36},{x:330,y:502,r:34}],
    target:{x:300,y:660,r:46} },
  { id:18, name:"No Room", maxBlocks:2, targetType:'NARROW_GAP', gapW:38,
    spawn:{x:400,y:40},
    obstacles:[{x:300,y:360,r:36},{x:232,y:482,r:34},{x:118,y:462,r:32}],
    target:{x:128,y:566,r:38} },
  { id:19, name:"The Gauntlet", maxBlocks:3, targetType:'POCKET', wallSide:'right',
    spawn:{x:248,y:40},
    obstacles:[{x:158,y:320,r:32},{x:302,y:360,r:34},{x:198,y:470,r:34},{x:344,y:520,r:32}],
    target:{x:150,y:726,r:44} },
  { id:20, name:"Master's Drop", maxBlocks:3, targetType:'ENCLOSED',
    spawn:{x:92,y:40},
    obstacles:[{x:196,y:330,r:34},{x:300,y:430,r:34},{x:140,y:470,r:28}],
    target:{x:356,y:646,r:32} },

  /* ============================================================
     GENERATED LEVELS - countries 2 and up.
     Written by tools/genlevels.mjs. Every level between these markers was
     built from a country template and then PROVED winnable, non-trivial and
     fair by the same solver sweep the original twenty were held to, before
     it was allowed in here. Do not hand-edit: change the template and
     re-run the generator, or the next run will overwrite you.
     ============================================================ */
/* GEN:START */

  /* ---- Country 2: Solmesa ---- */
  { id:21, name:"Ricochet", maxBlocks:2, targetType:'OPEN',
    spawn:{x:144,y:40},
    obstacles:[{x:263,y:444,r:30}],
    boosters:[{x:147,y:319,r:29,angle:8,speed:11.99}],
    target:{x:362,y:719,r:36} },
  { id:22, name:"Overshoot", maxBlocks:2, targetType:'OPEN',
    spawn:{x:371,y:40},
    obstacles:[{x:238,y:425,r:32}],
    boosters:[{x:370,y:323,r:32,angle:211,speed:9.98}],
    target:{x:107,y:716,r:33} },
  { id:23, name:"Overshoot", maxBlocks:2, targetType:'OPEN',
    spawn:{x:73,y:40},
    obstacles:[{x:228,y:351,r:34}],
    boosters:[{x:67,y:273,r:33,angle:19,speed:11.89}],
    target:{x:382,y:616,r:30} },
  { id:24, name:"Green Light", maxBlocks:2, targetType:'OPEN',
    spawn:{x:356,y:40},
    obstacles:[{x:392,y:488,r:28},{x:207,y:466,r:31}],
    boosters:[{x:359,y:285,r:33,angle:165,speed:12.21}],
    target:{x:138,y:665,r:38} },
  { id:25, name:"Overshoot", maxBlocks:2, targetType:'OPEN',
    spawn:{x:127,y:40},
    obstacles:[{x:329,y:591,r:34},{x:317,y:446,r:29}],
    boosters:[{x:133,y:305,r:33,angle:6,speed:11.88}],
    target:{x:412,y:726,r:38} },
  { id:26, name:"Updraft", maxBlocks:2, targetType:'OPEN',
    spawn:{x:394,y:40},
    obstacles:[{x:315,y:255,r:30},{x:302,y:366,r:31}],
    boosters:[{x:403,y:330,r:32,angle:177,speed:11.83}],
    target:{x:125,y:621,r:37} },
  { id:27, name:"Slingshot", maxBlocks:2, targetType:'SIDE_WALL', wallSide:'right',
    spawn:{x:147,y:40},
    obstacles:[{x:360,y:570,r:30},{x:330,y:423,r:34}],
    boosters:[{x:143,y:307,r:30,angle:-11,speed:12.17}],
    target:{x:400,y:677,r:30} },
  { id:28, name:"Updraft", maxBlocks:2, targetType:'SIDE_WALL', wallSide:'left',
    spawn:{x:374,y:40},
    obstacles:[{x:321,y:530,r:30},{x:259,y:334,r:34}],
    boosters:[{x:381,y:329,r:33,angle:208,speed:10.78}],
    target:{x:63,y:674,r:33} },
  { id:29, name:"The Sling", maxBlocks:2, targetType:'SIDE_WALL', wallSide:'right',
    spawn:{x:139,y:40},
    obstacles:[{x:261,y:428,r:29},{x:237,y:306,r:30}],
    boosters:[{x:142,y:284,r:29,angle:-2,speed:10.69}],
    target:{x:358,y:657,r:33} },
  { id:30, name:"Ridgeline", maxBlocks:2, targetType:'POCKET', wallSide:'left',
    spawn:{x:380,y:40},
    obstacles:[{x:327,y:483,r:32},{x:411,y:551,r:28},{x:98,y:361,r:33}],
    boosters:[{x:386,y:305,r:34,angle:195,speed:11.9}],
    target:{x:57,y:618,r:28} }
/* GEN:END */
];

/* Isolation tests for each new mechanic, on hand-made single-purpose boards. */
import { chromium } from 'playwright';
import { attachHarness } from '../tools/harness.mjs';
let fails=0;
const ok=(n,x='')=>console.log(`  ✓ ${n}${x?'  '+x:''}`);
const bad=(n,x='')=>{fails++;console.log(`  ✗ ${n}${x?'  '+x:''}`);};
const chk=(c,n,x='')=>c?ok(n,x):bad(n,x);

const b=await chromium.launch();
const p=await (await b.newContext()).newPage();
p.on('pageerror',e=>bad('page error',e.message));
await attachHarness(p);
const MECH=await p.evaluate(()=>window.__gtb.MECH);
const CONSTS=await p.evaluate(()=>window.__gtb.CONSTS);
const base={id:999,name:'scratch',maxBlocks:1,targetType:'OPEN',
  spawn:{x:240,y:40},obstacles:[],target:{x:240,y:770,r:20}};
const run=(lv,ramps=[],seed=1,broken=null)=>p.evaluate(([lv,ramps,seed,broken])=>{
  const ix=window.__gtb.scratch(lv);
  return window.__gtb.trace(ramps,seed,ix,broken);
},[lv,ramps,seed,broken]);

console.log('\nBOOSTER — deterministic redirect, fires once on entry');
{
  const plain=await run({...base});
  const boost=await run({...base, boosters:[{x:240,y:300,r:30,angle:0,speed:10}]});
  const after=boost.samples.find(s=>s.boosts===1);
  chk(plain.samples.every(s=>Math.abs(s.vx)<1e-9),'without a booster the ball falls dead straight');
  chk(!!after,'the booster fires');
  /* The authored speed is what the booster is DESIGNED around; what it fires
     at is that times BOOST_GAIN, held to BOOST_CAP. Asserted against the
     constants rather than a number, so retuning the gain moves this with it -
     and so the day the cap stops binding, this notices. */
  const want=Math.min(10*MECH.BOOST_GAIN, MECH.BOOST_CAP);
  chk(Math.abs(after.vx-want)<0.4 && Math.abs(after.vy)<0.4,
    `it fires at the authored speed x${MECH.BOOST_GAIN}, held to the boost cap`,
    `v=(${after.vx.toFixed(2)}, ${after.vy.toFixed(2)}) want ${want}`);
  chk(boost.samples[boost.samples.length-1].boosts===1,
    'and fires ONCE per entry, not every step it is inside',
    `${boost.samples[boost.samples.length-1].boosts} boost(s)`);
  const r2=await run({...base, boosters:[{x:240,y:300,r:30,angle:0,speed:10}]},[],7);
  chk(JSON.stringify(r2.samples.map(s=>[s.x,s.y]))===JSON.stringify(boost.samples.map(s=>[s.x,s.y])),
    'and is deterministic - a different RNG seed changes nothing');
}

console.log(`\nSPRING — fitted to the player's own ramp, leaves x${MECH.SPRING_GAIN} faster`);
{
  /* THE ITEM IS A FLAG ON A RAMP. There is no helper to build one any more,
     because there is no shape to build: a sprung ramp is the ramp the player
     drew with `spring` on it, and that is exactly what is passed here. Laid
     flat under the spawn, so the ball arrives at terminal velocity straight
     down and what comes off is the cleanest possible reading of the mechanic. */
  const flat={x1:180,y1:300,x2:300,y2:300};
  const sprung={...flat,spring:true};
  const plain=await run({...base},[flat]);
  const t=await run({...base},[sprung]);
  const ix=t.samples.findIndex(s=>s.springs===1);
  const inSp=ix>0?t.samples[ix-1].sp:0, outSp=ix>=0?t.samples[ix].sp:0;
  chk(ix>=0,'the spring fires when the ball reaches the ramp it is on');
  /* The SAME ramp without the spring is the control: this is the one
     comparison that says the spring is doing the work and not the line. */
  chk(plain.samples.every(s=>s.springs===0),
    'the same ramp without one never fires');
  chk(Math.abs(plain.samples[ix]?.sp-CONSTS.TERMINAL_VY*CONSTS.RESTITUTION)<1.2,
    'and leaves the ball slower than it arrived, the way every bounce does',
    `${plain.samples[ix]?.sp.toFixed(2)} off a plain ramp vs ${outSp.toFixed(2)} off a sprung one`);
  /* THE WHOLE CLAIM, and asserted against the constant rather than a number:
     the exit speed is the ENTRY speed times the gain, held to the item's own
     ceiling. A ramp can only ever give back less than it took. */
  const want=Math.min(inSp*MECH.SPRING_GAIN, MECH.SPRING_CAP);
  chk(Math.abs(outSp-want)<0.5,
    `it leaves at x${MECH.SPRING_GAIN} the speed it arrived at`,
    `${inSp.toFixed(2)} -> ${outSp.toFixed(2)}, want ${want.toFixed(2)}`);
  /* Against the CAP rather than against a number: the claim is that a launch
     leaves the board's own speed limit behind, and it has to keep holding
     when the gain is retuned. */
  chk(outSp>MECH.SPEED_CAP*2,
    'which is more than twice anything the board can otherwise reach',
    `${outSp.toFixed(1)} vs the general cap ${MECH.SPEED_CAP.toFixed(1)}`);
  /* IT IS STILL A RAMP: the heading is the mirror of the bounce, so a flat one
     sends a ball that fell straight down straight back UP. The spring adds
     speed and never a direction. */
  chk(t.samples[ix].vy<0,'and it still mirrors like a ramp - a flat one throws the ball back up',
    `vy ${t.samples[ix].vy.toFixed(1)}`);

  // the launch bleeds back into the board's own rules rather than stopping dead
  const decay=t.samples.slice(ix,ix+20).map(s=>s.sp);
  let falling=true;
  for(let i=1;i<decay.length;i++) if(decay[i]>decay[i-1]+1e-9) falling=false;
  chk(falling,'the launch decays every step instead of ending in a snap',
    decay.slice(0,6).map(v=>v.toFixed(0)).join(' -> '));
  let ratios=[];
  for(let i=1;i<6;i++) ratios.push(decay[i]/decay[i-1]);
  chk(ratios.every(r=>Math.abs(r-MECH.SPRING_DECAY)<0.02),
    `at the rate the constant states - x${MECH.SPRING_DECAY} a step`,
    ratios.map(r=>r.toFixed(3)).join(' '));

  chk(t.samples[t.samples.length-1].springs===1,
    'one contact is one launch - a two-sided ramp does not multiply a ball it just fired',
    `${t.samples[t.samples.length-1].springs} launch(es)`);
  const r2=await run({...base},[sprung],7);
  chk(JSON.stringify(r2.samples.map(s=>[s.x,s.y]))===JSON.stringify(t.samples.map(s=>[s.x,s.y])),
    'and it is deterministic - a different RNG seed changes nothing');

  /* NO TUNNELLING, which is the one thing a four-times launch could break.
     A sealed cage of ramps, two sprung ones inside it, and the ball must never
     get out: leaving is passing through 9 units of ramp, and nothing else. */
  const cage=[{x1:30,y1:120,x2:450,y2:120},{x1:30,y1:700,x2:450,y2:700},
              {x1:30,y1:120,x2:30,y2:700},{x1:450,y1:120,x2:450,y2:700}];
  const caged={...base,spawn:{x:240,y:140},target:{x:20,y:60,r:8}};
  const at=(cx,cy,deg,len=120)=>{const a=deg*Math.PI/180,hx=Math.cos(a)*len/2,hy=Math.sin(a)*len/2;
    return {x1:cx-hx,y1:cy-hy,x2:cx+hx,y2:cy+hy,spring:true};};
  let out=0,runs=0,peak=0;
  for(let ang=0;ang<180;ang+=15)
    for(const seed of [1,5]){
      const r=await p.evaluate(([lv,ramps,seed])=>{
        const ix=window.__gtb.scratch(lv);
        return window.__gtb.simulate(ramps,seed,ix);
      },[caged,[...cage,at(240,300,ang),at(240,520,-ang)],seed]);
      runs++; peak=Math.max(peak,r.spdMax);
      if(r.result==='out') out++;
    }
  chk(out===0,'a launched ball never passes through a ramp, however fast it is going',
    `${runs} runs in a sealed cage, peak speed ${peak.toFixed(0)}, ${out} escapes`);
  /* And inside that cage, where it cannot escape, the launch really does come
     all the way back down to the speed the rest of the board lives at. */
  const cageTrace=await p.evaluate(([lv,ramps])=>{
    const ix=window.__gtb.scratch(lv);
    return window.__gtb.trace(ramps,1,ix);
  },[caged,[...cage,at(240,300,20)]]);
  const fired=cageTrace.samples.findIndex(s=>s.springs===1);
  const back=cageTrace.samples.slice(fired).findIndex(s=>s.sp<=MECH.SPEED_CAP+1e-6);
  chk(fired>=0&&back>0,'and a launch that stays on the board settles back under the general cap',
    back>0?`${back} steps after firing`:'it never settled');
  chk(peak>MECH.SPRING_CAP*0.9,'and the cage really did get it up to speed',
    `peak ${peak.toFixed(0)} against the item's ceiling ${MECH.SPRING_CAP}`);
  chk(peak<=MECH.SPRING_CAP+1e-6,'two springs compounding are still held to that ceiling',
    `peak ${peak.toFixed(2)}`);
}

console.log('\nWIND_ZONE — accelerates only while inside');
{
  const zone={x:140,y:250,w:200,h:120,ax:0.6};
  const w=await run({...base, wind:[zone]});
  const inside=w.samples.filter(s=>s.y>=zone.y&&s.y<=zone.y+zone.h&&s.x>=zone.x&&s.x<=zone.x+zone.w);
  const below=w.samples.filter(s=>s.y>zone.y+zone.h+40);
  let rising=true; for(let i=1;i<inside.length;i++) if(inside[i].vx<=inside[i-1].vx-1e-9) rising=false;
  chk(inside.length>3,'the ball spends real time inside the zone',`${inside.length} steps`);
  chk(rising,'vx builds continuously while inside');
  let flat=true; for(let i=1;i<below.length;i++) if(Math.abs(below[i].vx-below[i-1].vx)>1e-9) flat=false;
  chk(flat,'and stops changing the instant it leaves',`vx held at ${below.length?below[0].vx.toFixed(3):'n/a'}`);
  chk(below.length&&below[0].vx>0.5,'with the drift it earned carried onward');
}

console.log('\nSLIPPERY_ZONE — keeps more of the bounce');
{
  const ramp=[{x1:150,y1:520,x2:330,y2:520}];
  const dry=await run({...base,target:{x:20,y:20,r:5}},ramp);
  const slip=await run({...base,target:{x:20,y:20,r:5},
    slippery:[{x:120,y:470,w:240,h:120}]},ramp);
  // apex of the FIRST rebound: the first sample where the ball starts rising,
  // then the highest point before it falls again
  const apex=t=>{const i=t.samples.findIndex(s=>s.vy<0); if(i<0) return Infinity;
    let m=Infinity; for(let k=i;k<t.samples.length&&t.samples[k].vy<0;k++) m=Math.min(m,t.samples[k].y);
    return m;};
  chk(apex(dry)<Infinity&&apex(slip)<Infinity,'both runs produced a bounce');
  chk(apex(slip)<apex(dry),'the ball rebounds higher off a slippery surface',
    `apex ${apex(dry).toFixed(1)}px vs ${apex(slip).toFixed(1)}px (lower y = higher)`);
  chk(MECH.SLIP_REST>MECH.RESTITUTION,'and the constant really is less lossy',
    `${MECH.SLIP_REST} vs ${MECH.RESTITUTION}`);
}

console.log('\nBREAKABLE — bounces like an obstacle, then is gone');
{
  const lv={...base, breakables:[{x:240,y:300,r:34}]};
  const first=await run(lv);
  const last=first.samples[first.samples.length-1];
  chk(last.broken===1,'first contact breaks it',`${last.broken} broken`);
  chk(first.samples.some(s=>Math.abs(s.vx)>0.5),'and deflected the ball on the way, like a red obstacle');
  const already=await run(lv,[],1,[true]);
  chk(already.samples.every(s=>Math.abs(s.vx)<1e-9),
    'entering with it already broken, the ball falls straight through');
  const intact=await run({...base, obstacles:[{x:240,y:300,r:34}]});
  chk(Math.abs(first.samples[6].x-intact.samples[6].x)<1e-9,
    'an unbroken breakable is physically identical to an obstacle');
}

console.log('\nSTAR — collected, and never touches the trajectory');
{
  const withStars=await run({...base, stars:[{x:240,y:300},{x:240,y:500},{x:400,y:300}]});
  const without=await run({...base});
  const last=withStars.samples[withStars.samples.length-1];
  chk(last.stars===2,'stars on the path are collected, the one off it is not',`${last.stars} of 3`);
  chk(JSON.stringify(withStars.samples.map(s=>[s.x,s.y,s.vx,s.vy]))===
      JSON.stringify(without.samples.map(s=>[s.x,s.y,s.vx,s.vy])),
    'and the trajectory is bit-identical with and without them');
}

console.log('\nFIRE — contact ends the drop, with no bounce');
{
  /* Straight down the spawn column, so the ball cannot help but meet it. */
  const lv={...base, fires:[{x:240,y:300,r:26}]};
  const f=await run(lv);
  chk(f.result==='burned','touching fire ends the run as a loss',`result ${f.result}`);
  const last=f.samples[f.samples.length-1];
  chk(Math.hypot(last.x-240,last.y-300)<=26+CONSTS.BALL_R+1.5,
    'and it ends AT the fire, not somewhere past it',
    `ended ${Math.hypot(last.x-240,last.y-300).toFixed(1)}px from centre`);
  /* The whole point of the mechanic: it must not behave like the red one. */
  chk(f.samples.every(s=>Math.abs(s.vx)<1e-9),
    'it never deflects the ball - no bounce, no redirect',
    `peak |vx| ${Math.max(...f.samples.map(s=>Math.abs(s.vx))).toExponential(1)}`);
  const ob=await run({...base, obstacles:[{x:240,y:300,r:26}]});
  chk(ob.result!=='burned'&&ob.samples.some(s=>Math.abs(s.vx)>0.5),
    'while the red obstacle in the same place still bounces and does NOT end it',
    `result ${ob.result}`);
  /* A board with no fire on it must be untouched by any of this. */
  const none=await run({...base});
  chk(none.result!=='burned','a level with no fire can never burn',`result ${none.result}`);
}

console.log('\nMOVING TARGET — the win tests where it IS, not where it started');
{
  /* Parked far from the spawn column, patrolling to directly under it. The
     ball falls straight down x=240, so a target still at x0 can never be hit
     and one that has travelled there in time must be.

     The period is DERIVED from how long the ball actually takes to fall,
     not guessed: the target reaches x1 at the half period, so timing the
     drop and doubling it puts the target under the ball at the moment it
     arrives. Hard-coding a period here would only be testing my arithmetic
     about terminal velocity. */
  const fall=await run({...base, target:{x:240,y:700,r:22}});
  const arrive=fall.samples.findIndex(s=>s.y>=700-22);
  chk(arrive>0,'timed the fall to the target line',`${arrive} steps`);
  const period=arrive*2;
  const mv={...base, target:{x:80,y:700,r:22}, targetMove:{x0:80,x1:240,period}};
  const moving=await run(mv);
  chk(moving.result==='win','the ball wins on a target that slid under it',
    `result ${moving.result}`);
  /* The control: identical board, target nailed to the patrol's start. */
  const still=await run({...base, target:{x:80,y:700,r:22}});
  chk(still.result!=='win','and the same board with a STATIC target at x0 is a miss',
    `result ${still.result}`);

  // the patrol itself: starts at x0, reaches x1 at the half period, returns
  const at=await p.evaluate(([mv,period])=>{
    const t=window.__gtb.targetAt;
    return [0,period*0.25,period*0.5,period*0.75,period,period*1.5]
      .map(k=>+t(mv,k).x.toFixed(2));
  },[{target:{x:80,y:700,r:22},targetMove:mv.targetMove},period]);
  chk(at[0]===80&&at[2]===240&&at[4]===80,
    'the patrol is a triangle: x0 at t=0, x1 at the half period, back at the full',
    `[${at.join(' ')}]`);
  chk(Math.abs(at[1]-160)<0.01&&Math.abs(at[3]-160)<0.01,
    'and crosses at a constant rate, so the midpoint is reached at the quarters');
  chk(at[4]===at[0]&&Math.abs(at[5]-at[2])<0.01,'and repeats exactly, run after run');

  /* Determinism is the contract this mechanic lives or dies by. */
  const again=await run(mv,[],7);
  chk(JSON.stringify(again.samples.map(s=>[s.x,s.y]))===
      JSON.stringify(moving.samples.map(s=>[s.x,s.y])),
    'a moving target is deterministic - a different seed changes nothing');

  const stat=await run({...base});
  chk(stat.result==='win','a level with no targetMove still wins exactly as before',
    `result ${stat.result}`);
}

console.log('\nSPEED_CAP — nothing stacks into runaway speed');
{
  /* The gale alone, with nothing to boost off: held to the general cap.
     ax is 0 here deliberately - the old version of this check used ax:99 and
     blew the ball off the side of the board before it ever touched a booster,
     so it fired ZERO boosters while claiming to prove they were capped. The
     `boosts` assertion below is what stops that happening again. */
  const gale=await run({...base, wind:[{x:0,y:0,w:480,h:800,ax:0,ay:99}]});
  const galeTop=Math.max(...gale.samples.map(s=>s.sp));
  chk(galeTop<=MECH.SPEED_CAP+1e-9,'a full-board gale alone stays under the general cap',
    `peak ${galeTop.toFixed(3)} vs cap ${MECH.SPEED_CAP.toFixed(3)}`);

  /* Boosters stacked with that gale. A booster is allowed past the general
     cap - that is the point of the boost window - but never past the boost
     ceiling, which is the speed the ball stops colliding with ramps at. */
  const stacked=await run({...base,
    boosters:[{x:240,y:200,r:30,angle:-90,speed:999},{x:240,y:120,r:30,angle:90,speed:999}],
    wind:[{x:0,y:0,w:480,h:800,ax:0,ay:99}]});
  const fired=stacked.samples[stacked.samples.length-1].boosts;
  const top=Math.max(...stacked.samples.map(s=>s.sp));
  chk(fired>0,'the stacked scenario actually reaches a booster',`${fired} fired`);
  chk(top<=MECH.BOOST_CAP+1e-9,'a booster asking for 999 and a gale stay under the boost cap',
    `peak ${top.toFixed(3)} vs boost cap ${MECH.BOOST_CAP}`);
  const plain=await run({...base});
  chk(Math.max(...plain.samples.map(s=>s.sp))<=MECH.SPEED_CAP+1e-9,
    'and an ordinary fall never reaches it, so world 1 cannot be affected');
}
await b.close();
console.log(fails?`\n${fails} FAILED`:'\nAll mechanic isolation tests passed.');
process.exit(fails?1:0);

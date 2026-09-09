/* Isolation tests for each new mechanic, on hand-made single-purpose boards. */
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
let fails=0;
const ok=(n,x='')=>console.log(`  ✓ ${n}${x?'  '+x:''}`);
const bad=(n,x='')=>{fails++;console.log(`  ✗ ${n}${x?'  '+x:''}`);};
const chk=(c,n,x='')=>c?ok(n,x):bad(n,x);

const b=await chromium.launch();
const p=await (await b.newContext()).newPage();
p.on('pageerror',e=>bad('page error',e.message));
await p.goto(pathToFileURL(path.join(root,'index.html')).href);
await p.waitForFunction(()=>!!window.__gtb);
const MECH=await p.evaluate(()=>window.__gtb.MECH);
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
  chk(Math.abs(after.vx-10)<0.4 && Math.abs(after.vy)<0.4,
    'it sets the exact configured direction and speed',`v=(${after.vx.toFixed(2)}, ${after.vy.toFixed(2)})`);
  chk(boost.samples[boost.samples.length-1].boosts===1,
    'and fires ONCE per entry, not every step it is inside',
    `${boost.samples[boost.samples.length-1].boosts} boost(s)`);
  const r2=await run({...base, boosters:[{x:240,y:300,r:30,angle:0,speed:10}]},[],7);
  chk(JSON.stringify(r2.samples.map(s=>[s.x,s.y]))===JSON.stringify(boost.samples.map(s=>[s.x,s.y])),
    'and is deterministic - a different RNG seed changes nothing');
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

console.log('\nPORTAL — paired, direction preserved, no ping-pong');
{
  const pl={...base, portals:[{id:'p1',a:{x:240,y:300,r:26},b:{x:100,y:500,r:26}}]};
  const t=await run(pl);
  const jump=t.samples.findIndex(s=>s.teleports===1);
  chk(jump>0,'the ball teleports');
  const pre=t.samples[jump-1], post=t.samples[jump];
  chk(Math.abs(post.x-100)<12,'it arrives at the paired exit',`x=${post.x.toFixed(1)}`);
  chk(Math.abs(post.vx-pre.vx)<1e-9&&Math.abs(post.vy-pre.vy)<0.4,
    'carrying its direction through unchanged');
  chk(t.samples[t.samples.length-1].teleports<=2,
    'and does not ping-pong between the pair',
    `${t.samples[t.samples.length-1].teleports} teleport(s), cooldown ${MECH.PORTAL_CD} substeps`);
  const faced=await run({...base,
    portals:[{id:'p1',a:{x:240,y:300,r:26},b:{x:100,y:400,r:26,facing:0}}]});
  const j2=faced.samples.findIndex(s=>s.teleports===1);
  chk(j2>0&&faced.samples[j2].vx>4,'an exit facing rotates the ball to it',
    `vx=${faced.samples[j2].vx.toFixed(2)} after a facing of 0 deg (right)`);
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

console.log('\nSPEED_CAP — nothing stacks into runaway speed');
{
  const stacked=await run({...base,
    boosters:[{x:240,y:200,r:30,angle:-90,speed:999},{x:240,y:120,r:30,angle:90,speed:999}],
    wind:[{x:0,y:0,w:480,h:800,ax:99,ay:99}]});
  const top=Math.max(...stacked.samples.map(s=>s.sp));
  chk(top<=MECH.SPEED_CAP+1e-9,'a booster asking for 999 and a full-board gale stay under the cap',
    `peak ${top.toFixed(3)} vs cap ${MECH.SPEED_CAP.toFixed(3)}`);
  const plain=await run({...base});
  chk(Math.max(...plain.samples.map(s=>s.sp))<=MECH.SPEED_CAP+1e-9,
    'and an ordinary fall never reaches it, so world 1 cannot be affected');
}
await b.close();
console.log(fails?`\n${fails} FAILED`:'\nAll mechanic isolation tests passed.');
process.exit(fails?1:0);

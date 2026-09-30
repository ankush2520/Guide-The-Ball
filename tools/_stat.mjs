import { loadRaw } from './levelData.mjs';
const L = await loadRaw();
const rows = L.map(l => `${l.id}\t${l.targetType}${l.wallSide?'/'+l.wallSide:''}\tT(${l.target.x},${l.target.y},r${l.target.r})\tS(${l.spawn.x},${l.spawn.y})\tmb${l.maxBlocks}\tobs${(l.obstacles||[]).length}${l.targetMove?' MOVE':''}${l.needsSpring?' SPRING':''}${l.targetGift?' GIFT':''}${(l.crabs||[]).length?' crab':''}${l.storm?' storm':''}${(l.blackholes||[]).length?' bh':''}${(l.pillars||[]).length?' pil':''}${(l.stars||[]).length?' st':''}`);
console.log(rows.join('\n'));

const fs=require('fs');
let s=fs.readFileSync('server/src/game/zoneBosses.ts','utf8');
const nl=s.includes('\r\n')?'\r\n':'\n';
const rep=(a,b)=>{ if(!s.includes(a)) throw new Error('MISS '+a.slice(0,50)); s=s.replace(a,b); };
const J=(t)=>t.split('\n').join(nl);
rep(J("    if (ab.swarm) { this.swarmCall(ab); return; }"), J("    if (ab.swarm) { this.swarmCall(ab); return; }\n    if (ab.bearers) { this.bearerCall(ab); return; }"));
rep(J("  private refreshShield() {\n    for (const s of this.stakes) if (s.dead) this.stakes.delete(s);\n    this.m.dmgTakenMul = this.stakes.size ? this.shieldMul : 1;\n  }"),
J(`  private refreshShield() {
    for (const s of this.stakes) if (s.dead) this.stakes.delete(s);
    for (const c of this.carriers) if (c.dead) this.carriers.delete(c);
    this.m.dmgTakenMul = this.stakes.size ? this.shieldMul : this.carriers.size ? this.carryShield : 1;
  }
  /** Носильщики (кольцо, bearers): идут к боссу; пока хоть один жив — урон по боссу ×carryShield. */
  private carriers = new Set<Mob>();
  private carryShield = 1;
  /**
   * Сборка (кольцо, bearers): замах — по краю арены встают count стражей (моб <босс>_bearer) и идут к боссу со скоростью speed. Пока хоть один
   * жив, босс получает урон ×shield; дошедший исчезает и лечит босса на healPct (событие zb «bearer_hit»). Убитый не лечит.
   */
  private bearerCall(ab: ZbAbility) {
    const w = this.w, m = this.m, b = ab.bearers!, epoch = this.epoch;
    const def = MOBS[\`\${m.def.id}_bearer\`];
    if (!def) return;
    this.casting = true;
    this.busyUntil = w.time + ab.windupMs + 300;
    m.unit.anim = Anim.Cast;
    if (Math.random() < 0.8) this.line(this.card.lines.abilities[ab.id]);
    w.emit({ t: "zb", id: m.id, ab: ab.id, w: 0, ms: ab.windupMs, pts: [Math.round(m.x), Math.round(m.y)], r: ab.r });
    w.later(ab.windupMs, () => {
      if (epoch !== this.epoch || m.dead) return;
      const a0 = Math.random() * Math.PI * 2;
      for (let k = 0; k < b.count; k++) {
        let spot: { x: number; y: number } | null = null;
        for (let rr = this.arena * 0.8; rr > 40 && !spot; rr -= 20) {
          const a = a0 + (k / b.count) * Math.PI * 2;
          const x = Math.round(m.home.x + Math.cos(a) * rr), y = Math.round(m.home.y + Math.sin(a) * rr);
          if (walkable(w.map, x, y, 12)) spot = { x, y };
        }
        if (!spot) continue;
        const mob = new Mob(w.uid("b"), def, m.level, spot);
        mob.summoned = true;
        w.addMob(mob);
        this.adds.add(mob);
        this.carriers.add(mob);
        w.emit({ t: "spawn", id: mob.id, k: "smoke" });
      }
      this.carryShield = b.shield;
      this.refreshShield();
      const step = () => {
        if (epoch !== this.epoch || m.dead) return;
        for (const c of this.carriers) {
          if (c.dead) continue;
          const dx = m.x - c.x, dy = m.y - c.y, d = Math.hypot(dx, dy);
          if (d <= 40) {
            w.removeMob(c);
            this.adds.delete(c);
            this.carriers.delete(c);
            m.unit.hp = Math.min(m.unit.maxHp, m.unit.hp + b.healPct * m.unit.maxHp);
            w.emit({ t: "zb", id: m.id, ab: "bearer_hit", w: 0, ms: 0, pts: [Math.round(c.x), Math.round(c.y)] });
            continue;
          }
          const go = Math.min(d - 36, (b.speed * 100) / 1000);
          c.unit.x += (dx / d) * go;
          c.unit.y += (dy / d) * go;
          c.unit.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : dy < 0 ? Dir.Up : Dir.Down;
        }
        this.refreshShield();
        if (this.carriers.size) w.later(100, step);
      };
      w.later(100, step);
    });
  }`));
rep(J("    this.stakes.clear();\n    this.m.dmgTakenMul = 1;\n    super.reset();"), J("    this.stakes.clear();\n    this.carriers.clear();\n    this.m.dmgTakenMul = 1;\n    super.reset();"));
rep(J("  override onDeath() {\n    this.stakes.clear();"), J("  override onDeath() {\n    this.stakes.clear();\n    this.carriers.clear();"));
rep(J("    for (const st of this.stakes) if (st.dead) this.stakeDied(st);"), J("    for (const st of this.stakes) if (st.dead) this.stakeDied(st);\n    for (const c of this.carriers) if (c.dead) this.refreshShield();"));
fs.writeFileSync('server/src/game/zoneBosses.ts',s);
console.log('ok');

#!/usr/bin/env python3
# Playwright screenshot harness for the CravAche visual overhaul. Boots the game,
# seeds a full office via G.* hooks, captures the scenes the spec checklist needs.
import sys, time
from playwright.sync_api import sync_playwright

URL = "http://localhost:8077/"
OUT = "_shots/audit3/"

SEED = r"""
(() => {
  // start a fresh run
  if (document.getElementById('btn-start')) document.getElementById('btn-start').click();
  const s = G.state;
  s.week = 3;                 // unlock production
  s.day = 2;
  // build a roster across all four depts seated at desks, most working.
  const DESKS = G.render.office.DESKS;
  // pull staffers from data (starting + pool)
  const pool = [].concat(G.data.staff).map(d => G.makeStaffer ? G.makeStaffer(JSON.parse(JSON.stringify(d))) : JSON.parse(JSON.stringify(d)));
  // group desk indices by dept
  const byDept = {designer:[],editor:[],content:[],production:[]};
  DESKS.forEach((d,i)=>{ if(byDept[d.dept]) byDept[d.dept].push(i); });
  s.staff = [];
  let bid = 0;
  function mkBrief(role){
    bid++;
    const b = { id:'seed_'+bid, clientId:(G.data.clients[0]||{}).id||'x', title:'Seed Brief '+bid,
      ask:'do the thing', finePrint:[], fee:80000, role:role,
      deadlineLeft: 30+Math.random()*40, deadlineTotal:70, workDone: 20+Math.random()*50, workNeeded:100,
      status:'assigned' };
    if(G.state.briefs) G.state.briefs.push(b);
    return b;
  }
  // ensure a briefs array exists where byId can find them
  if(!G.state.briefs) G.state.briefs = [];
  const origById = G.briefs.byId;
  G.briefs.byId = function(id){ var r = origById ? origById(id) : null; if(r) return r; return G.state.briefs.find(x=>x.id===id)||null; };

  let count = 0;
  const want = 12;
  for (const dept of ['designer','editor','content','production']) {
    const cand = pool.filter(p=>p.dept===dept);
    const desks = byDept[dept];
    for (let k=0; k<desks.length && count<want; k++) {
      const c = cand[k % Math.max(1,cand.length)];
      if(!c) continue;
      const st = JSON.parse(JSON.stringify(c));
      st.desk = desks[k];
      st.burnout = 20 + Math.random()*55;
      st.badges = st.badges || [];
      // ~70% are mid-brief (working) so laptops glow
      if (Math.random() < 0.75) {
        const b = mkBrief(dept);
        st.briefId = b.id;
      } else { st.briefId = null; }
      s.staff.push(st);
      count++;
    }
  }
  G.dock.refreshTray && G.dock.refreshTray();
  return s.staff.length;
})()
"""

def set_time(page, mode):
    # set time, then suppress any 6PM-call/event modal so the ROOM is visible.
    js = {
      'morning': "G.state.night=false; G.state.dayT = G.BAL.DAY_REAL_SECONDS*0.12;",
      'sunset':  "G.state.night=false; G.state.dayT = G.BAL.DAY_REAL_SECONDS*0.80;",
      'night':   "G.state.night=true; G.state.nightT = (G.BAL.NIGHT_REAL_SECONDS||30)*0.4;",
    }[mode]
    page.evaluate(js)
    page.evaluate("""(()=>{
      G.state.activeCall=null; G.state.paused=false; G.state._officeEventAt=null;
      G.state.callFiredToday=true; G.state.officeEventToday=true;
      var mr=document.getElementById('modal-root'); if(mr){mr.classList.add('hidden'); mr.innerHTML='';}
      var dim=document.getElementById('dim'); if(dim) dim.classList.add('hidden');
    })()""")

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={'width':1366,'height':768}, device_scale_factor=1)
        page.goto(URL)
        page.wait_for_timeout(1200)
        n = page.evaluate(SEED)
        print("seeded staff:", n)
        page.wait_for_timeout(800)

        for mode in ['morning','sunset','night']:
            set_time(page, mode)
            page.wait_for_timeout(700)
            page.screenshot(path=OUT+f"office_{mode}.png")
            print("shot", mode)

        # back to morning for the rest
        set_time(page,'morning')
        page.wait_for_timeout(400)
        page.screenshot(path=OUT+"full_staffed.png")

        # --- cooler gossip at the new spot ---
        page.evaluate("""(()=>{
          G.state.upgrades.cooler=true;
          // force two idle staffers to the cooler
          var idle = G.state.staff.filter(s=>!s.briefId);
          idle.slice(0,2).forEach((s,i)=>{ s.away=null; });
          if(G.wander && G.wander.gather){ G.wander.gather(2); }
          // advance their trip to the chatting state
          for(var k=0;k<60;k++) G.wander.update(0.1);
        })()""")
        page.wait_for_timeout(500)
        page.screenshot(path=OUT+"cooler_gossip.png")
        print("shot cooler")

        # --- drag highlight: simulate a brief being dragged over a desk ---
        page.evaluate("""(()=>{
          // make a tray brief and start a fake drag hovering an eligible desk
          var b={id:'dragb',clientId:(G.data.clients[0]||{}).id,title:'Drag Me',ask:'x',
                 finePrint:[],fee:90000,role:'designer',deadlineLeft:50,deadlineTotal:60,
                 workDone:0,workNeeded:100,status:'tray'};
          G.state.briefs.push(b);
          G.dock.dragging=b;
          // find a designer desk with an idle eligible staffer
          var DESKS=G.render.office.DESKS;
          for(var i=0;i<DESKS.length;i++){
            var st=G.staff.atDesk(i);
            if(DESKS[i].dept==='designer' && st && !st.briefId){ G.dock.dragHoverDesk=i; break; }
          }
        })()""")
        page.wait_for_timeout(400)
        page.screenshot(path=OUT+"drag_highlight.png")
        page.evaluate("G.dock.dragging=null; G.dock.dragHoverDesk=-1;")
        print("shot drag")

        # --- toast collapse: queue 5 brief toasts ---
        page.evaluate("""(()=>{
          for(var i=0;i<5;i++){
            G.dock.showBriefToast({clientId:(G.data.clients[i%G.data.clients.length]||{}).id,
              title:'Brief Offer '+(i+1), ask:'urgent thing '+(i+1), role:'designer',
              fee:70000+i*10000, deadlineDays:2, difficulty:3, finePrint:['CEO hates blue.']},
              function(){});
          }
        })()""")
        page.wait_for_timeout(500)
        page.screenshot(path=OUT+"toast_collapse.png")
        print("shot toasts")

        # --- a modal open (hire) ---
        page.evaluate("""(()=>{
          var mr=document.getElementById('modal-root'); if(mr){mr.classList.add('hidden'); mr.innerHTML='';}
          G.modals.showHire && G.modals.showHire();
        })()""")
        page.wait_for_timeout(500)
        page.screenshot(path=OUT+"hire_modal.png")
        print("shot modal")

        b.close()

if __name__ == "__main__":
    main()

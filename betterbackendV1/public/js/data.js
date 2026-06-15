// CravAche — data loader. Parallel-build contract (DESIGN.md):
// content/*.json and art/manifest.json may NOT EXIST yet. This file must run
// perfectly without them: inline sample dataset below + colored-rect/emoji
// fallback for every sprite key. Dropping the real files in is a pure data
// swap, zero code changes here or anywhere else.
//
// Fine-print contract (verdict.js depends on this): a staffer CONFLICTS with a
// brief when brief.extraTags includes the staffer's traitTag. Content authors
// keep extraTags machine-readable; finePrint[] is the human-readable warning.
// Staff contract: first 2 entries of staff.json are the starting hires, the
// rest are the hire pool, in order.
(function(){
  'use strict';
  window.G = window.G || {};

  // ---------- inline sample dataset (used only when content/*.json missing) ----------
  var SAMPLE_CLIENTS = [
    { id:"chaiyos", name:"Chaiyos", industry:"tea cafe chain", personality:"sweet until the invoice",
      patience:3, tier:"local", quotes:[
        "Make it viral. We have budget for one boost of 500 rupees.",
        "My nephew said the logo should be bigger. He is in class 8 but very creative.",
        "Can the tea look hotter? Steam is our brand promise."
      ]},
    { id:"vistaara", name:"Vistaara Bank", industry:"private bank", personality:"legal reviews everything twice",
      patience:2, tier:"local", quotes:[
        "Compliance has approved the word 'growth'. Please build the campaign around it.",
        "The CEO hates blue. Yes we are a bank. Find a way.",
        "Can we say number one without saying number one?"
      ]},
    { id:"glowmaxx", name:"GlowMaxx", industry:"skincare D2C", personality:"pivots weekly, pays monthly",
      patience:4, tier:"local", quotes:[
        "We are no longer a cream. We are a ritual. Update everything.",
        "The founder wants to be in the ad. And her dog. The dog is non negotiable.",
        "Make it premium but also mass. You know?"
      ]}
  ];

  var SAMPLE_BRIEFS = [
    { id:"b_chai_reel", clientId:"chaiyos", title:"Monsoon Chai Reel",
      ask:"A 15 second reel where rain and chai have a love story.",
      finePrint:["Founder hates slow motion. Says it is 'lazy editing'."],
      fee:80000, deadlineDays:2, difficulty:2, extraTags:["slowmo_lover"], role:"editor" },
    { id:"b_bank_blue", clientId:"vistaara", title:"Rebrand Teaser",
      ask:"Announce the new identity. Modern, trustworthy, exciting, safe, bold, calm.",
      finePrint:["CEO hates blue. The brand book is 90% blue. Handle it."],
      fee:300000, deadlineDays:3, difficulty:5, extraTags:["blue_only"], role:"designer" },
    { id:"b_glow_dog", clientId:"glowmaxx", title:"Founder + Dog Film",
      ask:"Brand film starring the founder and Biscuit the labrador.",
      finePrint:["Biscuit gets top billing. This is in writing."],
      fee:150000, deadlineDays:2, difficulty:3, extraTags:[], role:"production" },
    { id:"b_chai_menu", clientId:"chaiyos", title:"Menu Redesign Post",
      ask:"One static post announcing 4 new flavours. Nephew has shared a reference.",
      finePrint:[],
      fee:50000, deadlineDays:1, difficulty:1, extraTags:[], role:"designer" },
    { id:"b_bank_fd", clientId:"vistaara", title:"FD Rates Carousel",
      ask:"Make fixed deposit interest rates feel like a Marvel trailer.",
      finePrint:["Legal must see every frame. Allow 4 working days. Deadline is 2."],
      fee:120000, deadlineDays:2, difficulty:4, extraTags:["skips_legal"], role:"designer" },
    { id:"b_glow_ritual", clientId:"glowmaxx", title:"The Ritual Launch",
      ask:"We pivoted again. Launch 'The Ritual'. No product shots, only vibes.",
      finePrint:["Founder wants 'vibes' but will ask where the product is."],
      fee:200000, deadlineDays:3, difficulty:4, extraTags:[], role:"content" }
  ];

  var SAMPLE_STAFF = [
    { id:"s_meera", name:"Meera", dept:"designer", level:"junior", skill:3, salaryMonthly:45000,
      trait:"Fast but sloppy. Skips legal review emails.", traitTag:"skips_legal", portraitKey:"char1",
      badges:[{ icon:"🎨", label:"Dependable Hands", desc:"Shows up, ships." }] },
    { id:"s_arjun", name:"Arjun", dept:"editor", level:"junior", skill:4, salaryMonthly:60000,
      trait:"Everything becomes slow motion. Everything.", traitTag:"slowmo_lover", portraitKey:"char2",
      badges:[{ icon:"🎵", label:"Beat Cutter", desc:"Reels feel expensive." }] },
    { id:"s_tanvi", name:"Tanvi", dept:"content", level:"junior", skill:2, salaryMonthly:35000,
      trait:"Junior. Hungry. Uses blue in every deck.", traitTag:"blue_only", portraitKey:"char3",
      badges:[{ icon:"✍️", label:"Option Machine", desc:"Volume is a strategy." }] }
  ];

  var SAMPLE_EVENTS = [
    { id:"e_call_feedback", type:"call",
      text:"It is the client. 'Quick call, 2 minutes max.' It will not be 2 minutes.",
      options:[
        { label:"Take the call", effects:{ chaos:-2 } },
        { label:"Let it ring", effects:{ relationship:-1, chaos:8 } }
      ]},
    { id:"e_scope_reel", type:"scopecreep",
      text:"'Loving the direction! Small thing. Can we also get a reel out of this? Same budget obviously.'",
      options:[
        { label:"Say yes", effects:{ workload:30, chaos:3 } },
        { label:"Push back", effects:{ relationship:-1, chaos:5 } }
      ]},
    { id:"e_office_wifi", type:"office",
      text:"The wifi died mid upload. The intern suggests turning the building off and on again.",
      options:[
        { label:"Hotspot everyone (₹2,000)", effects:{ money:-2000 } },
        { label:"Wait it out", effects:{ chaos:6 } }
      ]},
    { id:"e_office_award", type:"office",
      text:"An awards entry form appeared. 'Best Use Of Budget We Did Not Have' category. Entry fee applies.",
      options:[
        { label:"Enter (₹5,000)", effects:{ money:-5000, rep:3 } },
        { label:"Awards are a scam", effects:{ chaos:1 } }
      ]},
    { id:"e_burnout_warn", type:"burnoutwarn",
      text:"A staffer has started laughing at their own screen. Not in a good way.",
      options:[
        { label:"Chai break for all (₹500)", effects:{ money:-500, chaos:-3 } },
        { label:"Deadlines first", effects:{ chaos:4 } }
      ]}
  ];

  // ---------- sprite fallbacks: every key the renderer may ask for ----------
  // Colored rect + emoji glyph; real art replaces this via art/manifest.json.
  var SPRITE_FALLBACKS = {
    office_bg_shoebox: { color:"#23304a", emoji:"" },
    desk:              { color:"#7a4a21", emoji:"🖥️" },
    monitor_on:        { color:"#16203a", emoji:"💻" },
    char1:             { color:"#c98f4e", emoji:"🧑‍🎨" },
    char2:             { color:"#9fe8ff", emoji:"🧑‍💻" },
    char3:             { color:"#d35d6e", emoji:"✍️" },
    char4:             { color:"#7ee08a", emoji:"🧑‍🚀" },
    char5:             { color:"#ffe066", emoji:"🕴️" },
    char6:             { color:"#ff9a56", emoji:"🧙" },
    plant:             { color:"#2e7d3a", emoji:"🪴" },
    coffee_machine:    { color:"#473f2f", emoji:"☕" },
    phone_prop:        { color:"#ff5c5c", emoji:"☎️" },
    award_trophy:      { color:"#ffe066", emoji:"🏆" },
    ui_frame_9slice:   { color:"#23304a", emoji:"" },
    logo_cravache:     { color:"#ffe066", emoji:"📣" },
    fire_overlay:      { color:"#ff5c5c", emoji:"🔥" }
  };

  var data = {
    clients: SAMPLE_CLIENTS,
    briefs: SAMPLE_BRIEFS,
    staff: SAMPLE_STAFF,
    events: SAMPLE_EVENTS,
    manifest: {},          // art/manifest.json {key:{file,w,h,frames}}
    images: {},            // key -> HTMLImageElement (loaded ok)
    usingSampleContent: true,
    usingFallbackArt: true
  };

  function fetchJSON(url){
    return fetch(url).then(function(r){
      if(!r.ok) throw new Error(url + " " + r.status);
      return r.json();
    });
  }

  // optional load: resolve null on any failure, never reject
  function tryLoad(url){
    return fetchJSON(url).catch(function(){ return null; });
  }

  function loadImage(src){
    return new Promise(function(res){
      var img = new Image();
      img.onload = function(){ res(img); };
      img.onerror = function(){ res(null); };
      img.src = src;
    });
  }

  G.data = {
    get clients(){ return data.clients; },
    get briefs(){ return data.briefs; },
    get staff(){ return data.staff; },
    get events(){ return data.events; },
    get usingSampleContent(){ return data.usingSampleContent; },

    clientById: function(id){
      for(var i=0;i<data.clients.length;i++) if(data.clients[i].id===id) return data.clients[i];
      return null;
    },

    eventsByType: function(type){
      return data.events.filter(function(e){ return e.type === type; });
    },

    // sprite info for the renderer: {img} or {color, emoji}
    sprite: function(key){
      if(data.images[key]) return { img: data.images[key], meta: data.manifest[key] };
      return SPRITE_FALLBACKS[key] || { color:"#473f2f", emoji:"❓" };
    },
    hasArt: function(key){ return !!data.images[key]; },

    load: function(){
      return Promise.all([
        tryLoad('content/clients.json'),
        tryLoad('content/briefs.json'),
        tryLoad('content/staff.json'),
        tryLoad('content/events.json'),
        tryLoad('art/manifest.json')
      ]).then(function(res){
        var clients = res[0], briefs = res[1], staff = res[2], events = res[3], manifest = res[4];
        // fetch blocked (file:// double-click)? fall back to the embedded
        // snapshot (js/embed-data.js, regenerate with: node tools/embed.js)
        var em = G.EMBED || {};
        clients = clients || em.clients; briefs = briefs || em.briefs;
        staff = staff || em.staff; events = events || em.events;
        manifest = manifest || em.manifest;
        if(clients && clients.length) data.clients = clients;
        if(briefs && briefs.length) data.briefs = briefs;
        if(staff && staff.length) data.staff = staff;
        if(events && events.length) data.events = events;
        data.usingSampleContent = !(clients && briefs && staff && events);
        if(data.usingSampleContent)
          console.log('[CravAche] content/*.json missing or partial, running on inline sample dataset (by design).');

        // economy: scale all client fees once at load (display + payout agree)
        var mult = (G.BAL && G.BAL.FEE_GLOBAL_MULT) || 1;
        if(mult !== 1 && !data._feesScaled){
          data._feesScaled = true;
          data.briefs.forEach(function(b){ b.fee = Math.round(b.fee * mult / 500) * 500 || 500; });
        }

        if(manifest){
          data.manifest = manifest;
          var keys = Object.keys(manifest);
          return Promise.all(keys.map(function(k){
            return loadImage('art/' + manifest[k].file).then(function(img){
              if(!img) return;
              data.images[k] = img;
              // alias underscore-less keys: staff portraitKey "char1" -> art "char_1"
              var alias = k.replace(/_/g, '');
              if(alias !== k && !manifest[alias]){
                data.images[alias] = img;
                data.manifest[alias] = manifest[k];
              }
            });
          })).then(function(){
            data.usingFallbackArt = Object.keys(data.images).length === 0;
          });
        }
        console.log('[CravAche] art/manifest.json missing, rendering colored-rect + emoji fallbacks (by design).');
      });
    }
  };
})();

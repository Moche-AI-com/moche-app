/* Moche.AI — interactions */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;

  /* ---- THEME TOGGLE (no localStorage in sandbox — session variable) ---- */
  var theme = 'dark';
  function iconFor(t){
    return t === 'dark'
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  }
  var toggles = document.querySelectorAll('[data-theme-toggle]');
  function applyTheme(t){
    theme = t; root.setAttribute('data-theme', t);
    toggles.forEach(function(b){ b.innerHTML = iconFor(t); b.setAttribute('aria-label', t==='dark'?'Switch to light mode':'Switch to dark mode'); });
  }
  applyTheme('dark');
  toggles.forEach(function(b){ b.addEventListener('click', function(){ applyTheme(theme==='dark'?'light':'dark'); }); });

  /* ---- NAV scrolled state ---- */
  var nav = document.getElementById('nav');
  function onScroll(){ if(window.scrollY > 24) nav.classList.add('scrolled'); else nav.classList.remove('scrolled'); }
  onScroll(); window.addEventListener('scroll', onScroll, {passive:true});

  /* ---- MOBILE drawer ---- */
  var menuBtn = document.getElementById('menuBtn');
  var drawer = document.getElementById('drawer');
  if(menuBtn){
    menuBtn.addEventListener('click', function(){
      var open = drawer.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open?'true':'false');
    });
    drawer.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){ drawer.classList.remove('open'); menuBtn.setAttribute('aria-expanded','false'); });
    });
  }

  /* ---- SCROLL REVEAL (opacity/transform only, IO) ---- */
  var reveals = document.querySelectorAll('[data-reveal]');
  if(reduce){ reveals.forEach(function(el){ el.classList.add('in'); }); }
  else {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, {threshold:0.12, rootMargin:'0px 0px -8% 0px'});
    // stagger siblings a touch
    reveals.forEach(function(el, i){
      var d = (i % 6) * 60; el.style.transitionDelay = d + 'ms';
      io.observe(el);
    });
  }

  /* ---- HERO parallax (transform on decorative img only) ---- */
  var heroImg = document.querySelector('.hero-img');
  if(heroImg && !reduce){
    var ticking = false;
    window.addEventListener('scroll', function(){
      if(!ticking){
        window.requestAnimationFrame(function(){
          var y = window.scrollY;
          if(y < 1000){ heroImg.style.transform = 'translate3d(0,' + (y * 0.18) + 'px,0) scale(1.06)'; }
          ticking = false;
        });
        ticking = true;
      }
    }, {passive:true});
    heroImg.style.transform = 'scale(1.06)';
  }

  /* ---- ANIMATED COUNTERS ---- */
  var counters = document.querySelectorAll('[data-count]');
  function animateCount(el){
    var target = parseFloat(el.getAttribute('data-count'));
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    if(reduce){ el.textContent = prefix + target + suffix; return; }
    var dur = 1400, start = null;
    function frame(ts){
      if(!start) start = ts;
      var p = Math.min((ts - start)/dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased) + suffix;
      if(p < 1) requestAnimationFrame(frame);
      else el.textContent = prefix + target + suffix;
    }
    requestAnimationFrame(frame);
  }
  var cio = new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if(e.isIntersecting){ animateCount(e.target); cio.unobserve(e.target); } });
  }, {threshold:0.5});
  counters.forEach(function(c){ cio.observe(c); });

  /* ---- SCROLL PROGRESS BAR ---- */
  var progress = document.getElementById('progress');
  if(progress){
    var pTicking = false;
    function updateProgress(){
      var st = window.scrollY || document.documentElement.scrollTop;
      var h = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      var pct = h > 0 ? (st / h) * 100 : 0;
      progress.style.width = pct + '%';
      pTicking = false;
    }
    window.addEventListener('scroll', function(){
      if(!pTicking){ window.requestAnimationFrame(updateProgress); pTicking = true; }
    }, {passive:true});
    updateProgress();
  }

  /* ---- MOUSE-REACTIVE GLOW (hover-capable devices only) ---- */
  var hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var glow = document.querySelector('.mouse-glow');
  if(glow && hoverCapable && !reduce){
    var gx = 0, gy = 0, gRaf = 0;
    window.addEventListener('pointermove', function(e){
      gx = e.clientX; gy = e.clientY;
      if(!gRaf){
        gRaf = requestAnimationFrame(function(){
          glow.style.transform = 'translate(' + gx + 'px,' + gy + 'px) translate(-50%,-50%)';
          glow.style.opacity = '1';
          gRaf = 0;
        });
      }
    }, {passive:true});
    window.addEventListener('pointerleave', function(){ glow.style.opacity = '0'; });
    document.addEventListener('mouseleave', function(){ glow.style.opacity = '0'; });
  }

  /* ---- HERO DASHBOARD mouse parallax (depth layers) ---- */
  var heroDash = document.querySelector('[data-hero-dash]');
  var heroStage = document.querySelector('.hero-stage');
  if(heroStage && heroDash && hoverCapable && !reduce){
    var depthEls = heroStage.querySelectorAll('[data-depth]');
    var pRaf = 0, tx = 0, ty = 0;
    heroStage.addEventListener('pointermove', function(e){
      var r = heroStage.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5);
      ty = ((e.clientY - r.top) / r.height - 0.5);
      if(!pRaf){
        pRaf = requestAnimationFrame(function(){
          depthEls.forEach(function(el){
            var d = parseFloat(el.getAttribute('data-depth')) || 0.5;
            el.style.transform = 'translate3d(' + (tx * d * -14) + 'px,' + (ty * d * -14) + 'px,0)';
          });
          pRaf = 0;
        });
      }
    }, {passive:true});
    heroStage.addEventListener('pointerleave', function(){
      depthEls.forEach(function(el){ el.style.transform = ''; });
    });
  }

  /* ---- 3D TILT on feature cards (desktop hover only) ---- */
  if(hoverCapable && !reduce){
    var tiltCards = document.querySelectorAll('.bento .cell');
    tiltCards.forEach(function(card){
      card.classList.add('tilt');
      var tRaf = 0;
      card.addEventListener('pointermove', function(e){
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        if(!tRaf){
          tRaf = requestAnimationFrame(function(){
            card.style.setProperty('--ry', (px * 6) + 'deg');
            card.style.setProperty('--rx', (py * -6) + 'deg');
            tRaf = 0;
          });
        }
      });
      card.addEventListener('pointerleave', function(){
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--rx', '0deg');
      });
    });
  }

  /* ---- PHONE DEVICE state cycle ---- */
  var phoneStates = document.querySelectorAll('[data-phone-state]');
  if(phoneStates.length && !reduce){
    var pIdx = 0, phoneTimer = null;
    function cyclePhone(){
      phoneStates[pIdx].classList.remove('is-active');
      pIdx = (pIdx + 1) % phoneStates.length;
      phoneStates[pIdx].classList.add('is-active');
    }
    var phoneEl = document.querySelector('[data-phone]');
    var phoneVisible = false;
    var pObs = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        phoneVisible = en.isIntersecting;
        if(phoneVisible && !phoneTimer){ phoneTimer = setInterval(cyclePhone, 4600); }
        else if(!phoneVisible && phoneTimer){ clearInterval(phoneTimer); phoneTimer = null; }
      });
    }, {threshold:0.2});
    if(phoneEl) pObs.observe(phoneEl);
  }

  /* ---- METRIC RINGS (conic fill on view) ---- */
  var rings = document.querySelectorAll('.ring[data-ring]');
  if(rings.length){
    var rObs = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(!en.isIntersecting) return;
        var el = en.target;
        var target = parseFloat(el.getAttribute('data-ring')) || 0;
        if(reduce){ el.style.setProperty('--val', target); rObs.unobserve(el); return; }
        var start = null, dur = 1300;
        function frame(ts){
          if(!start) start = ts;
          var p = Math.min((ts - start) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.style.setProperty('--val', (target * eased).toFixed(1));
          if(p < 1) requestAnimationFrame(frame);
          else el.style.setProperty('--val', target);
        }
        requestAnimationFrame(frame);
        rObs.unobserve(el);
      });
    }, {threshold:0.4});
    rings.forEach(function(r){ rObs.observe(r); });
  }

  /* ---- AMBIENT AI-NETWORK CANVAS (sparse, desktop only) ---- */
  var canvas = document.getElementById('net-canvas');
  if(canvas && hoverCapable && !reduce && window.innerWidth > 900){
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W, H, nodes = [], rafId = 0, running = true;
    function resize(){
      W = canvas.width = Math.floor(window.innerWidth * dpr);
      H = canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    }
    function makeNodes(){
      var count = Math.min(48, Math.round(window.innerWidth / 34));
      nodes = [];
      for(var i=0;i<count;i++){
        nodes.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.10 * dpr,
          vy: (Math.random() - 0.5) * 0.10 * dpr,
          r: (Math.random() * 1.3 + 0.6) * dpr
        });
      }
    }
    var palette = ['51,230,212','124,140,255','230,240,255'];
    function draw(){
      if(!running){ return; }
      ctx.clearRect(0,0,W,H);
      var linkDist = 150 * dpr;
      for(var i=0;i<nodes.length;i++){
        var n = nodes[i];
        n.x += n.vx; n.y += n.vy;
        if(n.x < 0 || n.x > W) n.vx *= -1;
        if(n.y < 0 || n.y > H) n.vy *= -1;
        var col = palette[i % palette.length];
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(' + col + ',0.35)';
        ctx.fill();
        for(var j=i+1;j<nodes.length;j++){
          var m = nodes[j];
          var dx = n.x - m.x, dy = n.y - m.y;
          var dist = Math.sqrt(dx*dx + dy*dy);
          if(dist < linkDist){
            var a = (1 - dist/linkDist) * 0.10;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y); ctx.lineTo(m.x, m.y);
            ctx.strokeStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')';
            ctx.lineWidth = 0.6 * dpr;
            ctx.stroke();
          }
        }
      }
      rafId = requestAnimationFrame(draw);
    }
    resize(); makeNodes(); draw();
    var rTimer;
    window.addEventListener('resize', function(){
      clearTimeout(rTimer);
      rTimer = setTimeout(function(){ resize(); makeNodes(); }, 200);
    }, {passive:true});
    // pause when tab hidden to save CPU
    document.addEventListener('visibilitychange', function(){
      running = !document.hidden;
      if(running && !rafId){ draw(); }
      else if(!running){ cancelAnimationFrame(rafId); rafId = 0; }
    });
  }

  /* ---- FAQ: single-open accordion ---- */
  var faqs = document.querySelectorAll('.faq-item');
  faqs.forEach(function(item){
    item.addEventListener('toggle', function(){
      if(item.open){ faqs.forEach(function(o){ if(o!==item) o.open=false; }); }
    });
  });

  /* ---- SIGNUP form ---- */
  var form = document.getElementById('signupForm');
  var msg = document.getElementById('formMsg');
  if(form){
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var email = document.getElementById('email');
      var props = document.getElementById('properties');
      msg.className = 'form-msg';
      var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if(!re.test(email.value.trim())){ msg.className='form-msg err'; msg.textContent='Please enter a valid email address.'; email.focus(); return; }
      if(!props.value){ msg.className='form-msg err'; msg.textContent='Let us know how many properties you host.'; props.focus(); return; }
      var btn = document.getElementById('submitBtn');
      btn.disabled = true; btn.textContent = 'Taking you to sign up…';
      // Carry the email into the real host signup flow (no fake waitlist).
      window.location.href = '/signup?email=' + encodeURIComponent(email.value.trim());
    });
  }
})();

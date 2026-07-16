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

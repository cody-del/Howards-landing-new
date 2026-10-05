const gallery = document.querySelector('.shutter-gallery');
const viewport = gallery.querySelector('.shutter-gallery-viewport');
const track = gallery.querySelector('.shutter-gallery-track');
const slides = [...track.children];
const dots = [...gallery.querySelectorAll('.shutter-gallery-dot')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const cloneCount = 2;
let selected = 0;
let physical = cloneCount;
let moving = false;
let settleTimer;

// Two copies at each end keep both neighboring photos visible during wraparound.
function cloneSlide(slide) {
  const clone = slide.cloneNode(true);
  clone.dataset.clone = 'true';
  clone.classList.remove('is-selected');
  clone.setAttribute('aria-hidden', 'true');
  clone.querySelector('img').loading = 'eager';
  return clone;
}
track.prepend(...slides.slice(-cloneCount).map(cloneSlide));
track.append(...slides.slice(0, cloneCount).map(cloneSlide));
const renderedSlides = [...track.children];

function position(animate) {
  track.classList.toggle('is-resetting', !animate);
  const width = slides[0].getBoundingClientRect().width;
  track.style.transform = `translateX(${(viewport.clientWidth - width) / 2 - physical * width}px)`;
  renderedSlides.forEach((slide, index) => {
    slide.classList.toggle('is-selected', index === physical);
    slide.setAttribute('aria-hidden', String(slide.dataset.clone === 'true' || index !== physical));
  });
  dots.forEach((dot, index) => {
    if (index === selected) dot.setAttribute('aria-current', 'true');
    else dot.removeAttribute('aria-current');
  });
  gallery.querySelector('.gallery-announcement').textContent = `Photo ${selected + 1} of ${slides.length}: ${slides[selected].querySelector('img').alt}`;
}
function settle() {
  clearTimeout(settleTimer);
  moving = false;
  physical = selected + cloneCount;
  position(false);
}
function show(index) {
  if (moving) return;
  const next = (index + slides.length) % slides.length;
  if (next === selected) return;
  // Adjacent steps can land on an end copy; after the transition, reset invisibly.
  physical = index === selected - 1 || index === selected + 1 ? physical + (index - selected) : next + cloneCount;
  selected = next;
  if (reducedMotion.matches) { settle(); return; }
  moving = true;
  void track.offsetWidth;
  position(true);
  settleTimer = setTimeout(settle, 500);
}
track.addEventListener('transitionend', event => {
  if (event.target === track && event.propertyName === 'transform') settle();
});
gallery.querySelectorAll('[data-direction]').forEach(button => button.addEventListener('click', () => show(selected + Number(button.dataset.direction))));
dots.forEach((dot, index) => dot.addEventListener('click', () => show(index)));
gallery.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    show(selected + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
let pointerStart;
viewport.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  pointerStart = {x: event.clientX, y: event.clientY};
  viewport.setPointerCapture(event.pointerId);
});
viewport.addEventListener('pointerup', event => {
  if (!pointerStart) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  pointerStart = undefined;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(selected + (dx < 0 ? 1 : -1));
});
viewport.addEventListener('pointercancel', () => { pointerStart = undefined; });
new ResizeObserver(settle).observe(viewport);
reducedMotion.addEventListener('change', settle);
settle();

// Static HTML needs its scroll effects initialized here, in the browser.
if ('IntersectionObserver' in window) {
  const cards = document.querySelectorAll('.hardwood-value-card, .shutter-gallery');
  const mobile = window.matchMedia('(max-width: 700px), (hover: none)');
  let highlightObserver;

  function updateHighlights() {
    highlightObserver?.disconnect();
    cards.forEach(card => card.classList.remove('is-scroll-highlighted'));
    if (!mobile.matches) return;

    highlightObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        entry.target.classList.toggle('is-scroll-highlighted',
          entry.isIntersecting && entry.intersectionRatio >= 0.35);
      });
    }, {rootMargin: '-15% 0px -15% 0px', threshold: [0, 0.35]});
    cards.forEach(card => highlightObserver.observe(card));
  }

  updateHighlights();
  mobile.addEventListener('change', updateHighlights);
}

const form=document.querySelector('.hardwood-form');form.addEventListener('submit',e=>{e.preventDefault();const status=form.querySelector('.form-status');status.hidden=false;status.textContent='This preview form is not connected yet. Please call (303) 449-4337. Your details have not been sent.';});

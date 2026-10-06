(() => {
 const section=document.querySelector('.google-reviews');
 if(!section)return;
 const track=section.querySelector('.review-track');
 const previous=section.querySelector('[data-review-direction="-1"]');
 const next=section.querySelector('[data-review-direction="1"]');
 const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
 section.classList.add('reviews-ready');
 const update=()=>{
  previous.disabled=track.scrollLeft<=2;
  next.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;
 };
 const move=direction=>{
  const gap=parseFloat(getComputedStyle(track).columnGap);
  const step=track.firstElementChild.getBoundingClientRect().width+gap;
  const visible=Math.max(1,Math.floor((track.clientWidth+gap)/step));
  track.scrollBy({left:direction*step*visible,behavior:reducedMotion.matches?'instant':'smooth'});
 };
 previous.addEventListener('click',()=>move(-1));
 next.addEventListener('click',()=>move(1));
 track.addEventListener('scroll',update,{passive:true});
 track.addEventListener('keydown',event=>{
  if(event.target!==track||!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();move(event.key==='ArrowLeft'?-1:1);
 });
 section.querySelectorAll('.review-expand').forEach(button=>{
  button.addEventListener('click',()=>{
   const expanded=button.getAttribute('aria-expanded')!=='true';
   button.setAttribute('aria-expanded',String(expanded));
   document.getElementById(button.getAttribute('aria-controls')).classList.toggle('is-expanded',expanded);
   button.firstChild.textContent=expanded?'Read less':'Read more';
  });
 });
 new ResizeObserver(update).observe(track);update();
})();

/* Picomart bird: SVG mascot custom element; adapted from the supplied Picomart bird animation. */
(()=>{
const template="<style>\n:host{position:fixed;inset:0;pointer-events:none!important;z-index:1000;display:block;overflow:visible}\n.mascot{position:absolute;left:0;top:0;width:110px;height:80px;transform-origin:0 0;pointer-events:none;will-change:transform}\n.bird{display:block;width:110px;height:80px;overflow:visible;transform-origin:49px 51px;filter:drop-shadow(0 1px 1px #19223530)}\n.bird{pointer-events:none;outline:none}\n.bird path,.bird circle,.bird ellipse{pointer-events:visiblePainted;cursor:pointer}\n.bird:focus-visible{outline:none;filter:drop-shadow(0 0 3px #bda5ef)}\n.neck{transform-origin:62px 35px}\n.eye{transform-box:fill-box;transform-origin:center}\n.wing{transform-origin:50px 29px}\n.far{opacity:.55}\n.flight-feathers{display:none}\n.flying .folded-feathers{display:none}\n.flying .flight-feathers{display:block}\n.flying .wing{animation:picomart-bird-flap .72s cubic-bezier(.45,0,.35,1) infinite}\n.flying .far{animation-delay:-.08s}\n.flying .feet,.flying .contact-shadow{opacity:0}\n.tail{transform-origin:36px 35px}\n.tap{position:absolute;box-sizing:border-box;width:20px;height:20px;border:1.5px solid #cbb7f4;border-radius:50%;opacity:0;pointer-events:none;transform-origin:center}\n@keyframes picomart-bird-flap{0%,100%{transform:rotate(-24deg) scaleY(1)}50%{transform:rotate(18deg) scaleY(-.65)}}\n@media(prefers-reduced-motion:reduce){.flying .wing{animation:none}}\n@media print{:host{display:none}}\n</style>\n<div class=\"mascot\">\n<svg class=\"bird\" width=\"110\" height=\"80\" viewBox=\"0 0 110 80\" fill=\"none\" role=\"button\" tabindex=\"0\" aria-label=\"Make the bird fly\">\n<defs>\n <linearGradient id=\"bird-body\" x1=\"52\" y1=\"22\" x2=\"59\" y2=\"45\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#fffdf8\"/><stop offset=\".58\" stop-color=\"#f6f5f0\"/><stop offset=\"1\" stop-color=\"#dce1e6\"/></linearGradient>\n <linearGradient id=\"bird-wing\" x1=\"47\" y1=\"23\" x2=\"58\" y2=\"42\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#eff1f2\"/><stop offset=\"1\" stop-color=\"#cbd3dc\"/></linearGradient>\n <linearGradient id=\"bird-head\" x1=\"74\" y1=\"11\" x2=\"85\" y2=\"33\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#fffefa\"/><stop offset=\"1\" stop-color=\"#eceef0\"/></linearGradient>\n</defs>\n<ellipse class=\"contact-shadow\" cx=\"55\" cy=\"51.5\" rx=\"13\" ry=\"1.25\" fill=\"#24202e\" opacity=\".18\"/>\n<g class=\"wing far\"><path class=\"folded-feathers\" d=\"M45 28C49 21 61 21 68 29C69 35 63 39 54 39C48 37 45 33 45 28Z\" fill=\"#bec8d3\"/><path class=\"flight-feathers\" d=\"M50 31C39 20 39 4 45 -8C50 -6 51 0 53 6C54 -3 58 -8 61 -6C65 3 64 11 62 17C70 13 74 18 71 24L59 34Z\" fill=\"#ccd5df\"/></g>\n<g class=\"tail\"><path d=\"M39 29C28 30 19 31 10 30C10 33 15 35 20 36C15 38 12 40 12 42C23 42 32 39 43 37Z\" fill=\"#eff0ec\"/><path d=\"M14 40C24 39 31 37 38 35\" stroke=\"#d7dee3\" stroke-width=\".9\" stroke-linecap=\"round\"/></g>\n<path class=\"body\" d=\"M31 32C34 23 48 19 63 22C77 24 83 32 77 38C70 45 52 47 41 42C35 40 31 37 31 32Z\" fill=\"url(#bird-body)\"/>\n<path d=\"M43 39C53 44 65 43 73 39\" stroke=\"#c9d1d9\" stroke-width=\".7\" stroke-linecap=\"round\" opacity=\".55\"/>\n<g class=\"neck\"><path d=\"M61 35C66 30 65 23 68 17C72 9 84 9 90 14C96 20 92 29 84 32C78 35 72 38 66 39Z\" fill=\"url(#bird-head)\"/><path d=\"M90 18C94 18 98 19 100 20C96 22 93 23 90 22Z\" fill=\"#e66770\"/><path d=\"M91 21L98 20.5\" stroke=\"#bd4b58\" stroke-width=\".65\" stroke-linecap=\"round\"/><circle class=\"eye\" cx=\"83.5\" cy=\"18.5\" r=\"2.3\" fill=\"#293440\"/><circle cx=\"82.9\" cy=\"17.8\" r=\".65\" fill=\"#fff\"/><path d=\"M84 27C86 27 88 25 89 24\" stroke=\"#d9dfe3\" stroke-width=\".7\" stroke-linecap=\"round\"/></g>\n<g class=\"wing near\"><path class=\"folded-feathers\" d=\"M38 30C39 24 50 22 60 25C66 27 69 31 64 36C59 41 47 43 41 38C38 36 37 33 38 30Z\" fill=\"url(#bird-wing)\"/><path class=\"folded-feathers\" d=\"M42 33C49 36 57 35 64 31M43 36C49 39 55 37 59 35\" stroke=\"#f8f9fa\" stroke-width=\"1\" stroke-linecap=\"round\" opacity=\".8\"/><path class=\"flight-feathers\" d=\"M50 32C39 20 38 4 44 -9C49 -8 51 -1 53 7C55 -2 59 -9 62 -7C65 1 66 10 63 18C69 13 74 17 72 23L59 34Z\" fill=\"url(#bird-wing)\"/><path class=\"flight-feathers\" d=\"M47 -1L52 20M59 0L57 23\" stroke=\"#f8f9fa\" stroke-width=\"1\" stroke-linecap=\"round\"/></g>\n<g class=\"feet\" stroke=\"#927b7f\" stroke-width=\"1.15\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M49 43L49 50L45 51M49 50L53 51M60 44L60 50L56 51M60 50L64 51\"/></g>\n</svg>\n</div><div class=\"tap\"></div>";
class PicomartBird extends HTMLElement {
 connectedCallback(){
  if(this._active)return;
  this._active=true;
  this.removeAttribute("aria-hidden");
  if(!this.shadowRoot)this.attachShadow({mode:'open'}).innerHTML=template;
  const q=s=>this.shadowRoot.querySelector(s);
  this.parts={mascot:q('.mascot'),bird:q('.bird'),neck:q('.neck'),eye:q('.eye'),tap:q('.tap')};
  this.media=matchMedia('(prefers-reduced-motion: reduce)');
  this.abort=new AbortController();
  const signal=this.abort.signal;
  this.reset=()=>{this.start=performance.now();this.flight=null;this.depart=null;this.hidden=false;};
  this.reset();
  const launch=event=>{
   event.preventDefault();event.stopPropagation();
   if(this.media.matches||this.flight||this.depart||this.hidden||!this.position)return;
   this.flight={time:performance.now(),from:{...this.position}};
  };
  this.parts.bird.addEventListener('click',launch,{signal});
  this.parts.bird.addEventListener('keydown',event=>{
   if(event.key==='Enter'||event.key===' ')launch(event);
  },{signal});
  this.tick=this.tick.bind(this);
  this.frame=requestAnimationFrame(this.tick);
  this.media.addEventListener('change',()=>this.reset(),{signal});
 }
 resolve(){
  try{
   this.logo=document.querySelector(this.getAttribute('logo')||'#site-logo');
   const button=document.querySelector(this.getAttribute('target')||'#start-selling');
   if(button!==this.button){
    this.buttonAbort?.abort();this.button=button;this.hover=false;this.focus=false;
    if(button){
     this.buttonAbort=new AbortController();const signal=this.buttonAbort.signal;
     button.addEventListener('pointerenter',()=>this.hover=true,{signal});
     button.addEventListener('pointerleave',()=>this.hover=false,{signal});
     button.addEventListener('focus',()=>this.focus=true,{signal});
     button.addEventListener('blur',()=>this.focus=false,{signal});
     button.addEventListener('click',()=>{
      if(!this.position||this.hidden||this.depart)return;
      this.flight=null;
      this.depart={time:performance.now(),from:{...this.position}};
     },{signal});
    }
   }
  }catch{this.logo=null;this.button=null;}
 }
 replay(){this.reset?.();}
 disconnectedCallback(){this._active=false;cancelAnimationFrame(this.frame);this.abort?.abort();this.buttonAbort?.abort();this.button=null;}
 tick(now){
  if(!this._active)return;
  this.frame=requestAnimationFrame(this.tick);
  this.resolve();
  const {mascot,bird,neck,eye,tap}=this.parts;
  if(!this.logo||!this.button||this.hidden){mascot.style.visibility='hidden';tap.style.opacity=0;return;}
  const r=this.button.getBoundingClientRect(),l=this.logo.getBoundingClientRect();
  const scale=Math.max(.35,Math.min(1.5,Number(this.getAttribute('size')||70)/100));
  // The feet are at local (49, 51); place them exactly on the target's upper edge.
  const end={x:r.left+r.width*.22-49*scale,y:r.top-51*scale};
  const origin={x:l.left+l.width*.35,y:Math.max(8,l.top-25*scale)};
  let t=(now-this.start)/1000;
  const reduced=this.media.matches;
  let x=end.x,y=end.y,angle=0,peck=0,flying=false,brake=0,bounce=0;
  const leaving=this.depart||this.flight;
  if(leaving){
   const elapsed=(now-leaving.time)/1000;
   if(this.depart&&(reduced||elapsed>=1.2)){
    this.hidden=true;mascot.style.visibility='hidden';tap.style.opacity=0;return;
   }
   if(!this.depart&&(reduced||elapsed>=2.9)){
    this.flight=null;this.start=now-3800;t=3.8;
   }else if(elapsed<1.2){
    const p=elapsed/1.2;
    x=leaving.from.x+p*(innerWidth+110-leaving.from.x);
    y=leaving.from.y-90*Math.sin(p*Math.PI/2);
    angle=-12*(1-p);flying=true;
   }else{
    // Re-enter from the left and settle onto the live button position.
    const p=(elapsed-1.2)/1.7,u=1-p;
    const from={x:-120,y:end.y-90},dx=end.x-from.x;
    const c1={x:from.x+dx*.45,y:from.y},c2={x:end.x-dx*.2,y:end.y};
    x=u*u*u*from.x+3*u*u*p*c1.x+3*u*p*p*c2.x+p*p*p*end.x;
    y=u*u*u*from.y+3*u*u*p*c1.y+3*u*p*p*c2.y+p*p*p*end.y;
    const vx=3*u*u*(c1.x-from.x)+6*u*p*(c2.x-c1.x)+3*p*p*(end.x-c2.x);
    const vy=3*u*u*(c1.y-from.y)+6*u*p*(c2.y-c1.y)+3*p*p*(end.y-c2.y);
    brake=Math.max(0,(p-.85)/.15);
    angle=Math.atan2(vy,vx)*180/Math.PI*(1-brake);flying=true;
   }
  }
  if(!this.flight&&!this.depart&&!reduced&&t<3.8){
   if(t<1){x=origin.x;y=origin.y;}
   else{
    const p=Math.min(1,(t-1)/2.8),u=1-p;
    const dx=end.x-origin.x;
    const c1={x:origin.x+dx*.42,y:origin.y-40};
    const c2={x:end.x-dx*.22,y:end.y};
    x=u*u*u*origin.x+3*u*u*p*c1.x+3*u*p*p*c2.x+p*p*p*end.x;
    y=u*u*u*origin.y+3*u*u*p*c1.y+3*u*p*p*c2.y+p*p*p*end.y;
    const vx=3*u*u*(c1.x-origin.x)+6*u*p*(c2.x-c1.x)+3*p*p*(end.x-c2.x);
    const vy=3*u*u*(c1.y-origin.y)+6*u*p*(c2.y-c1.y)+3*p*p*(end.y-c2.y);
    const settle=Math.max(0,(p-.78)/.22);
    angle=Math.atan2(vy,vx)*180/Math.PI*(1-settle*settle*(3-2*settle));
    flying=true;brake=Math.max(0,(p-.85)/.15);
   }
  }else if(!this.flight&&!this.depart&&!reduced){
   if(t<4.1)bounce=3*Math.sin((t-3.8)/.3*Math.PI);
   if(t>=4.6&&!this.hover&&!this.focus){
    // Exactly three 350ms pecks, then the existing 1300ms pause, forever.
    const cycle=(t-4.6)%2.35;
    if(cycle<1.05){const p=(cycle%.35)/.35;peck=p<.24?p/.24:p<.42?1-(p-.24)/.18:0;}
   }
  }
  this.position={x,y};mascot.style.visibility=(r.width&&l.width)?'visible':'hidden';
  mascot.style.transform=`translate(${x}px,${y}px) scale(${scale})`;
  bird.classList.toggle('flying',flying);
  // Lean down subtly from the feet so the toes stay on the button.
  bird.style.transform=`rotate(${angle}deg) scaleY(${1-(peck*.025+bounce*.009)})`;
  neck.style.transform=`rotate(${45*peck}deg)`;
  this.shadowRoot.querySelector('.tail').style.transform=`rotate(${-4*peck}deg)`;
  for(const wing of this.shadowRoot.querySelectorAll('.wing')){
   wing.style.animationPlayState=brake>.2?'paused':'running';
   wing.style.transform=brake>.2?`rotate(${-28+brake*16}deg) scaleY(1)`:'';
  }
  const blink=!reduced&&!flying&&peck===0&&t%3.7<.12;
  eye.style.transform=blink?'scaleY(.1)':'';
  // Beak tip transformed around neck pivot (62,35), then body squash.
  const a=peck*45*Math.PI/180;
  const tipX=62+38*Math.cos(a)+15*Math.sin(a);
  const tipY=35+38*Math.sin(a)-15*Math.cos(a);
  tap.style.left=`${x+tipX*scale-10}px`;
  tap.style.top=`${y+(51+(tipY-51)*(1-peck*.025))*scale-10}px`;
  tap.style.transform=`scale(${.4+peck*.5})`;
  tap.style.opacity=peck>.88?String((peck-.88)*5):'0';
 }
}
if(!customElements.get('picomart-bird'))customElements.define('picomart-bird',PicomartBird);
})();

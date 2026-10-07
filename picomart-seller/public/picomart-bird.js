/* Picomart bird: dependency-free custom element. See README.md. */
(()=>{
const template="<style>\n#white-bird-homepage { width:100%; }\n#white-bird-homepage .scene {position:relative;width:100%;aspect-ratio:1919 / 933;overflow:hidden;container-type:inline-size;border-radius:8px;background:#463b36;}\n#white-bird-homepage .homepage {display:block;width:100%;height:100%;}\n#white-bird-homepage .mascot {position:absolute;left:0;top:0;width:100px;height:74px;transform-origin:0 0;pointer-events:none;will-change:transform;}\n#white-bird-homepage .bird {position:relative;width:100px;height:74px;transform-origin:50px 64px;filter:drop-shadow(0 2px 1px #0003);}\n#white-bird-homepage .body {position:absolute;left:33px;top:24px;width:37px;height:39px;border-radius:65% 40% 55% 45%;background:#181b23;transform:rotate(18deg);}\n#white-bird-homepage .belly {position:absolute;left:51px;top:27px;width:19px;height:31px;border-radius:20% 60% 65% 20%;background:#fff7eb;transform:rotate(18deg);}\n#white-bird-homepage .tail {position:absolute;left:16px;top:43px;width:32px;height:22px;background:#181b23;clip-path:polygon(80% 0,100% 55%,0 100%,12% 63%,4% 46%);}\n#white-bird-homepage .neck {position:absolute;inset:0;transform-origin:53px 32px;}\n#white-bird-homepage .head {position:absolute;left:51px;top:7px;width:31px;height:30px;border-radius:60% 60% 35% 40%;background:#181b23;}\n#white-bird-homepage .cheek {position:absolute;left:58px;top:22px;width:23px;height:8px;background:#fff7eb;border-radius:70% 10% 60% 20%;transform:rotate(-15deg);}\n#white-bird-homepage .crest {position:absolute;left:43px;top:-3px;width:34px;height:19px;background:#ef3448;clip-path:polygon(0 80%,20% 25%,30% 50%,44% 0,58% 40%,73% 14%,100% 90%,47% 100%);transform:rotate(-9deg);}\n#white-bird-homepage .beak {position:absolute;left:79px;top:17px;width:20px;height:8px;background:#aeb6c1;clip-path:polygon(0 0,100% 45%,0 100%);}\n#white-bird-homepage .eye {position:absolute;left:72px;top:15px;width:5px;height:5px;border-radius:50%;background:#fff;box-shadow:inset -1.5px -.5px #181b23;}\n#white-bird-homepage .wing {position:absolute;left:32px;top:27px;width:24px;height:31px;border-radius:65% 35% 70% 30%;background:#252a34;transform-origin:17px 6px;}\n#white-bird-homepage .wing span {position:absolute;left:6px;top:14px;width:13px;height:4px;border-radius:50%;background:#fff7eb;transform:rotate(-32deg);box-shadow:-3px 7px 0 -1px #fff7eb;}\n#white-bird-homepage .far {left:45px;background:#59606b;}\n#white-bird-homepage .feet {position:absolute;left:45px;top:57px;width:6px;height:7px;border-left:2px solid #929aa5;border-bottom:2px solid #929aa5;box-shadow:12px 0 #929aa5;}\n#white-bird-homepage .flying .wing {border-radius:80% 15% 65% 20%;height:48px;top:-12px;transform-origin:17px 44px;animation:white-bird-flap .27s ease-in-out infinite;}\n#white-bird-homepage .flying .far {animation-delay:-.045s;}\n#white-bird-homepage .flying .feet {opacity:0;}\n#white-bird-homepage .tap {position:absolute;width:22px;height:22px;border:3px solid #d4b9ff;border-radius:50%;opacity:0;pointer-events:none;transform-origin:center;}\n@keyframes white-bird-flap {0%,100%{transform:rotate(-28deg) scaleY(1)}50%{transform:rotate(22deg) scaleY(-.65)}}\n@media(prefers-reduced-motion:reduce){#white-bird-homepage .flying .wing{animation:none}}\n\n#white-bird-homepage .bird {height:74px;filter:drop-shadow(0 1px 1px #19223540);}\n#white-bird-homepage .body {left:30px;top:20px;width:48px;height:27px;border-radius:55% 48% 55% 50%;background:#f4f5f7;transform:rotate(-12deg);}\n#white-bird-homepage .bib {position:absolute;left:49px;top:32px;width:26px;height:12px;border-radius:10% 20% 70% 70%;background:#fff;transform:rotate(-20deg);}\n#white-bird-homepage .head {left:64px;top:10px;width:28px;height:28px;border-radius:50% 55% 45% 45%;background:#f4f5f7;}\n#white-bird-homepage .beak {left:88px;top:21px;width:17px;height:7px;background:#e65360;clip-path:polygon(0 0,100% 55%,0 100%);}\n#white-bird-homepage .eye {left:81px;top:18px;width:4px;height:4px;background:#202936;box-shadow:inset 1px 1px 0 #ffffff80;}\n#white-bird-homepage .neck {transform-origin:62px 35px;}\n#white-bird-homepage .tail {left:0;top:28px;width:44px;height:23px;background:#f4f5f7;clip-path:polygon(100% 15%,100% 70%,0 100%,13% 46%,0 0);transform:rotate(-7deg);}\n#white-bird-homepage .wing {left:36px;top:24px;width:30px;height:20px;background:#e6eaf0;border-radius:25% 65% 65% 65%;transform-origin:15px 8px;transform:rotate(-15deg);}\n#white-bird-homepage .far {left:45px;background:#bbc2ce;opacity:.7;}\n#white-bird-homepage .flying .wing {left:38px;top:-21px;width:35px;height:57px;transform-origin:13px 53px;border-radius:90% 10% 55% 20%;clip-path:polygon(36% 100%,9% 74%,0 39%,9% 0,41% 20%,80% 58%,100% 86%,78% 100%);animation:white-bird-flap .72s cubic-bezier(.45,0,.35,1) infinite;}\n#white-bird-homepage .flying .far {left:45px;animation-delay:-.08s;}\n#white-bird-homepage .feet {left:49px;top:43px;width:5px;height:8px;box-shadow:11px 0 #929aa5;}\n@media(prefers-reduced-motion:reduce){#white-bird-homepage .flying .wing{animation:none}}\n\n:host{position:fixed;inset:0;pointer-events:none!important;z-index:1000;display:block;overflow:visible}\n#white-bird-homepage .mascot{position:absolute;left:0;top:0}\n#white-bird-homepage .bird{transform-origin:49px 51px}\n#white-bird-homepage .tap{box-sizing:border-box;width:20px;height:20px;transform-origin:50% 50%}\n</style><div id=\"white-bird-homepage\"><div class=\"mascot\">      <div class=\"bird\">\n        <div class=\"wing far\"></div>\n        <div class=\"tail\"></div><div class=\"body\"></div><div class=\"bib\"></div>\n        <div class=\"neck\"><div class=\"head\"></div><div class=\"beak\"></div><div class=\"eye\"></div></div>\n        <div class=\"wing near\"></div><div class=\"feet\"></div>\n      </div>\n    </div>\n<div class=\"tap\"></div></div>";
class PicomartBird extends HTMLElement {
 connectedCallback(){
  if(this._active)return;
  this._active=true;
  this.setAttribute("aria-hidden","true");
  if(!this.shadowRoot)this.attachShadow({mode:'open'}).innerHTML=template;
  const q=s=>this.shadowRoot.querySelector(s);
  this.parts={mascot:q('.mascot'),bird:q('.bird'),neck:q('.neck'),eye:q('.eye'),tap:q('.tap')};
  this.media=matchMedia('(prefers-reduced-motion: reduce)');
  this.abort=new AbortController();
  const signal=this.abort.signal;
  this.reset=()=>{this.start=performance.now();this.depart=null;this.hidden=false;};
  this.reset();
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
     button.addEventListener('click',()=>{if(!this.depart)this.depart={time:performance.now(),...this.position};},{signal});
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
  const t=(now-this.start)/1000,reduced=this.media.matches;
  let x=end.x,y=end.y,angle=0,peck=0,flying=false,brake=0,bounce=0;
  if(this.depart){
   const p=(now-this.depart.time)/900;
   if(p>=1||reduced){this.hidden=true;mascot.style.visibility='hidden';tap.style.opacity=0;return;}
   x=this.depart.x+p*(innerWidth-this.depart.x+120);y=this.depart.y-p*220;angle=-25;flying=true;
  }else if(!reduced&&t<3.8){
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
  }else if(!reduced){
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
  // Squash from the feet so body movement never lifts the toes off the button.
  bird.style.transform=`rotate(${angle}deg) scaleY(${1-(peck*.025+bounce*.009)})`;
  neck.style.transform=`rotate(${45*peck}deg)`;
  for(const wing of this.shadowRoot.querySelectorAll('.wing')){
   wing.style.animationPlayState=brake>.2?'paused':'running';
   wing.style.transform=brake>.2?`rotate(${-28+brake*16}deg) scaleY(1)`:'';
  }
  const blink=!reduced&&!flying&&peck===0&&t%3.7<.12;
  eye.style.transform=blink?'scaleY(.1)':'';
  // Beak tip transformed around neck pivot (62,35), then body squash.
  const a=peck*45*Math.PI/180;
  const tipX=62+43*Math.cos(a)+11*Math.sin(a);
  const tipY=35+43*Math.sin(a)-11*Math.cos(a);
  tap.style.left=`${x+tipX*scale-10}px`;
  tap.style.top=`${y+(51+(tipY-51)*(1-peck*.025))*scale-10}px`;
  tap.style.transform=`scale(${.4+peck*.5})`;
  tap.style.opacity=peck>.88?String((peck-.88)*5):'0';
 }
}
if(!customElements.get('picomart-bird'))customElements.define('picomart-bird',PicomartBird);
})();

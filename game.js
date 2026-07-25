'use strict';
const $=s=>document.querySelector(s);
const canvas=$('#game'),ctx=canvas.getContext('2d');
const W=canvas.width,H=canvas.height,SAFE_BOTTOM=120;
const UI={
 boot:$('#bootScreen'),menu:$('#menuScreen'),story:$('#storyScreen'),core:$('#coreScreen'),archive:$('#archiveScreen'),settings:$('#settingsScreen'),death:$('#deathScreen'),
 hud:$('#hud'),touch:$('#touchControls'),toast:$('#toast'),threatFlash:$('#threatFlash'),
 hpText:$('#hpText'),hpFill:$('#hpFill'),xpFill:$('#xpFill'),score:$('#scoreText'),level:$('#levelText'),threat:$('#threatText')
};
const THREAT_ROMAN=['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ω'];
const keys={};
let state='boot',running=false,paused=false,last=0,elapsed=0,spawnCd=0,bossSpawned=false,shake=0,joyX=0,joyY=0;
let player,bullets,enemies,enemyBullets,particles,drones,score,level,xp,nextXp,bombs,build,rewindHistory,cloneId;
cloneId=Number(localStorage.getItem('infinityPlaneClone')||1);
const stars=Array.from({length:110},()=>({x:Math.random()*W,y:Math.random()*H,s:.4+Math.random()*1.8,v:18+Math.random()*65}));

const CORES=[
 {id:'rapid',name:'快速装填',tag:'通用',desc:'主炮射速提高 18%。',can:()=>true,apply:()=>player.fireRate*=.82},
 {id:'power',name:'高能弹头',tag:'通用',desc:'主炮伤害提高 25%。',can:()=>true,apply:()=>player.damage*=1.25},
 {id:'laser',name:'低功率激光器',tag:'激光流',desc:'每 2.6 秒发射一道短暂激光。初始威力有限。',can:()=>!build.laser,apply:()=>build.laser=1},
 {id:'laser2',name:'聚焦透镜',tag:'激光流',desc:'激光伤害和持续时间提高。',can:()=>build.laser===1,apply:()=>build.laser=2},
 {id:'laser3',name:'双束阵列',tag:'激光流',desc:'激光分裂为两束，但单束伤害略低。',can:()=>build.laser===2,apply:()=>build.laser=3},
 {id:'drone',name:'护航无人机',tag:'无人机流',desc:'获得一架自动射击无人机。',can:()=>true,apply:()=>{build.drone=(build.drone||0)+1;drones.push({a:Math.random()*6.28,cd:0})}},
 {id:'chrono',name:'时滞场',tag:'时间系',desc:'周期性释放时滞场，使敌人与敌弹减速 3 秒。',can:()=>!build.chrono,apply:()=>{build.chrono=1;build.chronoCd=7}},
 {id:'rewind',name:'回溯保险',tag:'时间系',desc:'受到致命伤害时回到约 4 秒前。每局一次。',can:()=>!build.rewind,apply:()=>build.rewind=1},
 {id:'echo',name:'意识回响',tag:'时间系',desc:'每隔一段时间召唤一个记忆残影协助射击。',can:()=>!build.echo,apply:()=>{build.echo=1;build.echoCd=4}},
 {id:'repair',name:'战地维修',tag:'生存',desc:'恢复 35 点生命，并提高 10 点生命上限。',can:()=>true,apply:()=>{player.maxHp+=10;player.hp=Math.min(player.maxHp,player.hp+35)}}
];

function showScreen(el){document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));el.classList.remove('hidden')}
function boot(){
 const lines=['正在建立加密连接……','正在读取驾驶员档案……','意识备份：可用','源核网络：异常','欢迎回来，驾驶员。'];
 const box=$('#bootLines');box.innerHTML='';let i=0;
 const timer=setInterval(()=>{const d=document.createElement('div');d.className='boot-line '+(i===2?'ok':i===3?'warn':'');d.textContent=lines[i];box.appendChild(d);i++;if(i===lines.length){clearInterval(timer);setTimeout(()=>{state='menu';showScreen(UI.menu)},900)}},520)
}
function startStory(){state='story';showScreen(UI.story);const roll=$('#storyRoll');roll.style.animation='none';void roll.offsetWidth;roll.style.animation='storyScroll 36s linear forwards';setTimeout(()=>{if(state==='story')beginGame()},35000)}
function beginGame(){reset();state='game';document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));UI.hud.classList.remove('hidden');UI.touch.classList.remove('hidden');running=true;paused=false;last=performance.now();requestAnimationFrame(loop)}
function reset(){
 player={x:W/2,y:H-SAFE_BOTTOM-75,r:15,speed:315,hp:100,maxHp:100,damage:11,fireRate:165,fireCd:0,inv:0};
 bullets=[];enemies=[];enemyBullets=[];particles=[];drones=[];score=0;level=1;xp=0;nextXp=55;bombs=3;build={laserCd:1.7,chronoActive:0,echoActive:0};rewindHistory=[];elapsed=0;spawnCd=0;bossSpawned=false;updateUI()
}
function threatLevel(){return Math.min(5,Math.floor(elapsed/28))}
function spawnEnemy(){
 const t=threatLevel();let type='scout';const r=Math.random();
 if(t>=1&&r<.22)type='heavy';
 if(t>=2&&r>.72)type='suicide';
 if(t>=3&&r>.84)type='sniper';
 const base={x:35+Math.random()*(W-70),y:-35,type,r:15,hp:25,max:25,v:120,shoot:1200+Math.random()*700,age:0};
 if(type==='heavy')Object.assign(base,{r:23,hp:95+t*12,max:95+t*12,v:58,shoot:900});
 if(type==='suicide')Object.assign(base,{r:14,hp:28+t*5,max:28+t*5,v:115,shoot:99999});
 if(type==='sniper')Object.assign(base,{r:16,hp:42+t*7,max:42+t*7,v:42,shoot:1350,aim:0});
 enemies.push(base)
}
function spawnBoss(){bossSpawned=true;toast('检测到高危信号');enemies.push({type:'boss',boss:true,x:W/2,y:100,r:54,hp:1100,max:1100,v:32,shoot:620,dir:1,age:0})}
function playerShoot(){
 bullets.push({x:player.x,y:player.y-20,vx:0,vy:-650,r:4,d:player.damage});
 for(const d of drones){bullets.push({x:player.x+Math.cos(d.a)*34,y:player.y+Math.sin(d.a)*22,vx:0,vy:-570,r:3,d:player.damage*.5})}
}
function laserFire(){
 const count=build.laser>=3?2:1,offsets=count===2?[-35,35]:[0];
 for(const off of offsets)bullets.push({laser:true,x:player.x+off,y:0,w:build.laser>=2?12:8,h:player.y-18,life:build.laser>=2?.28:.18,d:(build.laser>=2?95:52)*(count===2?.72:1)})
}
function enemyShoot(e){
 if(e.boss){const phase=e.hp/e.max<.35?3:e.hp/e.max<.7?2:1;const spread=phase===3?.25:.38;for(let a=-1.1;a<=1.1;a+=spread)enemyBullets.push({x:e.x,y:e.y+30,vx:Math.sin(a)*(phase===3?230:185),vy:Math.cos(a)*(phase===3?230:185),r:6})}
 else{const ang=Math.atan2(player.y-e.y,player.x-e.x);enemyBullets.push({x:e.x,y:e.y+10,vx:Math.cos(ang)*190,vy:Math.sin(ang)*190,r:5})}
}
function damageEnemy(e,d){e.hp-=d;if(e.hp<=0){score+=e.boss?1500:e.type==='heavy'?80:e.type==='sniper'?65:30;xp+=e.boss?100:e.type==='heavy'?18:10;explode(e.x,e.y,e.boss?60:18);return true}return false}
function damagePlayer(d){
 if(player.inv>0)return;player.hp-=d;player.inv=.65;shake=12;
 if(player.hp<=0&&build.rewind&&!build.rewindUsed&&rewindHistory.length){const snap=rewindHistory[0];Object.assign(player,{x:snap.x,y:snap.y,hp:Math.max(35,snap.hp)});enemyBullets=[];build.rewindUsed=1;toast('回溯保险已启动');return}
 if(player.hp<=0)die()
}
function pulse(){if(!running||paused||bombs<=0)return;bombs--;enemyBullets=[];for(const e of enemies)e.hp-=120;explode(player.x,player.y,50);toast('脉冲剩余 '+bombs)}
function explode(x,y,n=18){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=40+Math.random()*230;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.25+Math.random()*.55,max:.8,r:2+Math.random()*4})}shake=9}
function update(dt){
 elapsed+=dt;const threat=threatLevel();
 for(const s of stars){s.y+=s.v*(1+threat*.08)*dt;if(s.y>H){s.y=0;s.x=Math.random()*W}}
 let dx=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0)+joyX,dy=(keys.ArrowDown||keys.s?1:0)-(keys.ArrowUp||keys.w?1:0)+joyY,len=Math.hypot(dx,dy)||1;
 player.x+=dx/len*player.speed*dt;player.y+=dy/len*player.speed*dt;player.x=Math.max(20,Math.min(W-20,player.x));player.y=Math.max(40,Math.min(H-SAFE_BOTTOM-22,player.y));
 player.inv=Math.max(0,player.inv-dt);player.fireCd-=dt*1000;if(player.fireCd<=0){playerShoot();player.fireCd=player.fireRate}
 if(build.laser){build.laserCd-=dt;if(build.laserCd<=0){laserFire();build.laserCd=Math.max(1.55,2.8-build.laser*.35)}}
 if(build.chrono){build.chronoCd-=dt;if(build.chronoCd<=0){build.chronoActive=3;build.chronoCd=10;toast('时滞场已展开')}}build.chronoActive=Math.max(0,build.chronoActive-dt);
 if(build.echo){build.echoCd-=dt;if(build.echoCd<=0){build.echoActive=5;build.echoCd=13;toast('意识回响已接入')}}build.echoActive=Math.max(0,build.echoActive-dt);
 if(build.echoActive>0&&Math.floor(elapsed*8)%4===0&&Math.random()<.12)bullets.push({x:W-player.x,y:player.y-35,vx:0,vy:-620,r:3,d:player.damage*.65,echo:true});
 rewindHistory.unshift({x:player.x,y:player.y,hp:player.hp});if(rewindHistory.length>240)rewindHistory.pop();
 spawnCd-=dt;if(spawnCd<=0){spawnEnemy();spawnCd=Math.max(.24,.82-threat*.105)}if(elapsed>80&&!bossSpawned)spawnBoss();
 const slow=build.chronoActive>0?.38:1;
 for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];if(b.laser){b.life-=dt;for(let j=enemies.length-1;j>=0;j--){const e=enemies[j];if(Math.abs(e.x-b.x)<b.w+e.r&&e.y<player.y&&damageEnemy(e,b.d*dt*7)){enemies.splice(j,1)}}if(b.life<=0)bullets.splice(i,1);continue}b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.y<-30){bullets.splice(i,1);continue}for(let j=enemies.length-1;j>=0;j--){const e=enemies[j];if(Math.hypot(b.x-e.x,b.y-e.y)<b.r+e.r){if(damageEnemy(e,b.d))enemies.splice(j,1);bullets.splice(i,1);break}}}
 for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];e.age+=dt;if(e.boss){e.x+=e.dir*90*dt*slow;if(e.x<70||e.x>W-70)e.dir*=-1}else if(e.type==='suicide'){const a=Math.atan2(player.y-e.y,player.x-e.x);e.x+=Math.cos(a)*(e.v+threat*12)*dt*slow;e.y+=Math.sin(a)*(e.v+threat*12)*dt*slow}else{e.y+=(e.v+threat*8)*dt*slow;if(e.type==='sniper')e.x+=Math.sin(e.age*2)*45*dt}
 e.shoot-=dt*1000*slow;if(e.shoot<=0&&e.type!=='suicide'){enemyShoot(e);e.shoot=e.boss?Math.max(330,700-threat*40):Math.max(700,1450-threat*90)}
 if(Math.hypot(player.x-e.x,player.y-e.y)<player.r+e.r){damagePlayer(e.boss?30:e.type==='suicide'?28:16);explode(e.x,e.y);enemies.splice(i,1);continue}if(e.y>H+50)enemies.splice(i,1)}
 for(let i=enemyBullets.length-1;i>=0;i--){const b=enemyBullets[i];b.x+=b.vx*dt*slow;b.y+=b.vy*dt*slow;if(Math.hypot(b.x-player.x,b.y-player.y)<b.r+player.r){damagePlayer(10+threat*1.5);enemyBullets.splice(i,1);continue}if(b.y>H+30||b.x<-30||b.x>W+30)enemyBullets.splice(i,1)}
 for(const d of drones)d.a+=dt*2.1;for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;if(p.life<=0)particles.splice(i,1)}
 while(xp>=nextXp){xp-=nextXp;level++;nextXp=Math.floor(nextXp*1.23);chooseCore();break}
 const newThreat=threatLevel();if(newThreat!==Number(UI.threat.dataset.level||0)){UI.threat.dataset.level=newThreat;UI.threatFlash.classList.remove('hidden');$('#threatFlashText').textContent=THREAT_ROMAN[newThreat];setTimeout(()=>UI.threatFlash.classList.add('hidden'),1800)}updateUI()
}
function draw(){
 ctx.save();if(shake&&$('#shakeSetting').checked){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake*=.85}ctx.clearRect(0,0,W,H);ctx.fillStyle='#020712';ctx.fillRect(0,0,W,H);
 for(const s of stars){ctx.globalAlpha=.35+s.s/3;ctx.fillStyle='#85ddff';ctx.fillRect(s.x,s.y,s.s,s.s)}ctx.globalAlpha=1;
 for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle='#ffb24a';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill()}ctx.globalAlpha=1;
 for(const b of bullets){if(b.laser){ctx.fillStyle='rgba(90,235,255,.16)';ctx.fillRect(b.x-b.w*2,0,b.w*4,b.h);ctx.fillStyle='#d9fbff';ctx.fillRect(b.x-b.w/2,0,b.w,b.h)}else{ctx.fillStyle=b.echo?'#c295ff':'#65e7ff';ctx.fillRect(b.x-2,b.y-10,4,14)}}
 for(const b of enemyBullets){ctx.fillStyle='#ff536b';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,7);ctx.fill()}
 for(const e of enemies){ctx.save();ctx.translate(e.x,e.y);ctx.fillStyle=e.boss?'#a767ff':e.type==='heavy'?'#ff9c54':e.type==='suicide'?'#ff4360':e.type==='sniper'?'#ffd35a':'#ff6b7e';ctx.beginPath();if(e.type==='heavy'){ctx.rect(-e.r,-e.r,e.r*2,e.r*2)}else{ctx.moveTo(0,e.r);ctx.lineTo(-e.r,-e.r*.75);ctx.lineTo(e.r,-e.r*.75);ctx.closePath()}ctx.fill();ctx.restore();if(e.boss){ctx.fillStyle='#18233b';ctx.fillRect(55,28,W-110,12);ctx.fillStyle='#a767ff';ctx.fillRect(55,28,(W-110)*(e.hp/e.max),12)}}
 for(const d of drones){const x=player.x+Math.cos(d.a)*34,y=player.y+Math.sin(d.a)*23;ctx.fillStyle='#aeefff';ctx.beginPath();ctx.arc(x,y,7,0,7);ctx.fill()}
 if(build.echoActive>0){ctx.globalAlpha=.28;drawShip(W-player.x,player.y-15,'#b474ff');ctx.globalAlpha=1}drawShip(player.x,player.y,'#5ce1ff');ctx.restore()
}
function drawShip(x,y,color){ctx.save();ctx.translate(x,y);if(player.inv>0&&Math.floor(player.inv*16)%2)ctx.globalAlpha=.3;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,-19);ctx.lineTo(-15,16);ctx.lineTo(0,9);ctx.lineTo(15,16);ctx.closePath();ctx.fill();ctx.fillStyle='#fff';ctx.fillRect(-2,-8,4,11);ctx.restore()}
function loop(t){if(!running)return;const dt=Math.min(.033,(t-last)/1000||0);last=t;if(!paused)update(dt);draw();requestAnimationFrame(loop)}
function chooseCore(){paused=true;state='core';showScreen(UI.core);UI.hud.classList.remove('hidden');const pool=CORES.filter(c=>c.can()).sort(()=>Math.random()-.5).slice(0,3);const box=$('#coreChoices');box.innerHTML='';pool.forEach(c=>{const el=document.createElement('button');el.className='core-card';el.innerHTML=`<b>${c.name}</b><p>${c.desc}</p><span>${c.tag}</span>`;el.onclick=()=>{c.apply();state='game';UI.core.classList.add('hidden');paused=false;toast('获得源核：'+c.name)};box.appendChild(el)})}
function die(){running=false;state='death';UI.hud.classList.add('hidden');UI.touch.classList.add('hidden');showScreen(UI.death);cloneId++;localStorage.setItem('infinityPlaneClone',String(cloneId));$('#archiveCloneCount').textContent='当前驾驶员编号：#'+String(cloneId).padStart(6,'0');const main=$('#deathMain'),sub=$('#deathSub'),stats=$('#deathStats'),btn=$('#syncRestartButton');main.textContent='驾驶员生命信号消失';sub.textContent='';stats.classList.add('hidden');btn.classList.add('hidden');const lines=['正在搜索意识备份……','发现可用备份。','开始同步记忆……','同步完成。','新驾驶员编号：#'+String(cloneId).padStart(6,'0')];let i=0;const timer=setInterval(()=>{sub.innerHTML+=`<div>${lines[i]}</div>`;i++;if(i===lines.length){clearInterval(timer);stats.innerHTML=`本次行动分数：<b>${score}</b><br>到达等级：<b>${level}</b><br>最高危险等级：<b>${THREAT_ROMAN[threatLevel()]}</b>`;stats.classList.remove('hidden');btn.classList.remove('hidden')}},850)}
function updateUI(){UI.hpText.textContent=`${Math.ceil(player?.hp||0)} / ${player?.maxHp||100}`;UI.hpFill.style.width=Math.max(0,(player?.hp||0)/(player?.maxHp||100)*100)+'%';UI.xpFill.style.width=(xp/nextXp*100)+'%';UI.score.textContent=score;UI.level.textContent=level;UI.threat.textContent=THREAT_ROMAN[threatLevel()]}
function toast(text){UI.toast.textContent=text;UI.toast.style.opacity=1;clearTimeout(UI.toast._timer);UI.toast._timer=setTimeout(()=>UI.toast.style.opacity=0,1400)}

$('#startButton').onclick=startStory;$('#skipStory').onclick=beginGame;$('#storyRoll').addEventListener('animationend',beginGame);$('#syncRestartButton').onclick=beginGame;$('#bombButton').onclick=pulse;
$('#archiveButton').onclick=()=>{showScreen(UI.archive);$('#archiveCloneCount').textContent='当前驾驶员编号：#'+String(cloneId).padStart(6,'0')};$('#settingsButton').onclick=()=>showScreen(UI.settings);
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>showScreen(UI.menu));
addEventListener('keydown',e=>{keys[e.key]=true;if(e.key==='b'||e.key==='B')pulse();if((e.key==='p'||e.key==='P')&&running)paused=!paused;if(state==='story'&&(e.key==='Escape'||e.key===' '))beginGame()});addEventListener('keyup',e=>keys[e.key]=false);
const joy=$('#joystick'),knob=$('#knob');function moveJoy(e){const r=joy.getBoundingClientRect(),p=e.touches?e.touches[0]:e,x=p.clientX-r.left-r.width/2,y=p.clientY-r.top-r.height/2,m=Math.min(42,Math.hypot(x,y)),a=Math.atan2(y,x);joyX=Math.cos(a)*m/42;joyY=Math.sin(a)*m/42;knob.style.transform=`translate(${Math.cos(a)*m}px,${Math.sin(a)*m}px)`}function endJoy(){joyX=joyY=0;knob.style.transform='translate(0,0)'}joy.addEventListener('touchstart',moveJoy,{passive:false});joy.addEventListener('touchmove',e=>{e.preventDefault();moveJoy(e)},{passive:false});joy.addEventListener('touchend',endJoy);joy.addEventListener('pointerdown',e=>{joy.setPointerCapture(e.pointerId);moveJoy(e)});joy.addEventListener('pointermove',e=>{if(e.buttons)moveJoy(e)});joy.addEventListener('pointerup',endJoy);
boot();draw();

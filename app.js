const KEY="nihongo.v1", SESSION="nihongo.session.v1";
const $=s=>document.querySelector(s);
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random();
const load=()=>JSON.parse(localStorage.getItem(KEY)||"null");
const save=x=>localStorage.setItem(KEY,JSON.stringify(x));
const sess=()=>localStorage.getItem(SESSION);
const setSess=x=>x?localStorage.setItem(SESSION,x):localStorage.removeItem(SESSION);

const lessons=[
 {id:1,title:"Your first Japanese",desc:"Greetings, yes, no and thank you",xp:40,
  qs:[["What does こんにちは mean?","Hello",["Goodbye","Thank you","Sorry"]],["ありがとう means…","Thank you",["Hello","No","Good morning"]],["How do you say yes?","はい",["いいえ","またね","ありがとう"]]]},
 {id:2,title:"Meet & greet",desc:"Names, introductions and simple phrases",xp:50,
  qs:[["What is わたし?","I / me",["You","Friend","Teacher"]],["How do you say 'my name is Kyle'?","わたしはカイルです",["カイルじゃない","ありがとうカイル","こんにちはです"]],["せんせい means…","Teacher",["Student","Friend","Family"]]]},
 {id:3,title:"Everyday words",desc:"Useful words you can start using today",xp:60,
  qs:[["みず means…","Water",["Food","House","Book"]],["What is ほん?","Book",["Water","School","Cat"]],["ねこ means…","Cat",["Dog","Bird","Cat"]]]},
 {id:4,title:"Build a sentence",desc:"Start putting Japanese together",xp:70,
   qs:[["What is これは?","What is this?",["Who is this?","Where is it?","I like this"]],["です is often used to…","Make a polite statement",["Ask for money","Say goodbye","Count"]],["Japanese sentences often put the verb…","Near the end",["At the start","Only in the middle","Never"]]]}
];

function blankProfile(id,name,desc="",avatar="🧑"){
 return {id,name,desc,avatar,xp:0,streak:0,points:0,hearts:5,lastDay:"",completed:[],inventory:[],purchases:[],daily:0,tests:[],disabled:false};
}
function defaultDB(){
 const k=blankProfile("kyle","Kyle","Admin","😎");
 k.role="admin"; k.passwordSet=false;
 const m=blankProfile("mum","Mum","Learning Japanese together","👩");
 const n=blankProfile("nana","Nana","Japanese learner","👵");
 return {version:1,adminId:"kyle",profiles:{kyle:k,mum:m,nana:n},classes:[],tests:[],shop:[
  {id:"heart",name:"Heart Refill",desc:"Restore all 5 hearts.",emoji:"❤️",price:80,stock:-1},
  {id:"freeze",name:"Streak Freeze",desc:"Protect your next missed day.",emoji:"❄️",price:120,stock:-1},
  {id:"boost",name:"XP Boost",desc:"Double your next lesson reward.",emoji:"⚡",price:150,stock:-1}
 ],settings:{familyName:"Nihongo Family"}};
}
let db=load()||defaultDB(), view="home", lessonId=null, qIndex=0, earned=false, toastTimer;

function current(){const id=sess(); return id&&db.profiles[id]&&!db.profiles[id].disabled?db.profiles[id]:null}
function isAdmin(){return current()?.role==="admin"}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function avatar(p){return p.avatar?.startsWith("data:")?`<div class="avatar"><img src="${p.avatar}"></div>`:`<div class="avatar">${esc(p.avatar||"🧑")}</div>`}
function shell(body,active="home"){
 return `<div class="shell"><div class="top"><div class="brand">Nihongo<span>.</span></div><div class="actions">
 ${current()?`<button class="iconbtn" data-a="switch">⇄</button>`:""}</div></div>${body}</div>`;
}
function nav(active){
 const items=[["home","⌂","Home"],["learn","▶","Learn"],["talk","◉","Sensei"],["family","♧","Family"],["shop","✦","Shop"]];
 if(isAdmin()) items.push(["admin","⚙","Admin"]);
 return `<div class="nav">${items.map(x=>`<button class="${active===x[0]?"active":""}" data-a="nav:${x[0]}"><b>${x[1]}</b>${x[2]}</button>`).join("")}</div>`;
}
function render(){document.title="Nihongo"; if(view==="auth")return renderAuth(); if(view==="onboard")return renderOnboard(); if(view==="create")return renderCreate(); if(view==="onboardChat")return onboardChat(); let body="";
 if(view==="home")body=home(); if(view==="learn")body=learn(); if(view==="lesson")body=lesson(); if(view==="shop")body=shop(); if(view==="talk")body=talk(); if(view==="family")body=family(); if(view==="admin")body=admin(); if(view==="switch")body=switcher();
 $("#app").innerHTML=shell(body,view)+nav(view); bind();}

function renderAuth(){
 $("#app").innerHTML=`<div class="auth"><div class="authbox"><div class="authlogo">Nihongo<span>.</span></div><p class="muted">Japanese learning, built for your family.</p><div class="authcard">
 <div class="kicker">Welcome</div><h1 style="font-size:36px">Choose your profile</h1><p class="muted">Pick an account to continue.</p>
 <div class="grid">${Object.values(db.profiles).filter(p=>!p.disabled).map(p=>`<div class="card span6"><div class="profile">${avatar(p)}<div><div class="name">${esc(p.name)}</div><div class="desc">${esc(p.desc)}</div></div></div><button class="btn full" style="margin-top:14px" data-a="login:${p.id}">Continue as ${esc(p.name)}</button></div>`).join("")}</div>
 <button class="btn secondary full" style="margin-top:12px" data-a="createProfile">Create a new account</button>
 </div></div></div>`;bind();
}
function renderOnboard(){
 const p=db.profiles.kyle;
 $("#app").innerHTML=`<div class="auth"><div class="authbox"><div class="authlogo">Nihongo<span>.</span></div><div class="authcard">
 <div class="kicker">First setup</div><h1 style="font-size:38px">Welcome to Nihongo</h1><p class="muted">Create the local Kyle admin password. It is stored as a one-way hash in this browser.</p>
 <label>Kyle admin password</label><input id="adminPass" type="password" placeholder="Create a password">
 <label>Confirm password</label><input id="adminPass2" type="password" placeholder="Repeat it">
 <button class="btn full" style="margin-top:15px" data-a="setupAdmin">Create Kyle Admin</button>
 </div></div></div>`;bind();
}
function createProfile(){
 const name=$("#newName")?.value.trim(); const desc=$("#newDesc")?.value.trim(); const av=$("#newAvatar")?.value.trim()||"🧑";
 if(!name){toast("Add a name");return}
 const id=name.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"-"+Math.random().toString(36).slice(2,6);
 db.profiles[id]=blankProfile(id,name,desc,av);save(db);setSess(id);view="onboardChat"; render();
}
function renderCreate(){
 $("#app").innerHTML=`<div class="auth"><div class="authbox"><div class="authlogo">Nihongo<span>.</span></div><div class="authcard">
 <div class="kicker">Create your account</div><h1 style="font-size:36px">Make it yours.</h1><div class="step"><i class="on"></i><i></i><i></i></div>
 <label>Name</label><input id="newName" placeholder="e.g. Alex">
 <label>Profile picture</label><input id="newAvatar" maxlength="3" placeholder="🧑">
 <label>Short description</label><textarea id="newDesc" rows="3" placeholder="What are you learning for?"></textarea>
 <button class="btn full" style="margin-top:15px" data-a="createProfile">Next</button><button class="btn secondary full" style="margin-top:8px" data-a="backAuth">Back</button>
 </div></div></div>`;bind();
}
function onboardChat(){
 const p=current(); $("#app").innerHTML=`<div class="auth"><div class="authbox"><div class="authlogo">Nihongo<span>.</span></div><div class="authcard">
 <div class="kicker">Meet Sensei</div><h1 style="font-size:34px">Let's personalise your lessons.</h1>
 <div class="chat" id="introChat"><div class="bubble">こんにちは, ${esc(p.name)}! 👋</div><div class="bubble">Do you already know any Japanese words?</div></div>
 <div class="actions" style="margin-top:12px"><button class="btn secondary" data-a="introAnswer:beginner">Not yet</button><button class="btn" data-a="introAnswer:some">A few</button><button class="btn blue" data-a="introAnswer:confident">Quite a few</button></div>
 </div></div></div>`;bind();
}
function finishOnboard(level){const p=current();p.level=level;p.onboarded=true;p.xp=0;save(db);view="home";render();toast("Profile ready ✨")}
function home(){
 const p=current(), daily=p.daily||0, pct=Math.min(100,daily*2);
 const testCount=db.tests.filter(t=>(t.targets||[]).includes(p.id)&&!t.completedBy?.includes(p.id)).length;
 const next=lessons.find(l=>!p.completed.includes(l.id))||lessons[0];
 return `<div class="hero"><div class="profile">${avatar(p)}<div><div class="kicker">Welcome back</div><div class="name">${esc(p.name)}</div><div class="muted">${esc(p.desc||"Japanese learner")}</div></div></div>
 <h1>Ready for your next step?</h1><p class="muted">Your course adapts around what you practise. Keep the streak moving.</p>
 <div class="actions"><button class="btn" data-a="lesson:${next.id}">Continue · ${esc(next.title)}</button><button class="btn secondary" data-a="nav:talk">Talk to Sensei</button></div></div>
 <div class="grid">
  <div class="card span12"><div class="stats"><div class="stat"><b>🔥 ${p.streak||0}</b><small>day streak</small></div><div class="stat"><b>⚡ ${p.xp||0}</b><small>total XP</small></div><div class="stat"><b>🪙 ${p.points||0}</b><small>points</small></div><div class="stat"><b>❤️ ${p.hearts??5}</b><small>hearts</small></div></div></div>
  <div class="card span8"><div class="row"><div><div class="kicker">Today's goal</div><h2>${daily} / 50 XP</h2></div><span class="pill">${pct}%</span></div><div class="progress" style="margin-top:12px"><i style="width:${pct}%"></i></div></div>
  <div class="card span4"><div class="kicker">Assigned tests</div><h2>${testCount}</h2><p class="muted">${testCount?"Ready when you are.":"Nothing due right now."}</p></div>
  <div class="card span8"><div class="row"><div><div class="kicker">Learning path</div><h2>Japanese foundations</h2></div><button class="btn secondary" data-a="nav:learn">Open path</button></div>
   <div class="lesson-list" style="margin-top:12px">${lessons.slice(0,3).map((l,i)=>`<div class="lesson ${p.completed.includes(l.id)?"done":""}"><div class="num">${p.completed.includes(l.id)?"✓":i+1}</div><div style="flex:1"><b>${esc(l.title)}</b><div class="muted">${esc(l.desc)}</div></div><button class="btn secondary" data-a="lesson:${l.id}">${p.completed.includes(l.id)?"Review":"Start"}</button></div>`).join("")}</div>
  </div>
  <div class="card span4"><div class="kicker">Daily missions</div><div style="display:grid;gap:11px;margin-top:10px"><div><b>🎯 Earn 50 XP</b><div class="muted">${Math.min(daily,50)} / 50</div></div><div><b>🗣️ Speak with Sensei</b><div class="muted">Keep practising</div></div><div><b>📚 Finish a lesson</b><div class="muted">${p.completed.length} completed</div></div></div></div>
 </div>`;
}

function family(){
 const people=Object.values(db.profiles).filter(p=>!p.disabled);
 const sorted=[...people].sort((a,b)=>(b.xp||0)-(a.xp||0));
 return `<div class="hero"><div class="kicker">Nihongo Family</div><h1>Learn together.</h1><p class="muted">A shared view of progress for the people learning Japanese with you.</p></div>
 <div class="grid">
  <div class="card span8"><div class="row"><div><div class="kicker">Family leaderboard</div><h2>This week</h2></div><span class="pill">XP</span></div>
   <div class="family-list" style="margin-top:12px">${sorted.map((p,i)=>`<div class="family-row"><div class="rank">${i+1}</div>${avatar(p)}<div style="flex:1"><b>${esc(p.name)}</b><div class="muted">${p.streak||0} day streak</div></div><strong>${p.xp||0} XP</strong></div>`).join("")}</div>
  </div>
  <div class="card span4"><div class="kicker">Family goal</div><h2>${people.reduce((s,p)=>s+(p.daily||0),0)} XP</h2><p class="muted">earned today across the family.</p><div class="progress"><i style="width:${Math.min(100,people.reduce((s,p)=>s+(p.daily||0),0)*2)}%"></i></div></div>
  <div class="card span12"><div class="kicker">Keep it going</div><h2>Family challenge</h2><p class="muted">Everyone complete one lesson today.</p><div class="actions"><button class="btn" data-a="nav:learn">Start a lesson</button><button class="btn secondary" data-a="nav:talk">Practise with Sensei</button></div></div>
 </div>`;
}

function learn(){
 const p=current(); return `<div class="hero"><div class="kicker">Learning path</div><h1>Build your Japanese.</h1><p class="muted">Every lesson earns XP and points. Finish a lesson to unlock the next one.</p></div>
 <div class="card" style="margin-top:15px"><div class="lesson-list">${lessons.map((l,i)=>{const unlocked=i===0||p.completed.includes(lessons[i-1].id);return `<div class="lesson ${p.completed.includes(l.id)?"done":""} ${!unlocked?"lock":""}"><div class="num">${p.completed.includes(l.id)?"✓":i+1}</div><div style="flex:1"><b>${esc(l.title)}</b><div class="muted">${esc(l.desc)} · ${l.xp} XP</div></div><button class="btn ${unlocked?"":"secondary"}" data-a="lesson:${l.id}">${unlocked?(p.completed.includes(l.id)?"Review":"Start"):"Locked"}</button></div>`}).join("")}</div></div>`;
}
function lesson(){
 const l=lessons.find(x=>x.id===lessonId), q=l.qs[qIndex]; if(!q)return doneLesson(l);
 return `<div class="top"><button class="iconbtn" data-a="nav:learn">←</button><div class="pill">❤️ ${current().hearts}</div></div><div class="card"><div class="row"><span class="kicker">${esc(l.title)}</span><span class="muted">${qIndex+1}/${l.qs.length}</span></div><div class="progress" style="margin-top:10px"><i style="width:${qIndex/l.qs.length*100}%"></i></div><div class="question">${esc(q[0])}</div>${[q[1],...q[2]].sort(()=>Math.random()-.5).map(a=>`<button class="choice" data-a="answer" data-v="${esc(a)}">${esc(a)}</button>`).join("")}</div>`;
}
function doneLesson(l){
 const p=current(); if(!earned){earned=true;if(!p.completed.includes(l.id))p.completed.push(l.id);p.xp+=l.xp;p.points+=l.xp;p.daily=(p.daily||0)+l.xp;p.hearts=Math.min(5,p.hearts+1);p.streak=Math.max(1,p.streak);save(db)}
 return `<div class="hero" style="text-align:center"><div style="font-size:64px">🎉</div><div class="kicker">Lesson complete</div><h1>Nice work.</h1><p class="muted">You earned ${l.xp} XP and ${l.xp} points.</p><div class="actions" style="justify-content:center"><button class="btn" data-a="nav:learn">Keep learning</button><button class="btn secondary" data-a="nav:home">Home</button></div></div>`;
}
function shop(){
 const p=current(); return `<div class="hero"><div class="kicker">Nihongo Shop</div><h1>Spend your points.</h1><p class="muted">You have <b>🪙 ${p.points}</b> points.</p></div><div class="card" style="margin-top:15px"><div class="shop">${db.shop.map(x=>`<div class="item"><div class="emoji">${esc(x.emoji)}</div><h3>${esc(x.name)}</h3><p class="muted">${esc(x.desc)}</p><div class="row"><span class="pill">🪙 ${x.price}</span><button class="btn" data-a="buy:${x.id}" ${x.stock===0?"disabled":""}>Buy</button></div></div>`).join("")}</div></div>`;
}
function talk(){
 return `<div class="hero"><div class="kicker">Nihongo Sensei</div><h1>Talk it out.</h1><p class="muted">Practise Japanese, ask questions, or tell Sensei what you're struggling with.</p></div><div class="card" style="margin-top:15px"><div class="chat" id="chat">${chatHistory().map(m=>`<div class="bubble ${m.me?"me":""}">${esc(m.t)}</div>`).join("")}</div><div class="chatbar"><input id="chatInput" placeholder="Try: What does ありがとう mean?"><button class="btn" data-a="chatSend">Send</button></div></div>`;
}
let chats=[{t:"こんにちは! I'm Sensei. What are you working on today?",me:false}];
function chatHistory(){return chats}
function senseiReply(s){
 const x=s.toLowerCase();
 if(x.includes("ありがとう"))return "ありがとう means “thank you”. Nice one! 🌸";
 if(x.includes("hello")||x.includes("こんにちは"))return "こんにちは! That means “hello” or “good afternoon”.";
 if(x.includes("hiragana"))return "Hiragana is one of the main Japanese writing systems. We can practise it step by step.";
 if(x.includes("word"))return "Tell me a Japanese word you know and I'll build a tiny practice question around it.";
 return "Good question. Let's break it down together. Try giving me one Japanese word or phrase you already know.";
}
function admin(){
 const ps=Object.values(db.profiles), students=ps.filter(p=>p.role!=="admin");
 return `<div class="hero"><div class="kicker">Nihongo Admin</div><h1>Control centre.</h1><p class="muted">Manage your family learning space from one place.</p></div>
 <div class="grid"><div class="card span4"><div class="kicker">Students</div><h2>${students.length}</h2></div><div class="card span4"><div class="kicker">Classes</div><h2>${db.classes.length}</h2></div><div class="card span4"><div class="kicker">Tests</div><h2>${db.tests.length}</h2></div>
 <div class="card span12"><div class="admin-tabs"><button class="btn" data-a="admin:create">+ Create student</button><button class="btn secondary" data-a="admin:class">+ Class</button><button class="btn secondary" data-a="admin:shop">Shop</button><button class="btn secondary" data-a="admin:test">Create test</button></div></div>
 <div class="card span12"><h2>Students</h2><div class="table" style="margin-top:10px">${students.map(p=>`<div class="tr"><div class="profile">${avatar(p)}<div><b>${esc(p.name)}</b><div class="muted">${esc(p.desc)}</div></div></div><span>⚡ ${p.xp}</span><span>🪙 ${p.points}</span><button class="btn secondary" data-a="admin:edit:${p.id}">Edit</button></div>`).join("")||"<div class='empty'>No students yet.</div>"}</div></div></div>`;
}
function adminCreate(){
 $("#app").innerHTML=shell(`<div class="card"><div class="kicker">Admin</div><h1 style="font-size:38px">Create student</h1><label>Name</label><input id="an" placeholder="Student name"><label>Picture</label><input id="aa" value="🧑"><label>Description</label><input id="ad" placeholder="Beginner Japanese learner"><button class="btn full" style="margin-top:15px" data-a="admin:saveStudent">Create student</button><button class="btn secondary full" style="margin-top:8px" data-a="nav:admin">Cancel</button></div>`,"admin");navBind();bind();
}
function adminShop(){
 $("#app").innerHTML=shell(`<div class="card"><div class="kicker">Shop admin</div><h1 style="font-size:38px">Build the shop.</h1><label>Item name</label><input id="sn" placeholder="e.g. Golden Double XP"><label>Description</label><input id="sd"><label>Emoji</label><input id="se" value="✨"><label>Price</label><input id="sp" type="number" value="200"><button class="btn full" style="margin-top:15px" data-a="admin:addShop">Add item</button><div class="lesson-list" style="margin-top:15px">${db.shop.map(x=>`<div class="lesson"><div class="num">${esc(x.emoji)}</div><div style="flex:1"><b>${esc(x.name)}</b><div class="muted">🪙 ${x.price}</div></div><button class="btn secondary" data-a="admin:delShop:${x.id}">Delete</button></div>`).join("")}</div><button class="btn secondary full" style="margin-top:10px" data-a="nav:admin">Back</button></div>`,"admin");navBind();bind();
}
function adminClass(){
 $("#app").innerHTML=shell(`<div class="card"><div class="kicker">Classes</div><h1 style="font-size:38px">Family classes.</h1><label>Class name</label><input id="cn" placeholder="Japanese Beginners"><button class="btn full" style="margin-top:15px" data-a="admin:addClass">Create class</button><div class="lesson-list" style="margin-top:15px">${db.classes.map(c=>`<div class="lesson"><div class="num">#</div><div style="flex:1"><b>${esc(c.name)}</b><div class="muted">${c.members.length} members</div></div></div>`).join("")||"<div class='empty'>No classes yet.</div>"}</div><button class="btn secondary full" style="margin-top:10px" data-a="nav:admin">Back</button></div>`,"admin");navBind();bind();
}
function adminTest(){
 const students=Object.values(db.profiles).filter(p=>p.role!=="admin");
 $("#app").innerHTML=shell(`<div class="card"><div class="kicker">Tests</div><h1 style="font-size:38px">Create a test.</h1><label>Title</label><input id="tn" placeholder="Friday Japanese Check"><label>Target students</label><select id="tt" multiple size="${Math.min(5,Math.max(2,students.length))}">${students.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select><label>Question count</label><input id="tq" type="number" value="5" min="1" max="20"><button class="btn full" style="margin-top:15px" data-a="admin:addTest">Assign test</button><button class="btn secondary full" style="margin-top:8px" data-a="nav:admin">Back</button></div>`,"admin");navBind();bind();
}
function editStudent(id){
 const p=db.profiles[id]; $("#app").innerHTML=shell(`<div class="card"><div class="profile">${avatar(p)}<div><h2>${esc(p.name)}</h2><div class="muted">${esc(p.desc)}</div></div></div><div class="stats" style="margin-top:16px"><div class="stat"><b>${p.xp}</b><small>XP</small></div><div class="stat"><b>${p.points}</b><small>points</small></div><div class="stat"><b>${p.streak}</b><small>streak</small></div><div class="stat"><b>${p.completed.length}</b><small>lessons</small></div></div><button class="btn secondary full" style="margin-top:15px" data-a="admin:reset:${id}">Reset progress</button><button class="btn secondary full" style="margin-top:8px" data-a="nav:admin">Back</button></div>`,"admin");navBind();bind();
}
function switcher(){
 return `<div class="card"><div class="kicker">Profiles</div><h1 style="font-size:40px">Switch account.</h1><div class="lesson-list">${Object.values(db.profiles).filter(p=>!p.disabled).map(p=>`<div class="lesson"><div class="profile" style="flex:1">${avatar(p)}<div><b>${esc(p.name)}</b><div class="muted">${esc(p.desc)}</div></div></div><button class="btn" data-a="login:${p.id}">Use</button></div>`).join("")}</div><button class="btn secondary full" style="margin-top:12px" data-a="logout">Log out</button></div>`;
}
function navBind(){}
function bind(){
 document.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>act(b.dataset.a,b.dataset.v));
}
function act(a,v){
 if(a==="backAuth"){view="auth";render();return}
 if(a==="createProfile"){ if($("#newName"))createProfile(); else {view="create";render();} return}
 if(a==="setupAdmin"){const a=$("#adminPass").value,b=$("#adminPass2").value;if(!a||a!==b){toast("Passwords must match");return}db.profiles.kyle.passwordHash=btoa(unescape(encodeURIComponent(a)));db.profiles.kyle.passwordSet=true;save(db);setSess("kyle");view="home";render();toast("Kyle admin created");return}
 if(a.startsWith("login:")){const id=a.split(":")[1];setSess(id);if(id!=="kyle"&&!db.profiles[id].onboarded){view="onboardChat";render()}else{view="home";render()}return}
 if(a==="switch"){view="switch";render();return}
 if(a==="logout"){setSess(null);view="auth";render();return}
 if(a.startsWith("nav:")){view=a.split(":")[1];render();return}
 if(a.startsWith("lesson:")){lessonId=+a.split(":")[1];qIndex=0;earned=false;view="lesson";render();return}
 if(a==="answer"){const l=lessons.find(x=>x.id===lessonId),q=l.qs[qIndex];if(v===q[1]){qIndex++;render();}else{current().hearts=Math.max(0,current().hearts-1);save(db);toast("Not quite — try again");}return}
 if(a==="introAnswer"){finishOnboard(v);return}
 if(a==="chatSend"){const input=$("#chatInput"),s=input.value.trim();if(!s)return;chats.push({t:s,me:true},{t:senseiReply(s),me:false});render();return}
 if(a==="voiceStart"){startVoice();return}
 if(a.startsWith("buy:")){const x=db.shop.find(i=>i.id===a.split(":")[1]),p=current();if(!x||p.points<x.price){toast("Not enough points");return}p.points-=x.price;p.purchases.push({item:x.id,at:Date.now()});if(x.id==="heart")p.hearts=5;if(x.id==="freeze")p.inventory.push("streakFreeze");if(x.id==="boost")p.inventory.push("xpBoost");save(db);render();toast(`${x.name} purchased`);return}
 if(a==="admin:create"){adminCreate();return} if(a==="admin:shop"){adminShop();return} if(a==="admin:class"){adminClass();return} if(a==="admin:test"){adminTest();return}
 if(a==="admin:saveStudent"){const name=$("#an").value.trim();if(!name){toast("Add a name");return}const id=name.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"-"+Math.random().toString(36).slice(2,6);db.profiles[id]=blankProfile(id,name,$("#ad").value.trim(),$("#aa").value.trim()||"🧑");db.profiles[id].onboarded=false;save(db);admin();toast("Student created");return}
 if(a==="admin:addShop"){const name=$("#sn").value.trim();if(!name)return toast("Add a name");db.shop.push({id:uid(),name,desc:$("#sd").value.trim(),emoji:$("#se").value.trim()||"✨",price:+$("#sp").value||100,stock:-1});save(db);adminShop();return}
 if(a.startsWith("admin:delShop:")){db.shop=db.shop.filter(x=>x.id!==a.split(":")[2]);save(db);adminShop();return}
 if(a==="admin:addClass"){const name=$("#cn").value.trim();if(!name)return toast("Add a name");db.classes.push({id:uid(),name,members:[]});save(db);adminClass();return}
 if(a==="admin:addTest"){const ids=[...$("#tt").selectedOptions].map(o=>o.value);db.tests.push({id:uid(),title:$("#tn").value.trim()||"Japanese Test",targets:ids,count:+$("#tq").value||5,created:Date.now(),completedBy:[]});save(db);admin();toast("Test assigned");return}
 if(a.startsWith("admin:edit:")){editStudent(a.split(":")[2]);return}
 if(a.startsWith("admin:reset:")){const p=db.profiles[a.split(":")[2]];p.xp=0;p.points=0;p.completed=[];p.streak=0;p.hearts=5;save(db);editStudent(p.id);toast("Progress reset");return}
}

function startVoice(){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){toast("Voice recognition is not supported here yet");return}
 const mic=document.querySelector(".mic"), status=$("#voiceStatus");
 const r=new SR(); r.lang="ja-JP"; r.interimResults=false; r.maxAlternatives=1;
 mic?.classList.add("listening"); if(status)status.textContent="Listening… speak Japanese.";
 r.onresult=e=>{const text=e.results[0][0].transcript; if(status)status.textContent=`Heard: ${text}`; toast("Nice — speaking practice captured");};
 r.onerror=()=>{if(status)status.textContent="I couldn't hear that. Try again.";};
 r.onend=()=>mic?.classList.remove("listening");
 r.start();
}

function toast(s){clearTimeout(toastTimer);const d=document.createElement("div");d.className="toast";d.textContent=s;document.body.appendChild(d);toastTimer=setTimeout(()=>d.remove(),1800)}
if("serviceWorker"in navigator)navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
if(!db.profiles.kyle.passwordSet){view="onboard";render()}else if(current()){view="home";render()}else{view="auth";render()}

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const user = tg.initDataUnsafe.user || {
  id: Math.floor(Math.random()*1e9),
  first_name: "Player"
};

// !!! ВСТАВЬ СВОЙ BACKEND URL !!!
const ws = new WebSocket("wss://telegram-wheel-backend.onrender.com");

const screens = {
  main: document.getElementById("screen-main"),
  wheel: document.getElementById("screen-wheel"),
  win: document.getElementById("screen-win"),
  lose: document.getElementById("screen-lose")
};

function show(name){
  Object.values(screens).forEach(s=>s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

// ---------- отрисовка колеса ----------
function renderWheel(players){
  const wheel = document.getElementById("wheel");
  if(players.length === 0) return;

  const total = players.reduce((s,p)=>s+Number(p.bet),0) || players.length;

  let angle = 0;
  let gradient = [];
  let labels = [];

  players.forEach((p,i)=>{
    const part = (p.bet>0 ? p.bet : 1) / total;
    const deg = part * 360;
    const color = `hsl(${i*70 % 360},80%,60%)`;

    gradient.push(`${color} ${angle}deg ${angle+deg}deg`);

    const mid = angle + deg/2;
    labels.push({name:p.name, angle:mid});

    angle += deg;
  });

  wheel.style.background = `conic-gradient(${gradient.join(",")})`;

  wheel.innerHTML = labels.map(l=>`
    <div class="label" style="
      transform: rotate(${l.angle}deg) translate(0,-140px) rotate(-${l.angle}deg);
    ">
      ${l.name}
    </div>
  `).join("");
}

// ---------- подключение ----------
ws.onopen = ()=>{
  ws.send(JSON.stringify({
    type:"join",
    id:user.id,
    name:user.first_name
  }));
};

// ---------- кнопки ----------
document.getElementById("betBtn").onclick = ()=>{
  const amount = document.getElementById("betAmount").value;
  ws.send(JSON.stringify({type:"bet", id:user.id, amount}));
};

document.getElementById("startBtn").onclick = ()=>{
  ws.send(JSON.stringify({type:"start"}));
};

document.getElementById("backBtnWin").onclick = ()=> show("main");
document.getElementById("backBtnLose").onclick = ()=> show("main");

// ---------- входящие события ----------
ws.onmessage = (event)=>{
  const data = JSON.parse(event.data);

  // обновление состояния
  if(data.type==="state"){
    document.getElementById("bank").innerText = data.totalBank;
    document.getElementById("bankWheel").innerText = data.totalBank;

    const me = data.players.find(p=>p.id==user.id);
    if(me) document.getElementById("balance").innerText = me.balance;

    document.getElementById("playersStrip").innerHTML =
      data.players.map(p=>`
        <div class="player-chip">
          ${p.name} · ${p.chance}%
        </div>
      `).join("");

    renderWheel(data.players);
  }

  // старт раунда — каждый клиент крутит СВОЁ колесо
  if(data.type==="round_start"){
    show("wheel");

    const wheel = document.getElementById("wheel");

    // случайный локальный угол
    const extra = Math.floor(Math.random()*360);
    wheel.style.transform = `rotate(${1440 + extra}deg)`;

    let t = data.time;
    const timer = document.getElementById("timer");
    const int = setInterval(()=>{
      timer.innerText = "Результат через: "+t;
      t--;
      if(t<0) clearInterval(int);
    },1000);
  }

  // конец
  if(data.type==="round_end"){
    setTimeout(()=>{
      if(data.winnerId == user.id){
        document.getElementById("winAmount").innerText =
          "Вы выиграли: "+data.winAmount;
        show("win");
      } else {
        show("lose");
      }
    },500);
  }
};

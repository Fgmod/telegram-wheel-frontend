const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const user = tg.initDataUnsafe.user || {
  id: Math.floor(Math.random()*1e9),
  first_name: "Player"
};

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

ws.onopen = ()=>{
  ws.send(JSON.stringify({type:"join", id:user.id, name:user.first_name}));
};

// кнопки ставок
document.getElementById("betBtn").onclick = ()=>{
  const amount = document.getElementById("betAmount").value;
  ws.send(JSON.stringify({type:"bet", id:user.id, amount}));
};

document.getElementById("startBtn").onclick = ()=>{
  ws.send(JSON.stringify({type:"start"}));
};

// кнопки возврата в лобби
document.getElementById("backBtnWin").onclick = ()=>{
  show("main");
};

document.getElementById("backBtnLose").onclick = ()=>{
  show("main");
};

ws.onmessage = (event)=>{
  const data = JSON.parse(event.data);

  if(data.type==="state"){
    document.getElementById("bank").innerText = data.totalBank;

    const me = data.players.find(p=>p.id==user.id);
    if(me) document.getElementById("balance").innerText = me.balance;

    document.getElementById("playersStrip").innerHTML =
      data.players.map(p=>`
        <div class="player-chip">
          ${p.name} · ${p.chance}%
        </div>
      `).join("");
  }

  if(data.type==="round_start"){
    show("wheel");
    const wheel = document.getElementById("wheel");
    wheel.classList.remove("spin");
    void wheel.offsetWidth;
    wheel.classList.add("spin");

    let t = data.time;
    const timer = document.getElementById("timer");
    const int = setInterval(()=>{
      timer.innerText = "Результат через: "+t;
      t--;
      if(t<0) clearInterval(int);
    },1000);
  }

  if(data.type==="round_end"){
    if(data.winnerId == user.id){
      document.getElementById("winAmount").innerText =
        "Вы выиграли: "+data.winAmount;
      show("win");
    } else {
      show("lose");
    }
  }
};

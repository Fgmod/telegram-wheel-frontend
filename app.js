const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const user = tg.initDataUnsafe.user || {
  id: Math.floor(Math.random()*1e9),
  first_name: "Developer"
};

// ⚠️ сюда потом вставишь URL своего Render backend
const WS_URL = "wss://YOUR-BACKEND.onrender.com";

const ws = new WebSocket(WS_URL);

const screens = {
  main: document.getElementById("screen-main"),
  lobby: document.getElementById("screen-lobby"),
  wheel: document.getElementById("screen-wheel"),
  win: document.getElementById("screen-win"),
  lose: document.getElementById("screen-lose")
};

function show(name){
  Object.values(screens).forEach(s=>s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

document.getElementById("joinBtn").onclick = () => {
  ws.send(JSON.stringify({
    type:"join",
    id:user.id,
    name:user.first_name
  }));
  show("lobby");
};

document.getElementById("startBtn").onclick = () => {
  ws.send(JSON.stringify({type:"start"}));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if(data.type === "players"){
    document.getElementById("players").innerHTML =
      data.players.map(p=>`<div>👤 ${p.name}</div>`).join("");
  }

  if(data.type === "round_start"){
    show("wheel");
    document.getElementById("wheel").classList.add("spin");

    let t = data.time;
    const timerEl = document.getElementById("timer");
    timerEl.innerText = "До выбора победителя: "+t;

    const interval = setInterval(()=>{
      t--;
      timerEl.innerText = "До выбора победителя: "+t;
      if(t<=0) clearInterval(interval);
    },1000);
  }

  if(data.type === "round_end"){
    if(data.winnerId == user.id) show("win");
    else show("lose");
  }
};

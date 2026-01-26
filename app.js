const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#121420');
    tg.setBackgroundColor('#0a0c14');
}

// Пользовательские данные
const user = tg?.initDataUnsafe?.user || {
    id: 'guest_' + Math.floor(Math.random() * 1e9),
    first_name: 'Гость',
    username: 'guest'
};

let isAdmin = false;
let gameMode = 'bots';
let currentBalance = 1000;
let currentBet = 0;
let ws = null;

// Элементы интерфейса
const screens = {
    mode: document.getElementById('screen-mode'),
    main: document.getElementById('screen-main'),
    wheel: document.getElementById('screen-wheel'),
    win: document.getElementById('screen-win'),
    lose: document.getElementById('screen-lose'),
    admin: document.getElementById('screen-admin'),
    support: document.getElementById('screen-support')
};

const elements = {
    balance: document.getElementById('balance'),
    bank: document.getElementById('bank'),
    bankTimer: document.getElementById('bankTimer'),
    gameMode: document.getElementById('gameMode'),
    playersGrid: document.getElementById('playersGrid'),
    betAmountDisplay: document.getElementById('betAmountDisplay'),
    betSlider: document.getElementById('betSlider'),
    wheel: document.getElementById('wheel'),
    wheelTimer: document.getElementById('wheelTimer'),
    currentBets: document.getElementById('currentBets'),
    winAmount: document.getElementById('winAmount'),
    newBalance: document.getElementById('newBalance'),
    loseBalance: document.getElementById('loseBalance'),
    adminStats: document.getElementById('adminStats'),
    playerList: document.getElementById('playerList'),
    supportMessage: document.getElementById('supportMessage')
};

// Уведомления
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.background = type === 'success' 
        ? 'rgba(47, 255, 157, 0.9)' 
        : type === 'error' 
        ? 'rgba(255, 77, 77, 0.9)' 
        : 'rgba(77, 124, 255, 0.9)';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Показать экран
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    if (screens[screenName]) {
        screens[screenName].classList.remove('hidden');
    }
    
    // Обновить активную кнопку навигации
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.screen === screenName) {
            item.classList.add('active');
        }
    });
}

// Подключение к WebSocket
function connectWebSocket() {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const wsUrl = isLocalhost ? 'ws://localhost:3000' : 'wss://telegram-wheel-backend.onrender.com';
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('Connected to server');
        ws.send(JSON.stringify({
            type: 'join',
            id: user.id,
            name: user.first_name || 'Player'
        }));
    };
    
    ws.onclose = () => {
        console.log('Disconnected from server');
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleServerMessage(data);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    };
}

// Обработка сообщений от сервера
function handleServerMessage(data) {
    switch (data.type) {
        case 'init':
            currentBalance = data.balance;
            isAdmin = data.isAdmin;
            updateBalance();
            if (isAdmin) {
                document.getElementById('adminBtn').style.display = 'block';
            }
            break;
            
        case 'state':
            updateGameState(data);
            break;
            
        case 'round_start':
            startWheelAnimation(data.time);
            break;
            
        case 'round_end':
            handleRoundEnd(data);
            break;
            
        case 'admin_response':
            if (data.success) {
                showNotification('Команда выполнена успешно', 'success');
                if (data.newBalance !== undefined) {
                    currentBalance = data.newBalance;
                    updateBalance();
                }
            } else {
                showNotification(data.error || 'Ошибка выполнения команды', 'error');
            }
            break;
            
        case 'support_response':
            showNotification(data.message, 'success');
            break;
    }
}

// Обновление состояния игры
function updateGameState(data) {
    elements.bank.textContent = data.totalBank;
    gameMode = data.gameMode || 'bots';
    elements.gameMode.textContent = gameMode === 'bots' ? '🤖 С ботами' : '👥 PvP Лобби';
    
    // Обновление сетки игроков
    elements.playersGrid.innerHTML = data.players.map(player => `
        <div class="player-card ${player.id === user.id ? 'active' : ''}">
            <div class="player-name">${player.name} ${player.isBot ? '🤖' : ''}</div>
            <div class="player-bet">${player.bet}</div>
            <div class="player-chance">${player.chance}% шанс</div>
        </div>
    `).join('');
    
    // Обновление кнопки запуска
    const startBtn = document.getElementById('startRoundBtn');
    startBtn.disabled = data.totalBank === 0;
}

// Анимация колеса
function startWheelAnimation(time) {
    showScreen('wheel');
    
    // Создание секторов колеса
    const sectors = 12;
    const colors = ['#2fff9d', '#ff4d4d', '#4d7cff', '#ffd54a', '#9d2fff', '#2fffcf'];
    elements.wheel.innerHTML = '';
    
    for (let i = 0; i < sectors; i++) {
        const sector = document.createElement('div');
        sector.className = 'wheel-sector';
        sector.style.transform = `rotate(${i * (360 / sectors)}deg)`;
        sector.style.background = colors[i % colors.length];
        sector.style.clipPath = 'polygon(0 0, 100% 0, 100% 100%)';
        
        if (i % 3 === 0) {
            const text = document.createElement('div');
            text.textContent = `S${i + 1}`;
            text.style.transform = 'rotate(45deg)';
            sector.appendChild(text);
        }
        
        elements.wheel.appendChild(sector);
    }
    
    // Таймер
    let t = time;
    const updateTimer = () => {
        elements.wheelTimer.textContent = t.toString().padStart(2, '0');
        t--;
        
        if (t >= 0) {
            setTimeout(updateTimer, 1000);
        } else {
            elements.wheel.classList.add('spin');
        }
    };
    
    updateTimer();
}

// Обработка конца раунда
function handleRoundEnd(data) {
    if (data.winnerId === user.id) {
        currentBalance += data.winAmount;
        elements.winAmount.textContent = `+${data.winAmount}`;
        elements.newBalance.textContent = currentBalance;
        showScreen('win');
        showNotification(`🎉 Вы выиграли ${data.winAmount}!`, 'success');
    } else {
        elements.loseBalance.textContent = currentBalance;
        showScreen('lose');
    }
    updateBalance();
}

// Обновление баланса
function updateBalance() {
    elements.balance.textContent = currentBalance;
    elements.betSlider.max = currentBalance;
}

// Установка ставки
function setBet(amount) {
    amount = Math.min(amount, currentBalance);
    currentBet = amount;
    elements.betAmountDisplay.textContent = amount;
    elements.betSlider.value = amount;
}

// События
document.addEventListener('DOMContentLoaded', () => {
    // Навигация
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const screen = item.dataset.screen;
            if (screen && screens[screen]) {
                showScreen(screen);
            }
        });
    });
    
    // Выбор режима
    document.querySelectorAll('.mode-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.mode-option').forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            gameMode = option.dataset.mode;
        });
    });
    
    document.getElementById('confirmModeBtn').addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'select_mode',
                id: user.id,
                mode: gameMode
            }));
        }
        showScreen('main');
    });
    
    // Кнопки ставок
    document.querySelectorAll('.bet-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = parseInt(btn.dataset.amount);
            setBet(currentBet + amount);
        });
    });
    
    // Слайдер ставки
    elements.betSlider.addEventListener('input', (e) => {
        setBet(parseInt(e.target.value));
    });
    
    // Сделать ставку
    document.getElementById('placeBetBtn').addEventListener('click', () => {
        if (currentBet > 0 && currentBet <= currentBalance) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'bet',
                    id: user.id,
                    amount: currentBet
                }));
                showNotification(`Ставка ${currentBet} принята!`, 'success');
                setBet(0);
            }
        }
    });
    
    // Запуск раунда
    document.getElementById('startRoundBtn').addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'start',
                id: user.id
            }));
        }
    });
    
    // Смена режима
    document.getElementById('changeModeBtn').addEventListener('click', () => {
        showScreen('mode');
    });
    
    // Кнопки "Играть снова"
    document.getElementById('playAgainBtn').addEventListener('click', () => {
        showScreen('main');
    });
    
    document.getElementById('tryAgainBtn').addEventListener('click', () => {
        showScreen('main');
    });
    
    // Админ панель
    document.getElementById('adminBtn').addEventListener('click', () => {
        if (isAdmin) {
            showScreen('admin');
            loadAdminStats();
        }
    });
    
    document.getElementById('backFromAdminBtn').addEventListener('click', () => {
        showScreen('main');
    });
    
    // Добавление баланса игроку
    document.getElementById('addBalanceBtn').addEventListener('click', () => {
        const playerId = document.getElementById('playerIdInput').value;
        const amount = parseInt(document.getElementById('addAmountInput').value);
        
        if (playerId && amount > 0 && ws) {
            ws.send(JSON.stringify({
                type: 'admin_command',
                id: user.id,
                command: 'add_balance',
                data: { userId: playerId, amount }
            }));
        }
    });
    
    // Поддержка
    document.getElementById('supportBtn').addEventListener('click', () => {
        showScreen('support');
    });
    
    document.getElementById('sendSupportBtn').addEventListener('click', () => {
        const message = elements.supportMessage.value;
        if (message && ws) {
            ws.send(JSON.stringify({
                type: 'support_message',
                id: user.id,
                message
            }));
            elements.supportMessage.value = '';
            showNotification('Сообщение отправлено администратору', 'success');
            showScreen('main');
        }
    });
    
    document.getElementById('backFromSupportBtn').addEventListener('click', () => {
        showScreen('main');
    });
    
    // Запуск
    connectWebSocket();
    updateBalance();
    
    // Показываем выбор режима при первом запуске
    showScreen('mode');
});

// Загрузка статистики для админа
function loadAdminStats() {
    if (ws && isAdmin) {
        ws.send(JSON.stringify({
            type: 'admin_command',
            id: user.id,
            command: 'get_stats'
        }));
    }
}

// Автоматическое обновление баланса каждые 5 секунд (для тестирования)
if (window.location.hostname === 'localhost') {
    setInterval(() => {
        if (currentBalance < 100) {
            currentBalance += 500;
            updateBalance();
            showNotification('Баланс пополнен (тестовый режим)', 'success');
        }
    }, 30000);
}

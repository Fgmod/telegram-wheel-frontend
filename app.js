// Конфигурация
const CONFIG = {
    WS_URL: 'wss://telegram-wheel-backend.onrender.com',
    LOCAL_WS_URL: 'ws://localhost:3000',
    RECONNECT_DELAY: 3000,
    MAX_RECONNECT_ATTEMPTS: 5,
    START_BALANCE: 1000,
    VERSION: '1.0.0'
};

// Глобальные переменные
let tg = null;
let user = null;
let isAdmin = false;
let gameMode = 'bots';
let currentBalance = CONFIG.START_BALANCE;
let currentBet = 0;
let playerStats = { wins: 0, losses: 0, totalBet: 0, totalWon: 0 };
let ws = null;
let reconnectAttempts = 0;
let isConnected = false;
let isReady = false;
let playerId = null;
let isDevelopmentMode = false;
let demoInterval = null;
let serverOnline = false;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    initEventListeners();
});

function initApp() {
    // Проверяем, находимся ли мы в Telegram Web App
    if (window.Telegram && window.Telegram.WebApp) {
        // Режим Telegram
        tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        
        user = tg.initDataUnsafe?.user || {
            id: Math.floor(Math.random() * 1e9),
            first_name: 'Игрок',
            username: 'player_' + Date.now()
        };
        
        isDevelopmentMode = false;
        console.log('🔗 Telegram Web App mode');
    } else {
        // Режим разработки (без Telegram)
        console.log('⚡ Development mode enabled');
        isDevelopmentMode = true;
        
        // Создаем тестового пользователя
        user = {
            id: Math.floor(Math.random() * 1e9),
            first_name: 'Тестовый Игрок',
            username: 'test_player_' + Date.now().toString().slice(-6)
        };
        
        // Для тестов можно включить админ режим через URL параметр
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('admin')) {
            user.id = '1743237033'; // Устанавливаем ваш ID для админ-панели
            console.log('👑 Admin mode enabled via URL parameter');
        }
        
        // Или если ID совпадает с админским
        if (user.id.toString() === '1743237033') {
            console.log('👑 Admin mode enabled (matching ID)');
        }
    }
    
    // Проверяем админа по ID
    isAdmin = checkIfAdmin(user.id);
    console.log(`👤 User: ${user.first_name}, ID: ${user.id}, Admin: ${isAdmin}`);
    
    // Применяем тему Telegram если доступна
    applyTelegramTheme();
    
    // Показываем лоадер на короткое время для плавного старта
    setTimeout(() => {
        // Пытаемся подключиться к WebSocket
        connectWebSocket();
        
        // На всякий случай устанавливаем таймаут для отображения интерфейса
        setTimeout(() => {
            const loader = document.getElementById('loader');
            if (loader && !loader.classList.contains('hidden')) {
                console.log('🕒 Fallback: showing interface after timeout');
                loader.classList.add('hidden');
                document.getElementById('app')?.classList.remove('hidden');
                
                // Если всё ещё не подключились, показываем демо-режим
                if (!isConnected && isDevelopmentMode) {
                    showNotification('Режим разработки: используем демо-данные', 'info');
                    startDemoMode();
                }
            }
        }, 3000);
    }, 500);
}

// Проверка админа (только ваш ID)
function checkIfAdmin(userId) {
    const ADMIN_IDS = ["1743237033"];
    const isAdmin = ADMIN_IDS.includes(userId.toString());
    console.log(`🔐 Admin check for ${userId}: ${isAdmin}`);
    return isAdmin;
}

function initEventListeners() {
    console.log('🎮 Initializing event listeners...');
    
    // Кнопка смены режима
    const changeModeBtn = document.getElementById('changeModeBtn');
    if (changeModeBtn) {
        changeModeBtn.addEventListener('click', () => {
            console.log('🔄 Mode change button clicked');
            showScreen('mode');
        });
    }
    
    // Выбор режима
    document.querySelectorAll('.mode-card').forEach(card => {
        card.addEventListener('click', () => {
            console.log('🎯 Mode card clicked');
            document.querySelectorAll('.mode-card').forEach(c => {
                c.classList.remove('active');
                const icon = c.querySelector('.mode-select i');
                if (icon) icon.className = 'far fa-check-circle';
            });
            
            card.classList.add('active');
            const icon = card.querySelector('.mode-select i');
            if (icon) icon.className = 'fas fa-check-circle';
        });
    });
    
    // Подтверждение выбора режима
    const confirmModeBtn = document.getElementById('confirmModeBtn');
    if (confirmModeBtn) {
        confirmModeBtn.addEventListener('click', confirmMode);
    }
    
    // Ставки
    document.getElementById('placeBetBtn')?.addEventListener('click', placeBet);
    document.getElementById('clearBetBtn')?.addEventListener('click', clearBet);
    
    // Быстрые ставки
    document.querySelectorAll('.bet-quick-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            console.log(`💰 Quick bet: ${action}`);
            handleQuickBet(action);
        });
    });
    
    // Увеличение/уменьшение ставки
    document.getElementById('increaseBet')?.addEventListener('click', () => {
        setBet(currentBet + 10);
    });
    
    document.getElementById('decreaseBet')?.addEventListener('click', () => {
        setBet(Math.max(0, currentBet - 10));
    });
    
    // Слайдер ставки
    const betSlider = document.getElementById('betSlider');
    if (betSlider) {
        betSlider.addEventListener('input', (e) => {
            setBet(parseInt(e.target.value));
        });
    }
    
    // Ввод ставки
    const betInput = document.getElementById('betInput');
    if (betInput) {
        betInput.addEventListener('input', (e) => {
            const value = parseInt(e.target.value) || 0;
            setBet(value);
        });
    }
    
    // Запуск раунда
    const startRoundBtn = document.getElementById('startRoundBtn');
    if (startRoundBtn) {
        startRoundBtn.addEventListener('click', startRound);
    }
    
    // Навигация
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const screen = e.target.closest('.nav-btn').dataset.screen;
            if (screen) {
                console.log(`📱 Navigation to: ${screen}`);
                showScreen(screen);
            }
        });
    });
    
    // Быстрый старт
    const quickStartBtn = document.getElementById('quickStartBtn');
    if (quickStartBtn) {
        quickStartBtn.addEventListener('click', () => {
            console.log('⚡ Quick start clicked');
            if (gameMode === 'bots') {
                setBet(Math.floor(currentBalance * 0.5));
                setTimeout(() => placeBet(), 100);
                setTimeout(() => startRound(), 200);
            } else {
                setBet(Math.floor(currentBalance * 0.25));
                setTimeout(() => placeBet(), 100);
            }
        });
    }
    
    // Кнопки на экранах результатов
    document.getElementById('playAgainBtn')?.addEventListener('click', () => showScreen('main'));
    document.getElementById('tryAgainBtn')?.addEventListener('click', () => showScreen('main'));
    document.getElementById('shareWinBtn')?.addEventListener('click', shareResult);
    
    // Кнопки назад
    document.getElementById('backFromAdminBtn')?.addEventListener('click', () => showScreen('main'));
    document.getElementById('backFromSupportBtn')?.addEventListener('click', () => showScreen('main'));
    document.getElementById('backFromStatsBtn')?.addEventListener('click', () => showScreen('main'));
    
    // Поддержка
    document.getElementById('supportBtn')?.addEventListener('click', () => showScreen('support'));
    document.getElementById('supportMainBtn')?.addEventListener('click', () => showScreen('support'));
    document.getElementById('sendSupportBtn')?.addEventListener('click', sendSupportMessage);
    
    // Подсчет символов в сообщении поддержки
    const supportTextarea = document.getElementById('supportMessage');
    if (supportTextarea) {
        supportTextarea.addEventListener('input', (e) => {
            const count = e.target.value.length;
            const charCount = document.getElementById('charCount');
            if (charCount) charCount.textContent = count;
            
            if (count > 500) {
                e.target.value = e.target.value.substring(0, 500);
                if (charCount) charCount.textContent = 500;
            }
        });
    }
    
    // Админ панель
    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) {
        adminBtn.addEventListener('click', () => {
            if (isAdmin) {
                console.log('👑 Opening admin panel');
                showScreen('admin');
                loadAdminData();
            } else {
                showNotification('Доступ запрещен', 'error');
            }
        });
    }
    
    // Админ кнопки
    document.querySelectorAll('.control-btn[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.closest('.control-btn').dataset.action;
            console.log(`🛠 Admin action: ${action}`);
            handleAdminAction(action);
        });
    });
    
    document.getElementById('resetAllBtn')?.addEventListener('click', () => {
        if (confirm('Сбросить балансы всех игроков?')) {
            sendAdminCommand('reset_game', {});
        }
    });
    
    // Профиль
    document.getElementById('profileBtn')?.addEventListener('click', () => {
        showScreen('stats');
        updateStatsDisplay();
    });
    
    console.log('✅ Event listeners initialized');
}

function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('ℹ️ WebSocket already connected');
        return;
    }
    
    // Определяем URL WebSocket
    let wsUrl = isDevelopmentMode ? CONFIG.LOCAL_WS_URL : CONFIG.WS_URL;
    
    // Для локального тестирования пробуем оба варианта
    if (isDevelopmentMode) {
        console.log(`🌐 Trying to connect to: ${wsUrl}`);
    }
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('✅ WebSocket connected successfully');
            isConnected = true;
            serverOnline = true;
            reconnectAttempts = 0;
            
            // Скрываем лоадер
            const loader = document.getElementById('loader');
            if (loader) loader.classList.add('hidden');
            document.getElementById('app')?.classList.remove('hidden');
            
            // Отправляем информацию о подключении
            const joinData = {
                type: 'join',
                id: user.id,
                name: user.first_name || 'Player',
                username: user.username || 'player'
            };
            
            console.log('📤 Sending join data:', joinData);
            ws.send(JSON.stringify(joinData));
            
            showNotification('Соединение с сервером установлено', 'success');
        };
        
        ws.onclose = (event) => {
            console.log('❌ WebSocket disconnected:', event.code, event.reason);
            isConnected = false;
            serverOnline = false;
            
            // В режиме разработки переключаемся на демо-режим
            if (isDevelopmentMode && reconnectAttempts >= 1) {
                console.log('🎮 Switching to demo mode for development');
                const loader = document.getElementById('loader');
                if (loader) loader.classList.add('hidden');
                document.getElementById('app')?.classList.remove('hidden');
                startDemoMode();
                return;
            }
            
            // Пытаемся переподключиться
            if (reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`🔄 Reconnecting... (attempt ${reconnectAttempts}/${CONFIG.MAX_RECONNECT_ATTEMPTS})`);
                setTimeout(connectWebSocket, CONFIG.RECONNECT_DELAY);
            } else {
                console.log('💥 Max reconnection attempts reached');
                showNotification('Не удалось подключиться к серверу', 'error');
                
                // В режиме разработки показываем интерфейс
                if (isDevelopmentMode) {
                    const loader = document.getElementById('loader');
                    if (loader) loader.classList.add('hidden');
                    document.getElementById('app')?.classList.remove('hidden');
                    startDemoMode();
                }
            }
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            
            // В режиме разработки игнорируем ошибки и переходим в демо-режим
            if (isDevelopmentMode) {
                console.log('🎮 Development mode: ignoring WebSocket error, starting demo');
                isConnected = false;
                serverOnline = false;
                
                const loader = document.getElementById('loader');
                if (loader) loader.classList.add('hidden');
                document.getElementById('app')?.classList.remove('hidden');
                
                startDemoMode();
            } else {
                showNotification('Ошибка соединения с сервером', 'error');
            }
        };
        
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📥 Received message:', data.type);
                handleServerMessage(data);
            } catch (error) {
                console.error('Error parsing message:', error, 'Raw:', event.data);
            }
        };
        
    } catch (error) {
        console.error('WebSocket connection error:', error);
        
        // В режиме разработки продолжаем работу
        if (isDevelopmentMode) {
            console.log('🎮 Development mode: starting after connection error');
            const loader = document.getElementById('loader');
            if (loader) loader.classList.add('hidden');
            document.getElementById('app')?.classList.remove('hidden');
            
            startDemoMode();
        } else {
            showNotification('Ошибка при подключении к серверу', 'error');
        }
    }
}

// Демо-режим для разработки
function startDemoMode() {
    console.log('🚀 Starting demo mode');
    
    // Имитируем подключение к серверу
    setTimeout(() => {
        handleServerMessage({
            type: 'init',
            balance: CONFIG.START_BALANCE,
            isAdmin: isAdmin,
            gameMode: 'bots',
            playerId: user.id
        });
        
        // Показываем начальный экран выбора режима
        showScreen('mode');
        
        // Устанавливаем демо-данные
        setupDemoData();
        
        // Запускаем периодическое обновление демо-данных
        if (demoInterval) clearInterval(demoInterval);
        demoInterval = setInterval(updateDemoData, 5000);
        
        showNotification('Демо-режим активирован. Сервер не требуется.', 'info');
        
        // Показываем кнопку для теста колеса
        setTimeout(() => {
            if (isDevelopmentMode) {
                const testBtn = document.createElement('button');
                testBtn.innerHTML = '🎮 Тест колеса (демо)';
                testBtn.style.cssText = `
                    position: fixed;
                    bottom: 80px;
                    right: 10px;
                    z-index: 1000;
                    background: linear-gradient(90deg, #2fff9d, #2ea6ff);
                    color: #0b0e17;
                    border: none;
                    padding: 10px 15px;
                    border-radius: 20px;
                    font-weight: bold;
                    font-size: 12px;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(47, 255, 157, 0.4);
                `;
                testBtn.onclick = demoWheel;
                document.body.appendChild(testBtn);
            }
        }, 1000);
    }, 500);
}

function setupDemoData() {
    // Имитируем начальное состояние игры
    updateGameState({
        players: [
            {
                id: user.id,
                name: user.first_name,
                bet: 0,
                balance: CONFIG.START_BALANCE,
                chance: '0.0',
                isBot: false,
                isOnline: true,
                ready: false,
                lobbyId: 'bots'
            },
            {
                id: 'bot_1',
                name: '🤖 BOT_1',
                bet: 100,
                balance: 950,
                chance: '25.0',
                isBot: true,
                isOnline: true,
                ready: true,
                lobbyId: 'bots'
            },
            {
                id: 'bot_2',
                name: '🤖 BOT_2',
                bet: 200,
                balance: 900,
                chance: '50.0',
                isBot: true,
                isOnline: true,
                ready: true,
                lobbyId: 'bots'
            },
            {
                id: 'bot_3',
                name: '🤖 BOT_3',
                bet: 100,
                balance: 850,
                chance: '25.0',
                isBot: true,
                isOnline: true,
                ready: true,
                lobbyId: 'bots'
            }
        ],
        totalBank: 400,
        gameMode: 'bots',
        readyPlayers: 3,
        totalPlayers: 4,
        lobbyReady: true
    });
}

function updateDemoData() {
    if (!isDevelopmentMode || !isConnected) return;
    
    // Обновляем демо-данные
    const players = [
        {
            id: user.id,
            name: user.first_name,
            bet: currentBet,
            balance: currentBalance,
            chance: currentBet > 0 ? (Math.random() * 50 + 10).toFixed(1) : '0.0',
            isBot: false,
            isOnline: true,
            ready: false,
            lobbyId: gameMode
        }
    ];
    
    // Добавляем ботов с рандомными ставками
    for (let i = 1; i <= 3; i++) {
        const botBet = Math.floor(Math.random() * 300) + 50;
        players.push({
            id: `bot_${i}`,
            name: `🤖 BOT_${i}`,
            bet: botBet,
            balance: CONFIG.START_BALANCE - botBet,
            chance: (Math.random() * 30 + 10).toFixed(1),
            isBot: true,
            isOnline: true,
            ready: true,
            lobbyId: gameMode
        });
    }
    
    const totalBank = players.reduce((sum, p) => sum + p.bet, 0);
    
    updateGameState({
        players: players,
        totalBank: totalBank,
        gameMode: gameMode,
        readyPlayers: players.filter(p => p.ready).length,
        totalPlayers: players.length,
        lobbyReady: gameMode === 'bots' || players.filter(p => !p.isBot).every(p => p.ready)
    });
}

function demoWheel() {
    console.log('🎡 Starting demo wheel');
    
    if (currentBet === 0) {
        setBet(100);
    }
    
    // Имитируем запуск колеса
    handleServerMessage({
        type: 'round_start',
        time: 6,
        sectors: [
            { name: user.first_name.substring(0, 8), color: "#2fff9d", size: 30 },
            { name: "BOT_1", color: "#ff4d4d", size: 25 },
            { name: "BOT_2", color: "#4d7cff", size: 20 },
            { name: "BOT_3", color: "#ffd54a", size: 15 },
            { name: "BOT_4", color: "#9d2fff", size: 10 }
        ]
    });
    
    // Через 7 секунд показываем случайный результат
    setTimeout(() => {
        const win = Math.random() > 0.4; // 60% шанс на победу в демо
        if (win) {
            const winAmount = currentBet * 2;
            currentBalance += winAmount;
            
            handleServerMessage({
                type: 'round_end',
                winnerId: user.id,
                winnerName: user.first_name,
                winAmount: winAmount,
                stats: {
                    playerStats: {
                        [user.id]: {
                            wins: (playerStats.wins || 0) + 1,
                            losses: playerStats.losses || 0,
                            totalBet: (playerStats.totalBet || 0) + currentBet,
                            totalWon: (playerStats.totalWon || 0) + winAmount
                        }
                    }
                }
            });
            
            showNotification(`🎉 Демо-победа! Вы выиграли ${winAmount}!`, 'success');
        } else {
            handleServerMessage({
                type: 'round_end',
                winnerId: 'bot_1',
                winnerName: '🤖 BOT_1',
                winAmount: currentBet * 3,
                stats: {
                    playerStats: {
                        [user.id]: {
                            wins: playerStats.wins || 0,
                            losses: (playerStats.losses || 0) + 1,
                            totalBet: (playerStats.totalBet || 0) + currentBet,
                            totalWon: playerStats.totalWon || 0
                        }
                    }
                }
            });
            
            showNotification('😢 Демо-поражение. Попробуйте еще раз!', 'info');
        }
        
        currentBet = 0;
        setBet(0);
        updateUI();
    }, 7000);
}

function handleServerMessage(data) {
    console.log(`📨 Handling server message: ${data.type}`);
    
    switch (data.type) {
        case 'init':
            handleInit(data);
            break;
        case 'state':
            updateGameState(data);
            break;
        case 'round_start':
            startWheelAnimation(data.time, data.sectors);
            break;
        case 'round_end':
            handleRoundEnd(data);
            break;
        case 'mode_changed':
            gameMode = data.mode;
            updateUI();
            break;
        case 'lobby_ready':
            showNotification(data.message, 'success');
            break;
        case 'error':
            showNotification(data.message, 'error');
            break;
        case 'admin_response':
            handleAdminResponse(data);
            break;
        case 'support_response':
            showNotification(data.message, 'success');
            break;
        case 'support_notification':
            handleSupportNotification(data);
            break;
        case 'pong':
            // Пинг-понг
            break;
    }
}

function handleInit(data) {
    console.log('🎯 Initializing game with data:', data);
    
    currentBalance = data.balance || CONFIG.START_BALANCE;
    isAdmin = data.isAdmin || false;
    gameMode = data.gameMode || 'bots';
    playerId = data.playerId || user.id;
    
    // Сохраняем статистику если она пришла с сервера
    if (data.stats) {
        playerStats = {
            wins: data.stats.totalWins || 0,
            losses: data.stats.totalLosses || 0,
            totalBet: data.stats.totalBets || 0,
            totalWon: data.stats.totalWon || 0,
            gamesPlayed: data.stats.gamesPlayed || 0,
            joinDate: data.stats.joinDate || new Date().toISOString()
        };
        
        // Обновляем отображение статистики
        updateStatsDisplay();
    }
    
    updateUI();
    
    // Показываем админ кнопку если админ
    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) {
        adminBtn.style.display = isAdmin ? 'block' : 'none';
    }
    
    // Если мы в режиме разработки и нет данных о ботах, настраиваем демо
    if (isDevelopmentMode && !serverOnline) {
        setTimeout(() => {
            showScreen('mode');
        }, 500);
    }
}

function updateGameState(data) {
    console.log('🔄 Updating game state');
    
    // Обновляем банк
    const bankElement = document.getElementById('bank');
    if (bankElement) bankElement.textContent = data.totalBank || 0;
    
    // Обновляем количество игроков
    const playersCountElement = document.getElementById('playersCount');
    if (playersCountElement) playersCountElement.textContent = data.totalPlayers || 1;
    
    // Обновляем тип лобби
    const lobbyTypeElement = document.getElementById('lobbyType');
    if (lobbyTypeElement) {
        lobbyTypeElement.textContent = data.gameMode === 'pvp' ? 'PvP' : 'Боты';
    }
    
    // Обновляем игроков
    const playersGrid = document.getElementById('playersGrid');
    if (playersGrid && data.players) {
        playersGrid.innerHTML = data.players.map(player => `
            <div class="player-card ${player.id === playerId ? 'active' : ''}">
                <div class="player-name">
                    ${player.name} 
                    ${player.isBot ? '🤖' : ''}
                    ${player.ready ? ' ✅' : ''}
                </div>
                <div class="player-bet">${player.bet || 0}</div>
                <div class="player-chance">${player.chance || '0.0'}%</div>
                <div class="player-balance">${player.balance || 0}</div>
            </div>
        `).join('');
    }
    
    // Обновляем свой баланс и ставку
    const currentPlayer = data.players?.find(p => p.id === playerId);
    if (currentPlayer) {
        currentBalance = currentPlayer.balance || currentBalance;
        currentBet = currentPlayer.bet || 0;
        
        document.getElementById('balance').textContent = currentBalance;
        const playerBetElement = document.getElementById('playerBet');
        if (playerBetElement) playerBetElement.textContent = currentBet;
        
        const playerChanceElement = document.getElementById('playerChance');
        if (playerChanceElement) playerChanceElement.textContent = currentPlayer.chance || '0%';
        
        // Обновляем интерфейс ставок
        document.getElementById('currentBetDisplay').textContent = currentBet;
        document.getElementById('betInput').value = currentBet;
        document.getElementById('betSlider').value = currentBet;
        document.getElementById('betSlider').max = currentBalance;
        
        // Обновляем статус готовности
        isReady = currentPlayer.ready || false;
    }
    
    // Для PvP режима показываем секцию готовности
    const pvpSection = document.getElementById('pvpReadySection');
    if (pvpSection) {
        if (data.gameMode === 'pvp') {
            pvpSection.style.display = 'block';
            showPvPReadySection(data);
        } else {
            pvpSection.style.display = 'none';
        }
    }
    
    // Обновляем кнопку старта
    const startBtn = document.getElementById('startRoundBtn');
    if (startBtn) {
        const canStart = data.totalBank > 0 && 
            (data.gameMode === 'bots' || (data.gameMode === 'pvp' && data.lobbyReady));
        
        startBtn.disabled = !canStart;
        
        if (data.gameMode === 'pvp') {
            startBtn.innerHTML = data.lobbyReady ? 
                '<i class="fas fa-play-circle"></i> Все готовы!' :
                `<i class="fas fa-users"></i> Готовы: ${data.readyPlayers || 0}/${data.totalPlayers || 1}`;
        } else {
            startBtn.innerHTML = '<i class="fas fa-play-circle"></i> Запустить раунд';
        }
    }
    
    // Обновляем подсказку
    const startHint = document.getElementById('startHint');
    if (startHint) {
        if (data.gameMode === 'pvp') {
            startHint.textContent = data.lobbyReady ? 
                'Все игроки готовы! Нажмите для старта!' :
                `Ждем готовности игроков (${data.readyPlayers || 0}/${data.totalPlayers || 1})`;
        } else {
            startHint.textContent = data.totalBank > 0 ? 
                'Раунд готов к запуску!' :
                'Сделайте ставку чтобы начать';
        }
    }
}

function showPvPReadySection(data) {
    const pvpSection = document.getElementById('pvpReadySection');
    if (!pvpSection) return;
    
    const readyPlayers = data.players?.filter(p => p.ready).length || 0;
    const totalPlayers = data.totalPlayers || 1;
    
    pvpSection.innerHTML = `
        <h3><i class="fas fa-users"></i> Готовность к игре</h3>
        <div class="ready-players">
            ${data.players?.map(player => `
                <div class="player-ready-indicator">
                    <div class="ready-dot ${player.ready ? 'ready' : 'waiting'}"></div>
                    <div class="ready-text">${player.name.split(' ')[0] || player.name}</div>
                </div>
            `).join('')}
        </div>
        <p>${readyPlayers}/${totalPlayers} игроков готовы</p>
        <button id="toggleReadyBtn" class="ready-btn ${isReady ? 'ready' : ''}">
            ${isReady ? '✅ Я готов' : '⏳ Я не готов'}
        </button>
        ${data.lobbyReady ? 
            '<p class="ready-message">🎉 Все готовы! Раунд скоро начнется!</p>' : 
            '<p class="waiting-message">Ждем готовности всех игроков...</p>'}
    `;
    
    // Обновляем слушатель событий для кнопки готовности
    const toggleBtn = document.getElementById('toggleReadyBtn');
    if (toggleBtn) {
        toggleBtn.onclick = toggleReady;
    }
}

function toggleReady() {
    console.log('✅ Toggle ready clicked');
    
    if (serverOnline && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'toggle_ready',
            id: playerId
        }));
    } else if (isDevelopmentMode) {
        // В демо-режиме просто меняем состояние
        isReady = !isReady;
        showNotification(isReady ? 'Вы готовы к игре!' : 'Вы больше не готовы', 'info');
        updateDemoData();
    }
}

function confirmMode() {
    const selectedMode = document.querySelector('.mode-card.active')?.dataset.mode;
    if (!selectedMode) {
        showNotification('Выберите режим игры', 'error');
        return;
    }
    
    console.log(`🎮 Selected mode: ${selectedMode}`);
    gameMode = selectedMode;
    
    if (serverOnline && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'select_mode',
            id: playerId,
            mode: selectedMode
        }));
    } else if (isDevelopmentMode) {
        // В демо-режиме просто обновляем UI
        showNotification(`Режим изменен на: ${selectedMode === 'pvp' ? 'PvP' : 'Боты'}`, 'success');
        handleServerMessage({
            type: 'mode_changed',
            mode: selectedMode
        });
    }
    
    showScreen('main');
    updateUI();
}

function setBet(amount) {
    amount = Math.min(amount, currentBalance);
    amount = Math.max(0, amount);
    currentBet = amount;
    
    document.getElementById('betInput').value = amount;
    document.getElementById('betSlider').value = amount;
    document.getElementById('currentBetDisplay').textContent = amount;
}

function handleQuickBet(action) {
    let amount = 0;
    
    switch (action) {
        case 'min':
            amount = 10;
            break;
        case '25%':
            amount = Math.floor(currentBalance * 0.25);
            break;
        case '50%':
            amount = Math.floor(currentBalance * 0.5);
            break;
        case '75%':
            amount = Math.floor(currentBalance * 0.75);
            break;
        case 'max':
            amount = currentBalance;
            break;
    }
    
    // Округляем до десятков
    amount = Math.floor(amount / 10) * 10;
    setBet(amount);
}

function placeBet() {
    if (currentBet <= 0) {
        showNotification('Введите сумму ставки', 'error');
        return;
    }
    
    if (currentBet > currentBalance) {
        showNotification('Недостаточно средств', 'error');
        return;
    }
    
    console.log(`💰 Placing bet: ${currentBet}`);
    
    if (serverOnline && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'bet',
            id: playerId,
            amount: currentBet
        }));
    } else if (isDevelopmentMode) {
        // В демо-режиме имитируем ставку
        currentBalance -= currentBet;
        updateUI();
        showNotification(`Ставка ${currentBet} принята!`, 'success');
        
        // Имитируем ставки ботов
        setTimeout(() => {
            updateDemoData();
        }, 500);
    }
}

function clearBet() {
    console.log('🗑 Clearing bet');
    
    if (serverOnline && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'clear_bet',
            id: playerId
        }));
    } else if (isDevelopmentMode) {
        // В демо-режиме просто сбрасываем
        currentBalance += currentBet;
        currentBet = 0;
        setBet(0);
        showNotification('Ставка сброшена', 'info');
        updateUI();
    }
}

function startRound() {
    console.log('🎬 Starting round');
    
    if (serverOnline && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'start',
            id: playerId
        }));
    } else if (isDevelopmentMode) {
        // В демо-режиме запускаем демо-колесо
        demoWheel();
    }
}

function startWheelAnimation(time, sectors) {
    console.log('🎡 Starting wheel animation');
    showScreen('wheel');
    
    // Создаем динамические сектора
    createWheelSectors(sectors);
    
    // Показываем текущие ставки с эмодзи
    updateBetsList(sectors);
    
    // Таймер
    let remaining = time || 6;
    const timerEl = document.getElementById('wheelTimer');
    const timer = setInterval(() => {
        if (remaining >= 0) {
            timerEl.innerHTML = `<i class="fas fa-hourglass-half"></i> ${remaining.toString().padStart(2, '0')}`;
            
            // Анимация пульсации в последние 3 секунды
            if (remaining <= 3) {
                timerEl.style.animation = 'pulse 0.5s infinite';
                timerEl.style.color = 'var(--danger-color)';
            }
            
            remaining--;
        } else {
            clearInterval(timer);
            
            // Запускаем анимацию колеса
            const wheel = document.getElementById('wheel');
            if (wheel) {
                // Случайный финальный угол (несколько полных оборотов + случайный сектор)
                const spins = 5; // Количество полных оборотов
                const randomSector = Math.random() * 360;
                const finalAngle = (spins * 360) + randomSector;
                
                // Запускаем анимацию с эффектом замедления
                wheel.style.transition = 'transform 5s cubic-bezier(0.1, 0.7, 0.2, 1)';
                wheel.style.transform = `rotate(${finalAngle}deg)`;
                
                // Добавляем эффект тряски для стрелки
                const arrow = document.querySelector('.wheel-arrow');
                if (arrow) {
                    arrow.style.animation = 'shake 0.5s 10';
                }
            }
            
            // Показываем сообщение
            setTimeout(() => {
                document.querySelector('.wheel-hint').textContent = '🎰 Определяем победителя...';
            }, 2000);
        }
    }, 1000);
}

function createWheelSectors(sectors) {
    const wheel = document.getElementById('wheel');
    if (!wheel) return;
    
    wheel.innerHTML = '';
    wheel.style.transform = 'rotate(0deg)';
    wheel.classList.remove('wheel-spinning');
    
    // Эмодзи для игроков
    const playerEmojis = {
        'bot': '🤖',
        'player': '👤',
        'default': '🎯',
        'admin': '👑',
        'vip': '⭐'
    };
    
    if (!sectors || sectors.length === 0) {
        sectors = [
            { name: "Вы", color: "#2fff9d", size: 30, playerId: user.id, isBot: false },
            { name: "BOT_1", color: "#ff4d4d", size: 25, playerId: 'bot_1', isBot: true },
            { name: "BOT_2", color: "#4d7cff", size: 20, playerId: 'bot_2', isBot: true },
            { name: "BOT_3", color: "#ffd54a", size: 15, playerId: 'bot_3', isBot: true },
            { name: "BOT_4", color: "#9d2fff", size: 10, playerId: 'bot_4', isBot: true }
        ];
    }
    
    let currentAngle = 0;
    
    sectors.forEach((sector, index) => {
        const sectorEl = document.createElement('div');
        sectorEl.className = 'wheel-sector';
        sectorEl.style.background = sector.color || '#666';
        sectorEl.style.transform = `rotate(${currentAngle}deg)`;
        
        const sectorContent = document.createElement('div');
        sectorContent.className = 'sector-content';
        
        // Добавляем эмодзи в зависимости от типа игрока
        const emoji = document.createElement('div');
        emoji.className = 'sector-emoji';
        
        if (sector.playerId === user.id) {
            emoji.textContent = '👑'; // Эмодзи для текущего игрока
        } else if (sector.isBot) {
            emoji.textContent = '🤖'; // Эмодзи для бота
        } else {
            // Случайный эмодзи для других игроков
            const randomEmojis = ['👤', '🎮', '💎', '🚀', '⭐', '👽', '🦄', '🐉'];
            emoji.textContent = randomEmojis[Math.floor(Math.random() * randomEmojis.length)];
        }
        
        const label = document.createElement('div');
        label.className = 'sector-label';
        label.textContent = sector.name || `Игрок ${index + 1}`;
        
        const percentage = document.createElement('div');
        percentage.className = 'sector-percentage';
        percentage.textContent = `${Math.round(sector.size)}%`;
        
        sectorContent.appendChild(emoji);
        sectorContent.appendChild(label);
        sectorContent.appendChild(percentage);
        sectorEl.appendChild(sectorContent);
        
        wheel.appendChild(sectorEl);
        currentAngle += (sector.size / 100) * 360;
    });
    
    // Добавляем центр колеса
    const center = document.createElement('div');
    center.className = 'wheel-center';
    center.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 60px;
        height: 60px;
        background: var(--tg-theme-bg-color);
        border-radius: 50%;
        border: 5px solid var(--primary-color);
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        color: var(--primary-color);
    `;
    center.innerHTML = '<i class="fas fa-dharmachakra"></i>';
    wheel.appendChild(center);
}
function spinWheel(finalAngle) {
    const wheel = document.getElementById('wheel');
    if (!wheel) return;
    
    // Снимаем предыдущую анимацию
    wheel.classList.remove('wheel-spinning');
    
    // Даем время для сброса
    setTimeout(() => {
        // Добавляем класс с анимацией
        wheel.classList.add('wheel-spinning');
        
        // Устанавливаем конечный угол
        setTimeout(() => {
            wheel.style.transform = `rotate(${finalAngle}deg)`;
            wheel.classList.remove('wheel-spinning');
        }, 100);
    }, 50);
}

// Добавим функцию обновления списка ставок с эмодзи
function updateBetsList(sectors) {
    const betsList = document.getElementById('betsList');
    if (!betsList || !sectors) return;
    
    betsList.innerHTML = sectors.map(sector => {
        // Определяем эмодзи для игрока
        let emoji = '👤';
        if (sector.playerId === user.id) {
            emoji = '👑';
        } else if (sector.isBot) {
            emoji = '🤖';
        } else if (sector.playerId && sector.playerId.includes('bot')) {
            emoji = '🤖';
        } else if (sector.playerId && sector.playerId.includes('admin')) {
            emoji = '👑';
        }
        
        return `
            <div class="bet-item">
                <div class="bet-player-info">
                    <span class="bet-emoji">${emoji}</span>
                    <span class="bet-player">${sector.name}</span>
                </div>
                <span class="bet-amount" style="color: ${sector.color}">
                    ${Math.round(sector.size)}%
                </span>
            </div>
        `;
    }).join('');
}

function handleRoundEnd(data) {
    console.log('🏁 Round ended:', data.winnerId === playerId ? 'WIN' : 'LOSE');
    
    const won = data.winnerId === playerId;
    
    if (won) {
        currentBalance += data.winAmount || 0;
        
        document.getElementById('winAmount').textContent = `+${data.winAmount || 0}`;
        document.getElementById('newBalance').textContent = currentBalance;
        
        // Обновляем статистику
        playerStats.wins = (playerStats.wins || 0) + 1;
        playerStats.totalWon = (playerStats.totalWon || 0) + (data.winAmount || 0);
        playerStats.totalBet = (playerStats.totalBet || 0) + currentBet;
        playerStats.gamesPlayed = (playerStats.gamesPlayed || 0) + 1;
        
        showScreen('win');
        showNotification(`🎉 Поздравляем! Вы выиграли ${data.winAmount}!`, 'success');
    } else {
        playerStats.losses = (playerStats.losses || 0) + 1;
        playerStats.totalBet = (playerStats.totalBet || 0) + currentBet;
        playerStats.gamesPlayed = (playerStats.gamesPlayed || 0) + 1;
        
        document.getElementById('loseBalance').textContent = currentBalance;
        document.getElementById('loseAmount').textContent = currentBet;
        
        showScreen('lose');
        showNotification('Повезет в следующий раз!', 'info');
    }
    
    // Обновляем отображение статистики
    updateStatsDisplay();
    
    // Обновляем UI
    updateUI();
    currentBet = 0;
    setBet(0);
}

// Добавим функцию для загрузки статистики с сервера
async function loadUserStats() {
    if (!serverOnline) return;
    
    try {
        const response = await fetch(`/api/user/${playerId}`);
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.user) {
                playerStats = {
                    wins: data.user.totalWins || 0,
                    losses: data.user.totalLosses || 0,
                    totalBet: data.user.totalBets || 0,
                    totalWon: data.user.totalWon || 0,
                    gamesPlayed: data.user.gamesPlayed || 0,
                    joinDate: data.user.joinDate || new Date().toISOString()
                };
                updateStatsDisplay();
            }
        }
    } catch (error) {
        console.error('Error loading user stats:', error);
    }
}

function showScreen(screenName) {
    console.log(`📺 Showing screen: ${screenName}`);
    
    // Скрываем все экраны
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    
    // Показываем нужный экран
    const screen = document.getElementById(`screen-${screenName}`);
    if (screen) {
        screen.classList.remove('hidden');
    }
    
    // Обновляем активную кнопку навигации
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.screen === screenName) {
            btn.classList.add('active');
        }
    });
    
    // Скрываем админ панель если пользователь не админ
    if (screenName === 'admin' && !isAdmin) {
        showScreen('main');
        showNotification('Доступ запрещен', 'error');
        return;
    }
    
    // Прокручиваем вверх
    window.scrollTo(0, 0);
}

function updateUI() {
    // Обновляем отображение режима
    const modeBadge = document.getElementById('gameModeBadge');
    if (modeBadge) {
        modeBadge.innerHTML = gameMode === 'pvp' ? 
            '<i class="fas fa-users"></i> PvP' : 
            '<i class="fas fa-robot"></i> С ботами';
    }
    
    // Обновляем баланс
    document.getElementById('balance').textContent = currentBalance;
    
    // Обновляем максимальную ставку
    const betSlider = document.getElementById('betSlider');
    if (betSlider) {
        betSlider.max = currentBalance;
    }
    
    // Показываем/скрываем админ кнопку
    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) {
        adminBtn.style.display = isAdmin ? 'block' : 'none';
    }
}

function sendSupportMessage() {
    const message = document.getElementById('supportMessage')?.value;
    if (!message || message.trim() === '') {
        showNotification('Введите сообщение', 'error');
        return;
    }
    
    if (message.length > 500) {
        showNotification('Сообщение слишком длинное (макс. 500 символов)', 'error');
        return;
    }
    
    console.log('📧 Sending support message');
    
    if (serverOnline && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'support_message',
            id: playerId,
            message: message.trim()
        }));
    } else if (isDevelopmentMode) {
        // В демо-режиме имитируем отправку
        showNotification('Сообщение отправлено (демо-режим)', 'success');
    }
    
    document.getElementById('supportMessage').value = '';
    const charCount = document.getElementById('charCount');
    if (charCount) charCount.textContent = '0';
    showScreen('main');
}

function shareResult() {
    if (tg && tg.share) {
        tg.share({
            text: `🎉 Я только что выиграл в игре SPINS! Присоединяйся и попробуй свою удачу!`
        });
    } else {
        showNotification('Функция "Поделиться" доступна только в Telegram', 'info');
    }
}

// Админ функции
function loadAdminData() {
    console.log('📊 Loading admin data');
    
    if (serverOnline && ws && ws.readyState === WebSocket.OPEN) {
        sendAdminCommand('get_stats', {});
    } else if (isDevelopmentMode) {
        // Демо-данные для админ-панели
        handleAdminResponse({
            success: true,
            stats: {
                totalRounds: 42,
                totalWins: 25,
                totalLosses: 17,
                totalBets: 12500,
                playerStats: {
                    [user.id]: {
                        wins: 8,
                        losses: 5,
                        totalBet: 3200,
                        totalWon: 4800
                    },
                    'player_123': {
                        wins: 5,
                        losses: 3,
                        totalBet: 1500,
                        totalWon: 2200
                    },
                    'player_456': {
                        wins: 12,
                        losses: 9,
                        totalBet: 7800,
                        totalWon: 10500
                    }
                }
            },
            players: [
                {
                    id: user.id,
                    name: user.first_name,
                    balance: currentBalance,
                    lobbyId: gameMode,
                    wins: 8,
                    losses: 5,
                    totalBet: 3200,
                    totalWon: 4800
                },
                {
                    id: 'player_123',
                    name: 'Игрок_123',
                    balance: 750,
                    lobbyId: 'bots',
                    wins: 5,
                    losses: 3,
                    totalBet: 1500,
                    totalWon: 2200
                },
                {
                    id: 'player_456',
                    name: 'VIP_Игрок',
                    balance: 3200,
                    lobbyId: 'pvp',
                    wins: 12,
                    losses: 9,
                    totalBet: 7800,
                    totalWon: 10500
                }
            ]
        });
    }
}

function handleAdminAction(action) {
    const playerIdInput = document.getElementById('adminPlayerId');
    const amountInput = document.getElementById('adminAmount');
    
    if (!playerIdInput || !amountInput) return;
    
    const userId = playerIdInput.value.trim();
    const amount = parseInt(amountInput.value);
    
    if (!userId) {
        showNotification('Введите ID игрока', 'error');
        return;
    }
    
    if (isNaN(amount) || amount <= 0) {
        showNotification('Введите корректную сумму', 'error');
        return;
    }
    
    console.log(`🛠 Admin action: ${action} for user ${userId}, amount ${amount}`);
    
    if (serverOnline && ws && ws.readyState === WebSocket.OPEN) {
        switch (action) {
            case 'add':
                sendAdminCommand('add_balance', { userId, amount });
                break;
            case 'set':
                sendAdminCommand('set_balance', { userId, amount });
                break;
        }
    } else if (isDevelopmentMode) {
        // В демо-режиме имитируем действие
        if (userId === user.id) {
            if (action === 'add') {
                currentBalance += amount;
            } else if (action === 'set') {
                currentBalance = amount;
            }
            updateUI();
            showNotification(`Баланс обновлен: ${currentBalance}`, 'success');
        } else {
            showNotification(`Демо: действие "${action}" для игрока ${userId}`, 'info');
        }
    }
}

function sendAdminCommand(command, data) {
    if (serverOnline && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'admin_command',
            id: playerId,
            command,
            data
        }));
    } else if (isDevelopmentMode) {
        // В демо-режиме имитируем ответ
        setTimeout(() => {
            handleAdminResponse({
                success: true,
                newBalance: command === 'add_balance' ? currentBalance + (data.amount || 0) : 
                           command === 'set_balance' ? data.amount : currentBalance
            });
        }, 500);
    }
}

function handleAdminResponse(data) {
    console.log('📨 Admin response:', data);
    
    if (data.success) {
        showNotification('Команда выполнена успешно', 'success');
        
        if (data.newBalance !== undefined) {
            // Если это наш баланс
            currentBalance = data.newBalance;
            updateUI();
        }
        
        // Обновляем данные если нужно
        if (data.stats || data.players) {
            updateAdminPanel(data);
        }
    } else {
        showNotification(data.error || 'Ошибка выполнения команды', 'error');
    }
}

function updateAdminPanel(data) {
    // Обновляем статистику
    const statsGrid = document.getElementById('adminStatsGrid');
    if (statsGrid && data.stats) {
        statsGrid.innerHTML = `
            <div class="admin-stat-card">
                <div class="admin-stat-value">${data.stats.totalRounds || 0}</div>
                <div class="admin-stat-label">Всего раундов</div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-value">${data.stats.totalWins || 0}</div>
                <div class="admin-stat-label">Всего побед</div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-value">${data.stats.totalLosses || 0}</div>
                <div class="admin-stat-label">Всего проигрышей</div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-value">${data.stats.totalBets || 0}</div>
                <div class="admin-stat-label">Всего ставок</div>
            </div>
        `;
    }
    
    // Обновляем таблицу игроков
    const playersTableBody = document.getElementById('playersTableBody');
    if (playersTableBody && data.players) {
        playersTableBody.innerHTML = data.players.map(player => `
            <tr>
                <td>${player.id}</td>
                <td>${player.name}</td>
                <td>${player.balance}</td>
                <td>${player.wins || 0}W / ${player.losses || 0}L</td>
                <td>
                    <button class="control-btn small" onclick="adminAddBalance('${player.id}', 1000)">
                        +1000
                    </button>
                    <button class="control-btn small" onclick="adminAddBalance('${player.id}', 5000)">
                        +5000
                    </button>
                </td>
            </tr>
        `).join('');
    }
}

// Глобальная функция для админ кнопок в таблице
window.adminAddBalance = function(userId, amount) {
    console.log(`➕ Admin add balance: ${userId}, ${amount}`);
    document.getElementById('adminPlayerId').value = userId;
    document.getElementById('adminAmount').value = amount;
    
    if (serverOnline && ws && ws.readyState === WebSocket.OPEN) {
        sendAdminCommand('add_balance', { userId, amount });
    } else if (isDevelopmentMode) {
        if (userId === user.id) {
            currentBalance += amount;
            updateUI();
            showNotification(`Баланс пополнен на ${amount}. Новый баланс: ${currentBalance}`, 'success');
        } else {
            showNotification(`Демо: баланс игрока ${userId} пополнен на ${amount}`, 'info');
        }
    }
};

function handleSupportNotification(data) {
    if (isAdmin) {
        showNotification(`📩 Новое сообщение от ${data.fromName}: ${data.message}`, 'info');
    }
}

function updateStatsDisplay() {
    document.getElementById('playerWins').textContent = playerStats.wins || 0;
    document.getElementById('playerLosses').textContent = playerStats.losses || 0;
    document.getElementById('playerTotalBets').textContent = playerStats.totalBet || 0;
    document.getElementById('playerTotalWon').textContent = playerStats.totalWon || 0;
    
    // Добавим отображение дополнительной статистики если есть
    const statsScreen = document.getElementById('screen-stats');
    if (statsScreen) {
        const additionalStats = `
            <div class="additional-stats">
                <div class="stat-item">
                    <div class="stat-label">Всего игр</div>
                    <div class="stat-value">${playerStats.gamesPlayed || 0}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Дата регистрации</div>
                    <div class="stat-value">${playerStats.joinDate ? new Date(playerStats.joinDate).toLocaleDateString() : 'Сегодня'}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Процент побед</div>
                    <div class="stat-value">
                        ${playerStats.gamesPlayed > 0 ? 
                            Math.round(((playerStats.wins || 0) / playerStats.gamesPlayed) * 100) : 0}%
                    </div>
                </div>
            </div>
        `;
        
        // Добавляем дополнительную статистику если её ещё нет
        if (!document.querySelector('.additional-stats')) {
            const statsActions = document.querySelector('.stats-actions');
            if (statsActions) {
                statsActions.insertAdjacentHTML('beforebegin', additionalStats);
            }
        }
    }
}

function showNotification(message, type = 'info') {
    console.log(`📢 Notification [${type}]: ${message}`);
    
    const notificationArea = document.getElementById('notificationArea');
    if (!notificationArea) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            ${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}
            ${message}
        </div>
    `;
    
    notificationArea.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Применение темы Telegram
function applyTelegramTheme() {
    if (!tg) return;
    
    const themeParams = tg.themeParams || {};
    
    // Обновляем CSS переменные
    document.documentElement.style.setProperty('--tg-theme-bg-color', themeParams.bg_color || '#0a0c14');
    document.documentElement.style.setProperty('--tg-theme-text-color', themeParams.text_color || '#ffffff');
    document.documentElement.style.setProperty('--tg-theme-hint-color', themeParams.hint_color || '#a8a8a8');
    document.documentElement.style.setProperty('--tg-theme-link-color', themeParams.link_color || '#2ea6ff');
    document.documentElement.style.setProperty('--tg-theme-button-color', themeParams.button_color || '#2fff9d');
    document.documentElement.style.setProperty('--tg-theme-button-text-color', themeParams.button_text_color || '#0b0e17');
    document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', themeParams.secondary_bg_color || '#1b1f2e');
    
    // Применяем фон
    document.body.style.background = themeParams.bg_color || '#0a0c14';
    document.body.style.color = themeParams.text_color || '#ffffff';
}

// Периодическая проверка соединения
setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
    }
}, 30000);

// Обработка закрытия вкладки
window.addEventListener('beforeunload', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    
    if (demoInterval) {
        clearInterval(demoInterval);
    }
});
// Вызываем загрузку статистики при инициализации
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    initEventListeners();
    
    // Загружаем статистику если пользователь уже был авторизован
    setTimeout(() => {
        if (playerId) {
            loadUserStats();
        }
    }, 1000);
});
// Экспортируем функции для тестирования
if (isDevelopmentMode) {
    window.demoMode = {
        startDemoMode,
        demoWheel,
        setBalance: (amount) => {
            currentBalance = amount;
            updateUI();
            showNotification(`Баланс установлен: ${amount}`, 'success');
        },
        addBalance: (amount) => {
            currentBalance += amount;
            updateUI();
            showNotification(`Баланс пополнен на: ${amount}`, 'success');
        },
        testWheel: demoWheel,
        showScreen,
        getState: () => ({
            currentBalance,
            currentBet,
            gameMode,
            isAdmin,
            isConnected,
            serverOnline
        })
    };
    
    console.log('🎮 Demo mode functions available in console: demoMode');
}

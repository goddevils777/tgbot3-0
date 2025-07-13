// Компонент для Telegram авторизации
class TelegramAuthComponent {
    constructor() {
        this.authToken = null;
        this.pollInterval = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkTelegramAuthStatus();
    }

    // Настройка обработчиков событий
    setupEventListeners() {
        document.addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('telegram-login-btn')) {
                this.initiateTelegramLogin();
            }
        });
    }

    // Проверка статуса Telegram авторизации
    async checkTelegramAuthStatus() {
        try {
            const response = await fetch('/api/telegram-user');
            const data = await response.json();
            
            if (data.success) {
                this.updateUIForAuthenticated(data.user);
            } else {
                this.updateUIForGuest();
            }
        } catch (error) {
            console.error('Ошибка проверки Telegram авторизации:', error);
            this.updateUIForGuest();
        }
    }

    // Инициация входа через Telegram
    async initiateTelegramLogin() {
        try {
            const response = await fetch('/api/telegram-auth-init', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.authToken = data.authToken;
                this.showAuthModal(data.authUrl);
                this.startPolling();
            } else {
                alert('Ошибка инициации Telegram авторизации: ' + data.error);
            }
        } catch (error) {
            console.error('Ошибка Telegram авторизации:', error);
            alert('Ошибка соединения при авторизации');
        }
    }

    // Показ модального окна с инструкциями
    showAuthModal(authUrl) {
        const modal = document.createElement('div');
        modal.className = 'telegram-auth-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>🔐 Авторизация через Telegram</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <p><strong>Инструкция:</strong></p>
                    <ol>
                        <li>Нажмите кнопку "Открыть Telegram"</li>
                        <li>В открывшемся чате нажмите "START"</li>
                        <li>Вернитесь сюда - авторизация произойдет автоматически</li>
                    </ol>
                    <div class="auth-actions">
                        <a href="${authUrl}" target="_blank" class="telegram-open-btn">
                            📱 Открыть Telegram
                        </a>
                    </div>
                    <div class="auth-status">
                        <div class="loading-spinner"></div>
                        <span>Ожидание подтверждения...</span>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Обработчик закрытия
        modal.querySelector('.close-modal').addEventListener('click', () => {
            this.closeAuthModal();
        });
        
        // Закрытие по клику вне модального окна
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeAuthModal();
            }
        });
    }

    // Закрытие модального окна
    closeAuthModal() {
        const modal = document.querySelector('.telegram-auth-modal');
        if (modal) {
            modal.remove();
        }
        this.stopPolling();
    }


    // Запуск проверки статуса авторизации
    startPolling() {
        this.pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/telegram-auth-status/${this.authToken}`);
                const data = await response.json();
                
                if (data.success && data.completed) {
                    // Авторизация успешно завершена
                    this.stopPolling();
                    this.closeAuthModal();
                    this.showSuccessMessage('Авторизация через Telegram успешна!');
                    
                    // Перенаправляем на главную страницу
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 1500);
                    
                } else if (!data.success || (data.success && !data.pending)) {
                    // Авторизация завершена неудачно или токен истек
                    this.stopPolling();
                    this.closeAuthModal();
                    
                    if (!data.success) {
                        this.showErrorMessage(data.error || 'Ошибка авторизации');
                    }
                }
            } catch (error) {
                console.error('Ошибка проверки статуса:', error);
            }
        }, 2000); // Проверяем каждые 2 секунды
    }

    // Показ сообщения об успехе
    showSuccessMessage(message) {
        const notification = document.createElement('div');
        notification.className = 'notification success';
        notification.innerHTML = `✅ ${message}`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Показ сообщения об ошибке
    showErrorMessage(message) {
        const notification = document.createElement('div');
        notification.className = 'notification error';
        notification.innerHTML = `❌ ${message}`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    // Остановка проверки
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    // Обновление интерфейса для авторизованного пользователя
    updateUIForAuthenticated(user) {
        const userInfoDiv = document.getElementById('userInfo');
        const authLinksDiv = document.getElementById('authLinks');
        const logoutBtn = document.getElementById('logoutBtn');
        
        if (userInfoDiv) {
            userInfoDiv.innerHTML = `
                <div class="telegram-user-info">
                    <span>👤 ${user.name || user.username || user.login}</span>
                    <span class="telegram-badge">Telegram</span>
                </div>
            `;
            userInfoDiv.className = 'session-info';
        }
        
        if (authLinksDiv) authLinksDiv.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'block';
    }

    // Обновление интерфейса для гостя
    updateUIForGuest() {
        const userInfoDiv = document.getElementById('userInfo');
        const authLinksDiv = document.getElementById('authLinks');
        const logoutBtn = document.getElementById('logoutBtn');
        
        if (userInfoDiv) {
            userInfoDiv.innerHTML = '👤 Гость';
            userInfoDiv.className = 'session-info no-session';
        }
        
        if (authLinksDiv) authLinksDiv.style.display = 'flex';
        if (logoutBtn) logoutBtn.style.display = 'none';
    }

    // Создание Telegram кнопки входа
    static createTelegramLoginButton(text = 'Войти через Telegram') {
        return `
            <button class="telegram-login-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.13-.31-1.09-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" fill="#0088cc"/>
                </svg>
                ${text}
            </button>
        `;
    }
}

// Функция для инициализации Telegram авторизации
function initTelegramAuth() {
    return new TelegramAuthComponent();
}

// Экспорт для использования
window.TelegramAuthComponent = TelegramAuthComponent;
window.initTelegramAuth = initTelegramAuth;
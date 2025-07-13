// Компонент для Google авторизации
class GoogleAuthComponent {
    constructor() {
        this.init();
    }

    init() {
        this.checkAuthStatus();
        this.setupEventListeners();
        this.handleUrlParams();
    }

    // Проверка статуса авторизации
    async checkAuthStatus() {
        try {
            const response = await fetch('/api/google-user');
            const data = await response.json();
            
            if (data.success) {
                this.updateUIForAuthenticated(data.user);
            } else {
                this.updateUIForGuest();
            }
        } catch (error) {
            console.error('Ошибка проверки Google авторизации:', error);
            this.updateUIForGuest();
        }
    }

    // Обновление интерфейса для авторизованного пользователя
    updateUIForAuthenticated(user) {
        // Обновляем информацию о пользователе в шапке
        const userInfoDiv = document.getElementById('userInfo');
        const authLinksDiv = document.getElementById('authLinks');
        const logoutBtn = document.getElementById('logoutBtn');
        
        if (userInfoDiv) {
            userInfoDiv.innerHTML = `
                <div class="google-user-info">
                    ${user.avatar ? `<img src="${user.avatar}" alt="Avatar" class="user-avatar">` : ''}
                    <span>👤 ${user.name || user.login}</span>
                    ${user.provider === 'google' ? '<span class="google-badge">Google</span>' : ''}
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

    // Настройка обработчиков событий
    setupEventListeners() {
        // Обработчик кнопок Google входа
        document.addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('google-login-btn')) {
                this.initiateGoogleLogin();
            }
            
            if (e.target && e.target.classList.contains('google-logout-btn')) {
                this.handleGoogleLogout();
            }
        });
    }

    // Инициация входа через Google
    initiateGoogleLogin() {
        window.location.href = '/auth/google';
    }

    // Выход из Google аккаунта
    async handleGoogleLogout() {
        try {
            const response = await fetch('/api/google-logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                window.location.reload();
            } else {
                alert('Ошибка при выходе: ' + data.error);
            }
        } catch (error) {
            console.error('Ошибка выхода:', error);
            alert('Ошибка соединения при выходе');
        }
    }

    // Обработка URL параметров (после авторизации)
    handleUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        
        if (urlParams.get('auth') === 'google_success') {
            this.showSuccessMessage();
            // Очищаем URL от параметров
            window.history.replaceState({}, document.title, window.location.pathname);
        }
        
        if (urlParams.get('error') === 'google_auth_failed') {
            this.showErrorMessage('Ошибка авторизации через Google');
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    // Показ сообщения об успехе
    showSuccessMessage() {
        const notification = document.createElement('div');
        notification.className = 'notification success';
        notification.innerHTML = '✅ Успешная авторизация через Google!';
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

    // Создание Google кнопки входа
    static createGoogleLoginButton(text = 'Войти через Google') {
        return `
            <button class="google-login-btn">
                <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                ${text}
            </button>
        `;
    }
}

// Функция для инициализации Google авторизации
function initGoogleAuth() {
    return new GoogleAuthComponent();
}

// Экспорт для использования
window.GoogleAuthComponent = GoogleAuthComponent;
window.initGoogleAuth = initGoogleAuth;
// Универсальный компонент шапки
class HeaderComponent {
    constructor(pageTitle, currentPage = '') {
        this.pageTitle = pageTitle;
        this.currentPage = currentPage;
        this.init();
    }

    init() {
        this.render();
        this.setupEventListeners();
        this.loadUserInfo();
        this.loadSessionInfo(); // Добавляем загрузку сессии
    }

    // Создание HTML шапки
    render() {
        const headerHTML = `
            <header class="header">
                <h1>${this.pageTitle}</h1>
                <div class="header-info">
                    <div class="auth-section">
                        <div id="userInfo" class="session-info">
                            <span class="session-loading">Загрузка пользователя...</span>
                        </div>
                        <div id="authLinks" class="auth-links">
                            <a href="login.html" class="auth-link">Вход</a>
                            <a href="register.html" class="auth-link">Регистрация</a>
                        </div>
                        <button id="logoutBtn" class="logout-btn" style="display: none;">Выйти</button>
                    </div>
                    <div id="sessionInfo" class="session-info">
                        <span class="session-loading">Загрузка сессии...</span>
                    </div>
                    <div class="header-links">
                        ${this.generateNavLinks()}
                    </div>
                </div>
            </header>
        `;

        // Вставляем шапку в начало body или в существующий контейнер
        const container = document.querySelector('.container');
        if (container) {
            container.insertAdjacentHTML('afterbegin', headerHTML);
        } else {
            document.body.insertAdjacentHTML('afterbegin', headerHTML);
        }
    }

    // Генерация навигационных ссылок
    generateNavLinks() {
        const links = [
            { href: 'index.html', text: 'Поиск в чатах', page: 'index' },
            { href: 'livestream.html', text: 'Live Stream', page: 'livestream' },
            { href: 'autosearch.html', text: 'Автопоиск в чатах', page: 'autosearch' },
            { href: 'broadcast.html', text: 'Рассылка в чаты', page: 'broadcast' },
            { href: 'sessions.html', text: 'Сессии аккаунтов', page: 'sessions' },
            { href: 'history.html', text: 'История поисков', page: 'history' }
        ];

        return links.map(link => {
            const isActive = link.page === this.currentPage ? 'nav-link-active' : '';
            return `<a href="${link.href}" class="nav-link ${isActive}">${link.text}</a>`;
        }).join('');
    }

    // Загрузка информации о пользователе

    async loadUserInfo() {
        try {
            // Сначала проверяем Google авторизацию
            const googleResponse = await fetch('/api/google-user');
            const googleData = await googleResponse.json();
            
            if (googleData.success) {
                this.displayUserInfo(googleData.user, 'google');
                return;
            }
            
            // Если нет Google, проверяем обычную авторизацию
            const response = await fetch('/api/user-info');
            const data = await response.json();
            
            if (data.success && data.user) {
                this.displayUserInfo(data.user, 'local');
            } else {
                this.displayGuestInfo();
            }
        } catch (error) {
            console.error('Ошибка загрузки информации о пользователе:', error);
            this.displayGuestInfo();
        }
    }

    // Отображение информации о пользователе
    displayUserInfo(user, authType) {
        const userInfoDiv = document.getElementById('userInfo');
        const authLinksDiv = document.getElementById('authLinks');
        const logoutBtn = document.getElementById('logoutBtn');
        
        if (userInfoDiv) {
            let userHtml = '';
            
            if (authType === 'google' && user.avatar) {
                userHtml = `
                    <div class="google-user-info">
                        <img src="${user.avatar}" alt="Avatar" class="user-avatar">
                        <span>👤 ${user.name || user.login}</span>
                        <span class="google-badge">Google</span>
                    </div>
                `;
            } else {
                userHtml = `👤 ${user.name || user.login}`;
            }
            
            userInfoDiv.innerHTML = userHtml;
            userInfoDiv.className = 'session-info';
        }
        
        if (authLinksDiv) authLinksDiv.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'block';
    }

    // Отображение информации о госте
    displayGuestInfo() {
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

    // Загрузка информации о сессии
    async loadSessionInfo() {
        try {
            const response = await fetch('/api/session-info');
            const data = await response.json();
            
            const sessionInfoDiv = document.getElementById('sessionInfo');
            if (!sessionInfoDiv) return;
            
            if (data.success && data.session) {
                sessionInfoDiv.innerHTML = `
                    <span>Сессия: ${data.session.name}</span>
                    <span>•</span>
                    <span>${data.session.phone}</span>
                `;
                sessionInfoDiv.className = 'session-info';
            } else {
                sessionInfoDiv.innerHTML = '<span>Нет активной сессии</span>';
                sessionInfoDiv.className = 'session-info no-session';
            }
        } catch (error) {
            console.error('Ошибка загрузки информации о сессии:', error);
            const sessionInfoDiv = document.getElementById('sessionInfo');
            if (sessionInfoDiv) {
                sessionInfoDiv.innerHTML = '<span>Ошибка загрузки</span>';
                sessionInfoDiv.className = 'session-info no-session';
            }
        }
    }

    // Настройка обработчиков событий
    setupEventListeners() {
        // Используем MutationObserver вместо setTimeout
        const observer = new MutationObserver(() => {
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn && !logoutBtn.hasAttribute('data-handler-added')) {
                logoutBtn.setAttribute('data-handler-added', 'true');
                logoutBtn.addEventListener('click', async () => {
                    try {
                        const response = await fetch('/api/logout', {
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
                });
                observer.disconnect();
            }
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
    }
}

// Функция для инициализации шапки
function initHeader(pageTitle, currentPage = '') {
    return new HeaderComponent(pageTitle, currentPage);
}
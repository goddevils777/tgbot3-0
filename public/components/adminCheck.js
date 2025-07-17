// Проверка прав администратора
class AdminChecker {
    constructor() {
        this.isAdmin = false;
        this.init();
    }

    async init() {
        await this.checkAdminRights();
        this.showAdminButton();
    }

    // Проверка прав администратора
    async checkAdminRights() {
        try {
            const response = await fetch('/api/admin/check-rights');
            const data = await response.json();
            
            this.isAdmin = data.success && data.isAdmin;
        } catch (error) {
            console.error('Ошибка проверки прав:', error);
            this.isAdmin = false;
        }
    }

    // Показать кнопку админки
    showAdminButton() {
        if (!this.isAdmin) return;

        // Проверяем, не на странице ли админки уже
        const currentPath = window.location.pathname;
        if (currentPath.includes('admin')) return;

        // Ищем контейнер для кнопки (обычно в header)
        let buttonContainer = document.querySelector('.header-info');
        if (!buttonContainer) {
            buttonContainer = document.querySelector('.session-info');
        }
        if (!buttonContainer) {
            buttonContainer = document.querySelector('.container');
        }

        if (buttonContainer) {
            // Создаем кнопку админки
            const adminButton = document.createElement('a');
            adminButton.href = '/admin.html';
            adminButton.className = 'admin-btn';
            adminButton.innerHTML = '⚙️ Админка';
            adminButton.title = 'Панель администратора';

            // Добавляем кнопку
            buttonContainer.appendChild(adminButton);
        }
    }
}

// Автоматическая инициализация
document.addEventListener('DOMContentLoaded', () => {
    new AdminChecker();
});
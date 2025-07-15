// Компонент для красивых уведомлений
class NotificationManager {
    constructor() {
        this.createNotificationContainer();
    }

    // Создание контейнера для уведомлений
    createNotificationContainer() {
        if (document.getElementById('notificationContainer')) return;
        
        const container = document.createElement('div');
        container.id = 'notificationContainer';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }

    // Показать уведомление
    show(message, type = 'info', duration = 4000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        const icons = {
            success: '✅',
            error: '❌', 
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${icons[type] || icons.info}</span>
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;
        
        // Добавить в контейнер
        const container = document.getElementById('notificationContainer');
        container.appendChild(notification);
        
        // Анимация появления
        setTimeout(() => {
            notification.classList.add('notification-show');
        }, 10);
        
        // Автоматическое скрытие
        const hideTimer = setTimeout(() => {
            this.hide(notification);
        }, duration);
        
        // Кнопка закрытия
        notification.querySelector('.notification-close').addEventListener('click', () => {
            clearTimeout(hideTimer);
            this.hide(notification);
        });
        
        return notification;
    }

    // Скрыть уведомление
    hide(notification) {
        notification.classList.add('notification-hide');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    // Показать подтверждение
    confirm(message, onConfirm, onCancel) {
        const modal = document.createElement('div');
        modal.className = 'confirmation-modal';
        modal.innerHTML = `
            <div class="confirmation-content">
                <div class="confirmation-header">
                    <h3>Подтверждение</h3>
                </div>
                <div class="confirmation-body">
                    <p>${message}</p>
                </div>
                <div class="confirmation-actions">
                    <button class="btn-cancel">Отмена</button>
                    <button class="btn-confirm">Подтвердить</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Анимация появления
        setTimeout(() => {
            modal.classList.add('modal-show');
        }, 10);
        
        // Обработчики
        modal.querySelector('.btn-confirm').addEventListener('click', () => {
            this.hideModal(modal);
            if (onConfirm) onConfirm();
        });
        
        modal.querySelector('.btn-cancel').addEventListener('click', () => {
            this.hideModal(modal);
            if (onCancel) onCancel();
        });
        
        // Закрытие по клику вне модального окна
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hideModal(modal);
                if (onCancel) onCancel();
            }
        });
    }

    // Скрыть модальное окно
    hideModal(modal) {
        modal.classList.add('modal-hide');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
    }

    // Удобные методы
    success(message, duration) {
        return this.show(message, 'success', duration);
    }

    error(message, duration) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration) {
        return this.show(message, 'info', duration);
    }
}

// Глобальный экземпляр
window.notify = new NotificationManager();

// Заменить стандартный alert
window.showAlert = (message, type = 'info') => {
    window.notify.show(message, type);
};

window.showConfirm = (message, onConfirm, onCancel) => {
    window.notify.confirm(message, onConfirm, onCancel);
};
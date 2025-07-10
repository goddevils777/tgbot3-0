// Переменные состояния
let qrGenerationActive = false;
let qrCheckInterval = null;
let qrToken = null;

// DOM элементы
let qrSessionName, qrContainer, qrCode, qrStatus, generateQRBtn, cancelQRBtn;

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    // Инициализация DOM элементов
    qrSessionName = document.getElementById('qrSessionName');
    qrContainer = document.getElementById('qrContainer');
    qrCode = document.getElementById('qrCode');
    qrStatus = document.getElementById('qrStatus');
    generateQRBtn = document.getElementById('generateQR');
    cancelQRBtn = document.getElementById('cancelQR');
    
    // Обработчики событий
    generateQRBtn.addEventListener('click', startQRGeneration);
    cancelQRBtn.addEventListener('click', cancelQRGeneration);
});

// Начало генерации QR-кода
async function startQRGeneration() {
    const sessionName = qrSessionName.value.trim();
    
    if (!sessionName) {
        alert('Введите название сессии');
        return;
    }
    
    if (sessionName.length < 3) {
        alert('Название сессии должно быть не менее 3 символов');
        return;
    }
    
    // Обновляем интерфейс
    qrGenerationActive = true;
    generateQRBtn.disabled = true;
    generateQRBtn.textContent = 'Генерируем...';
    cancelQRBtn.style.display = 'block';
    qrStatus.innerHTML = '<span class="status running">Генерация QR-кода...</span>';
    
    try {
        // Запрос на генерацию QR-кода
        const response = await fetch('/api/generate-qr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionName: sessionName
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            qrToken = data.token;
            displayQRCode(data.qrCodeUrl);
            startQRStatusCheck();
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Ошибка генерации QR-кода:', error);
        showError(`Ошибка генерации: ${error.message}`);
        resetQRInterface();
    }
}

// Отображение QR-кода
function displayQRCode(qrCodeUrl) {
    const qrPlaceholder = qrContainer.querySelector('.qr-placeholder');
    qrPlaceholder.style.display = 'none';
    
    qrCode.innerHTML = `
        <div class="qr-code-image">
            <img src="${qrCodeUrl}" alt="QR Code" style="max-width: 250px; border-radius: 8px;">
        </div>
        <div class="qr-instructions">
            <h4>Отсканируйте QR-код в Telegram</h4>
            <p>QR-код действителен 2 минуты</p>
        </div>
    `;
    
    qrCode.style.display = 'flex';
    qrStatus.innerHTML = '<span class="status running">Ожидаем сканирования...</span>';
}

// Проверка статуса QR авторизации
function startQRStatusCheck() {
    qrCheckInterval = setInterval(async () => {
        if (!qrGenerationActive || !qrToken) return;
        
        try {
            const response = await fetch('/api/check-qr-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token: qrToken
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                if (data.status === 'authorized') {
                    showSuccess('Авторизация успешна! Сессия создана.');
                    setTimeout(() => {
                        window.location.href = '/sessions.html';
                    }, 2000);
                } else if (data.status === 'expired') {
                    showError('QR-код истек. Сгенерируйте новый.');
                    resetQRInterface();
                }
            }
        } catch (error) {
            console.error('Ошибка проверки статуса:', error);
        }
    }, 2000); // Проверяем каждые 2 секунды
}

// Отмена генерации QR-кода
function cancelQRGeneration() {
    if (qrCheckInterval) {
        clearInterval(qrCheckInterval);
        qrCheckInterval = null;
    }
    
    // Отменяем QR-код на сервере
    if (qrToken) {
        fetch('/api/cancel-qr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                token: qrToken
            })
        });
    }
    
    resetQRInterface();
    qrStatus.innerHTML = '<span class="status stopped">Отменено</span>';
}

// Сброс интерфейса
function resetQRInterface() {
    qrGenerationActive = false;
    qrToken = null;
    
    generateQRBtn.disabled = false;
    generateQRBtn.textContent = 'Сгенерировать QR-код';
    cancelQRBtn.style.display = 'none';
    
    const qrPlaceholder = qrContainer.querySelector('.qr-placeholder');
    qrPlaceholder.style.display = 'block';
    qrCode.style.display = 'none';
    qrCode.innerHTML = '';
    
    if (qrCheckInterval) {
        clearInterval(qrCheckInterval);
        qrCheckInterval = null;
    }
}

// Показ ошибки
function showError(message) {
    qrStatus.innerHTML = `<span class="status" style="background: #ffeaa7; color: #d63031;">${message}</span>`;
}

// Показ успеха
function showSuccess(message) {
    qrStatus.innerHTML = `<span class="status" style="background: #d5f4e6; color: #27ae60;">${message}</span>`;
}
// Обработка формы входа
if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const login = document.getElementById('login').value.trim();
        const password = document.getElementById('password').value;
        
        if (!login || !password) {
            notify.warning('Заполните все поля');
            return;
        }
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ login, password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                notify.success('Успешный вход!');
                window.location.href = '/sessions.html';
            } else {
                notify.error('Ошибка: ' + data.error);
            }
        } catch (error) {
            notify.error('Ошибка соединения: ' + error.message);
        }
    });
}

// Обработка формы регистрации
if (document.getElementById('registerForm')) {
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const login = document.getElementById('login').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (!login || !password || !confirmPassword) {
            alert('Заполните все поля');
            return;
        }
        
        if (password !== confirmPassword) {
            notify.warning('Пароли не совпадают');
            return;
        }
        
        if (login.length < 3) {
            notify.warning('Логин должен быть не менее 3 символов');
            return;
        }
        
        if (password.length < 6) {
            notify.warning('Пароль должен быть не менее 6 символов');
            return;
        }
        
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ login, password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                notify.success('Регистрация успешна! Теперь войдите в систему.');
                window.location.href = '/login.html';
            } else {
                notify.error('Ошибка: ' + data.error);
            }
        } catch (error) {
            notify.error('Ошибка соединения: ' + error.message);
        }
    });
}
const express = require('express');
const passport = require('passport');

class GoogleAuthRoutes {
    constructor(userManager, googleAuthManager) {
        this.userManager = userManager;
        this.googleAuthManager = googleAuthManager;
        this.router = express.Router();
        this.setupRoutes();
    }

    setupRoutes() {
        // Инициация авторизации через Google
        this.router.get('/auth/google',
            passport.authenticate('google', { 
                scope: ['profile', 'email'] 
            })
        );

        // Callback после авторизации Google
        this.router.get('/auth/google/callback',
            passport.authenticate('google', { 
                failureRedirect: '/login.html?error=google_auth_failed' 
            }),
            (req, res) => {
                // Успешная авторизация
                console.log('Успешная авторизация через Google:', req.user.login);
                
                // Устанавливаем cookie для совместимости с существующей системой
                res.cookie('userId', req.user.id, { 
                    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
                    httpOnly: false 
                });
                
                // Перенаправляем на главную страницу
                res.redirect('/?auth=google_success');
            }
        );

        // API для получения текущего пользователя Google
        this.router.get('/api/google-user', (req, res) => {
            if (req.isAuthenticated()) {
                res.json({ 
                    success: true, 
                    user: {
                        id: req.user.id,
                        login: req.user.login,
                        name: req.user.name,
                        email: req.user.email,
                        avatar: req.user.avatar,
                        provider: req.user.provider
                    }
                });
            } else {
                res.json({ success: false, error: 'Не авторизован' });
            }
        });

        // Привязка Google аккаунта к существующему пользователю
        this.router.post('/api/link-google', (req, res) => {
            if (!req.isAuthenticated()) {
                return res.json({ success: false, error: 'Необходима авторизация' });
            }

            // Логика привязки аккаунта
            const linkedUser = this.userManager.linkGoogleAccount(req.user.id, {
                googleId: req.user.googleId,
                avatar: req.user.avatar
            });

            if (linkedUser) {
                res.json({ success: true, user: linkedUser });
            } else {
                res.json({ success: false, error: 'Ошибка привязки аккаунта' });
            }
        });

        // Отвязка Google аккаунта
        this.router.post('/api/unlink-google', (req, res) => {
            if (!req.isAuthenticated()) {
                return res.json({ success: false, error: 'Необходима авторизация' });
            }

            const updatedUser = this.userManager.updateUser(req.user.id, {
                googleId: null,
                provider: 'local'
            });

            if (updatedUser) {
                res.json({ success: true, message: 'Google аккаунт отвязан' });
            } else {
                res.json({ success: false, error: 'Ошибка отвязки аккаунта' });
            }
        });

        // Выход из Google аккаунта
        this.router.post('/api/google-logout', (req, res) => {
            req.logout((err) => {
                if (err) {
                    return res.json({ success: false, error: 'Ошибка выхода' });
                }
                
                res.clearCookie('userId');
                res.json({ success: true, message: 'Выход выполнен' });
            });
        });
    }

    getRouter() {
        return this.router;
    }
}

module.exports = GoogleAuthRoutes;
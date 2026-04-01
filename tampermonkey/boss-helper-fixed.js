// ==UserScript==
// @name         BOSS海投助手
// @namespace    https://github.com/yangshengzhou03
// @version      1.2.3.4
// @description  🚀 求职工具！🧑‍💻Yangshengzhou开发用于提高BOSS直聘投递效率，批量沟通，高效求职 💼
// @author       Yangshengzhou
// @match        https://www.zhipin.com/web/*
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @supportURL   https://github.com/yangshengzhou03
// @homepageURL  https://gitee.com/yangshengzhou
// @license      AGPL-3.0-or-later
// @icon         https://static.zhipin.com/favicon.ico
// @connect      zhipin.com
// @connect      spark-api-open.xf-yun.com
// @noframes
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// ==/UserScript==

(function () {
    'use strict';

    // 配置常量
    const CONFIG = {
        BASIC_INTERVAL: 1000,
        OPERATION_INTERVAL: 800,
        CARD_STYLE: {
            BACKGROUND: '#ffffff',
            SHADOW: '0 6px 18px rgba(0,0,0,0.12)',
            BORDER: '1px solid #e4e7ed'
        },
        COLORS: {
            PRIMARY: '#2196f3',
            SECONDARY: '#ff5722',
            NEUTRAL: '#95a5a6'
        },
        MINI_ICON_SIZE: 40,
        SELECTORS: {
            JOB_CARD: 'li.job-card-box',
            CHAT_BTN: 'a.op-btn-chat',
            CHAT_LIST: 'ul[data-v-8e790d94=""]',
            CHAT_INPUT: '#chat-input',
            SEND_BUTTON: '.btn-send',
            FRIEND_MESSAGE: '.item-friend .text span',
            COMMON_PHRASE_BTN: '.btn-dict',
            RESUME_BTN: '.toolbar-btn:contains("发简历")',
            CONFIRM_SEND: 'span.btn-sure-v2',
            // 图片发送按钮选择器
            IMAGE_SEND_BTN: '.toolbar-btn-content.icon.btn-sendimg input[type="file"]'
        },
        AI: {
            MAX_REPLIES_FREE: 5,
            MAX_REPLIES_PREMIUM: 10,
            DEFAULT_ROLE: '你是个正在积极寻找工作机会的求职者，回复礼貌简短、言简意赅且避免大段文字，突出优势和能力展现专业素养。'
        },
        MESSAGES: {
            JOB_MATCHED: '找到匹配岗位: ',
            JOB_NOT_FOUND: '没有找到符合条件的岗位',
            START_PROCESSING: '开始自动处理...',
            STOP_PROCESSING: '已停止自动处理',
            RESUME_SENT: '简历已发送',
            AI_REPLYING: 'AI 正在回复...',
            MAX_REPLIES_REACHED: '今日 AI 回复次数已达上限'
        },
        STORAGE_KEYS: {
            PROCESSED_HRS: 'processedHRs',
            AI_REPLY_COUNT: 'aiReplyCount',
            LAST_AI_DATE: 'lastAiDate',
            AI_ROLE: 'aiRole',
            LETTER_LAST_SHOWN: 'letterLastShown'
        }
    };

    // 状态管理
    const state = {
        // 运行状态
        isRunning: false,
        currentIndex: 0,

        // 筛选条件 - 包含和排除关键词
        includeKeywords: [],  // 职位名包含的关键词列表
        excludeKeywords: [],  // 职位名排除的关键词列表

        // 数据缓存
        jobList: [],

        // UI 状态
        ui: {
            isMinimized: false,
            theme: localStorage.getItem('theme') || 'light',
            showWelcomeMessage: JSON.parse(localStorage.getItem('showWelcomeMessage') || 'true')
        },

        // HR交互状态
        hrInteractions: {
            processedHRs: new Set(JSON.parse(localStorage.getItem('processedHRs') || '[]')),
            currentTopHRKey: null,
            sentGreetingsHRs: new Set(JSON.parse(localStorage.getItem('sentGreetingsHRs') || '[]')),
            sentResumeHRs: new Set(JSON.parse(localStorage.getItem('sentResumeHRs') || '[]')),
            sentImageResumeHRs: new Set(JSON.parse(localStorage.getItem('sentImageResumeHRs') || '[]')) // 已发送图片简历的HR
        },

        // AI 功能
        ai: {
            replyCount: JSON.parse(localStorage.getItem('aiReplyCount') || '0'),
            lastAiDate: localStorage.getItem('lastAiDate') || '',
            useAiReply: true
        },

        // 操作记录
        operation: {
            lastMessageTime: 0,
            processedJobsCount: 0,
            lastProcessedDate: localStorage.getItem('lastProcessedDate') || '',
            dailyJobLimit: 50
        },

        // 用户权限
        user: {
            isPremiumUser: localStorage.getItem('isPremiumUser') === 'true'
        },

        // 应用设置
        settings: {
            useAutoSendResume: JSON.parse(localStorage.getItem('useAutoSendResume') || 'true'),
            useAutoSendImageResume: JSON.parse(localStorage.getItem('useAutoSendImageResume') || 'false'), // 自动发送图片简历
            imageResumePath: localStorage.getItem('imageResumePath') || '', // 图片简历路径
            imageResumeData: localStorage.getItem('imageResumeData') || '', // 图片简历数据（Base64）
            autoScrollSpeed: parseInt(localStorage.getItem('autoScrollSpeed') || '500'),
            customPhrases: JSON.parse(localStorage.getItem('customPhrases') || '[]'),
            actionDelays: {
                click: parseInt(localStorage.getItem('clickDelay') || '130'),  // 发送常用语的速度
            },
            notifications: {
                enabled: JSON.parse(localStorage.getItem('notificationsEnabled') || 'true'),
                sound: JSON.parse(localStorage.getItem('notificationSound') || 'true')
            }
        }
    };

    // DOM 元素引用 - 更新为新的输入框引用
    const elements = {
        panel: null,
        controlBtn: null,
        log: null,
        includeInput: null,  // 职位名包含输入框
        excludeInput: null,  // 职位名排除输入框
        miniIcon: null,
        aiRoleInput: null,
        themeToggle: null,
        settingsPanel: null
    };

    // 状态持久化工具类
    class StatePersistence {
        /**
         * 保存所有状态到localStorage
         */
        static saveState() {
            // 保存HR交互状态
            localStorage.setItem('processedHRs', JSON.stringify([...state.hrInteractions.processedHRs]));
            localStorage.setItem('sentGreetingsHRs', JSON.stringify([...state.hrInteractions.sentGreetingsHRs]));
            localStorage.setItem('sentResumeHRs', JSON.stringify([...state.hrInteractions.sentResumeHRs]));
            localStorage.setItem('sentImageResumeHRs', JSON.stringify([...state.hrInteractions.sentImageResumeHRs]));

            // 保存AI状态
            localStorage.setItem('aiReplyCount', state.ai.replyCount);
            localStorage.setItem('lastAiDate', state.ai.lastAiDate);

            // 保存操作记录
            localStorage.setItem('lastProcessedDate', state.operation.lastProcessedDate);

            // 保存用户设置
            localStorage.setItem('showWelcomeMessage', state.ui.showWelcomeMessage);
            localStorage.setItem('isPremiumUser', state.user.isPremiumUser);
            localStorage.setItem('useAiReply', state.ai.useAiReply);
            localStorage.setItem('useAutoSendResume', state.settings.useAutoSendResume);
            localStorage.setItem('useAutoSendImageResume', state.settings.useAutoSendImageResume);
            localStorage.setItem('imageResumePath', state.settings.imageResumePath);
            localStorage.setItem('imageResumeData', state.settings.imageResumeData);
            localStorage.setItem('autoScrollSpeed', state.settings.autoScrollSpeed);
            localStorage.setItem('customPhrases', JSON.stringify(state.settings.customPhrases));

            // 保存UI设置
            localStorage.setItem('theme', state.ui.theme);

            // 保存操作延迟
            localStorage.setItem('clickDelay', state.settings.actionDelays.click);

            // 保存通知设置
            localStorage.setItem('notificationsEnabled', state.settings.notifications.enabled);
            localStorage.setItem('notificationSound', state.settings.notifications.sound);

            // 新增：保存筛选条件
            localStorage.setItem('includeKeywords', JSON.stringify(state.includeKeywords));
            localStorage.setItem('excludeKeywords', JSON.stringify(state.excludeKeywords));
        }

        /**
         * 从localStorage加载状态
         */
        static loadState() {
            // 初始化加载已在 state 对象定义中完成

            // 加载筛选条件
            const includeKeywords = JSON.parse(localStorage.getItem('includeKeywords') || '[]');
            const excludeKeywords = JSON.parse(localStorage.getItem('excludeKeywords') || '[]');

            if (Array.isArray(includeKeywords)) {
                state.includeKeywords = includeKeywords;
            }

            if (Array.isArray(excludeKeywords)) {
                state.excludeKeywords = excludeKeywords;
            }
        }
    }

    // HR交互管理类
    class HRInteractionManager {
        /**
         * 根据HR状态执行相应操作
         * @param {string} hrKey - HR标识（如："姓名-公司名"）
         */
        static async handleHRInteraction(hrKey) {
            // 检查HR是否已发送消息
            const hasResponded = await this.hasHRResponded();

            // 未发过常用语
            if (!state.hrInteractions.sentGreetingsHRs.has(hrKey)) {
                Core.log(`未发过自我介绍: ${hrKey}`);
                const sent = await this.sendGreetings();
                if (sent) {
                    state.hrInteractions.sentGreetingsHRs.add(hrKey);
                    StatePersistence.saveState();

                    // 如果启用了自动发送简历，且尚未发送简历
                    if (state.settings.useAutoSendResume && !state.hrInteractions.sentResumeHRs.has(hrKey)) {
                        const sentResume = await this.sendResume();
                        if (sentResume) {
                            state.hrInteractions.sentResumeHRs.add(hrKey);
                            StatePersistence.saveState();
                            Core.log(`已向 ${hrKey} 发送简历`);
                        }
                    }

                    // 如果启用了自动发送图片简历，且尚未发送图片简历
                    if (state.settings.useAutoSendImageResume && !state.hrInteractions.sentImageResumeHRs.has(hrKey)) {
                        const sentImageResume = await this.sendImageResume();
                        if (sentImageResume) {
                            state.hrInteractions.sentImageResumeHRs.add(hrKey);
                            StatePersistence.saveState();
                            Core.log(`已向 ${hrKey} 发送图片简历`);
                        }
                    }
                }
                return;
            }

            // 已发常用语但未发简历
            if (!state.hrInteractions.sentResumeHRs.has(hrKey) || !state.hrInteractions.sentImageResumeHRs.has(hrKey)) {
                // 如果HR回复了，检查是否提到简历
                if (hasResponded) {
                    const lastMessage = await Core.getLastFriendMessageText();
                    if (lastMessage && (lastMessage.includes('简历') || lastMessage.includes('发送简历'))) {
                        Core.log(`HR提到"简历"，需发送简历: ${hrKey}`);

                        // 优先发送图片简历
                        if (state.settings.useAutoSendImageResume) {
                            const sentImageResume = await this.sendImageResume();
                            if (sentImageResume) {
                                state.hrInteractions.sentImageResumeHRs.add(hrKey);
                                StatePersistence.saveState();
                                Core.log(`已向 ${hrKey} 发送图片简历`);
                                return;
                            }
                        }

                        // 否则发送普通简历
                        const sentResume = await this.sendResume();
                        if (sentResume) {
                            state.hrInteractions.sentResumeHRs.add(hrKey);
                            StatePersistence.saveState();
                            Core.log(`已向 ${hrKey} 发送简历`);
                        }
                        return;
                    }
                }
                return;
            }

            // 已发简历，使用AI回复
            await Core.aiReply();
        }

        /**
         * 检查HR是否已回复消息
         */
        static async hasHRResponded() {
            await Core.delay(state.settings.actionDelays.click);

            const chatContainer = document.querySelector('.chat-message .im-list');
            if (!chatContainer) return false;

            const friendMessages = Array.from(chatContainer.querySelectorAll('li.message-item.item-friend'));
            return friendMessages.length > 0;
        }

        /**
         * 发送常用语
         */
        static async sendGreetings() {
            try {
                await Core.delay(state.settings.actionDelays.click);

                // 点击“常用语”按钮
                const dictBtn = await Core.waitForElement('.btn-dict');
                if (!dictBtn) {
                    Core.log('未找到常用语按钮');
                    return false;
                }
                await Core.simulateClick(dictBtn);
                await Core.delay(state.settings.actionDelays.click);

                // 查找常用语列表
                const dictList = await Core.waitForElement('ul[data-v-8e790d94=""]');
                if (!dictList) {
                    Core.log('未找到常用语列表');
                    return false;
                }

                const dictItems = dictList.querySelectorAll('li');
                if (!dictItems || dictItems.length === 0) {
                    Core.log('常用语列表为空');
                    return false;
                }

                // 遍历并点击每条常用语
                for (let i = 0; i < dictItems.length; i++) {
                    const item = dictItems[i];
                    Core.log(`发送常用语（自我介绍）：第${i + 1}条/共${dictItems.length}条`);
                    await Core.simulateClick(item);
                    await Core.delay(state.settings.actionDelays.click);
                }

                return true;
            } catch (error) {
                Core.log(`发送常用语出错: ${error.message}`);
                return false;
            }
        }

        /**
         * 发送简历
         */
        static async sendResume() {
            try {
                // 查找“发简历”按钮
                const resumeBtn = await Core.waitForElement(() => {
                    return [...document.querySelectorAll('.toolbar-btn')].find(
                        el => el.textContent.trim() === '发简历'
                    );
                });

                if (!resumeBtn) {
                    Core.log('无法发送简历，未找到发简历按钮');
                    return false;
                }

                if (resumeBtn.classList.contains('unable')) {
                    Core.log('对方未回复，您无权发送简历');
                    return false;
                }

                // 点击“发简历”
                await Core.simulateClick(resumeBtn);
                await Core.delay(state.settings.actionDelays.click);

                // 查找确认发送按钮
                const confirmBtn = await Core.waitForElement('span.btn-sure-v2');
                if (!confirmBtn) {
                    Core.log('未找到确认发送按钮');
                    return false;
                }

                await Core.simulateClick(confirmBtn);
                return true;
            } catch (error) {
                Core.log(`发送简历出错: ${error.message}`);
                return false;
            }
        }

        /**
         * 发送图片简历
         */
        static async sendImageResume() {
            try {
                if (!state.settings.useAutoSendImageResume || !state.settings.imageResumeData) {
                    return false;
                }

                // 找到图片发送按钮
                const imageSendBtn = await Core.waitForElement('.toolbar-btn-content.icon.btn-sendimg input[type="file"]');
                if (!imageSendBtn) {
                    Core.log('未找到图片发送按钮');
                    return false;
                }

                // 创建一个Blob对象
                const byteCharacters = atob(state.settings.imageResumeData.split(',')[1]);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'image/jpeg' });

                // 创建一个File对象
                const file = new File([blob], state.settings.imageResumePath, {
                    type: 'image/jpeg',
                    lastModified: new Date().getTime()
                });

                // 创建一个DataTransfer对象来模拟文件选择
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);

                // 设置文件输入的值
                imageSendBtn.files = dataTransfer.files;

                // 触发change事件
                const event = new Event('change', { bubbles: true });
                imageSendBtn.dispatchEvent(event);
                return true;
            } catch (error) {
                Core.log(`发送图片简历出错: ${error.message}`);
                return false;
            }
        }
    }

    // 初始化加载状态
    StatePersistence.loadState();

    /**
     * UI模块：面板界面
     */
    const UI = {
        // 页面类型常量
        PAGE_TYPES: {
            JOB_LIST: 'jobList',
            CHAT: 'chat'
        },

        // 当前页面类型
        currentPageType: null,

        // 初始化UI
        init() {
            this.currentPageType = location.pathname.includes('/chat')
                ? this.PAGE_TYPES.CHAT
                : this.PAGE_TYPES.JOB_LIST;
            this._applyTheme();
            this.createControlPanel();
            this.createMiniIcon();
        },

        // 创建主控制面板
        createControlPanel() {
            if (document.getElementById('boss-pro-panel')) {
                document.getElementById('boss-pro-panel').remove();
            }

            elements.panel = this._createPanel();

            const header = this._createHeader();
            const controls = this._createPageControls();
            elements.log = this._createLogger();
            const footer = this._createFooter();

            elements.panel.append(header, controls, elements.log, footer);
            document.body.appendChild(elements.panel);
            this._makeDraggable(elements.panel);
        },

        // 应用主题配置
        _applyTheme() {
            CONFIG.COLORS = this.currentPageType === this.PAGE_TYPES.JOB_LIST
                ? this.THEMES.JOB_LIST
                : this.THEMES.CHAT;

            // 将颜色配置应用到CSS变量
            document.documentElement.style.setProperty('--primary-color', CONFIG.COLORS.primary);
            document.documentElement.style.setProperty('--secondary-color', CONFIG.COLORS.secondary);
            document.documentElement.style.setProperty('--accent-color', CONFIG.COLORS.accent);
            document.documentElement.style.setProperty('--neutral-color', CONFIG.COLORS.neutral);
        },

        // 颜色主题配置
        THEMES: {
            JOB_LIST: {
                primary: '#4285f4',
                secondary: '#f5f7fa',
                accent: '#e8f0fe',
                neutral: '#6b7280'
            },
            CHAT: {
                primary: '#34a853',
                secondary: '#f0fdf4',
                accent: '#dcfce7',
                neutral: '#6b7280'
            }
        },

        // 创建面板容器
        _createPanel() {
            const panel = document.createElement('div');
            panel.id = 'boss-pro-panel';
            panel.className = this.currentPageType === this.PAGE_TYPES.JOB_LIST
                ? 'boss-joblist-panel'
                : 'boss-chat-panel';

            // 基础样式 - 使用CSS变量和改进的居中
            const baseStyles = `
            position: fixed;
            top: 36px;
            right: 24px;
            width: clamp(300px, 80vw, 400px);
            border-radius: 16px;
            padding: 18px;
            font-family: 'Segoe UI', system-ui, sans-serif;
            z-index: 2147483647;
            display: flex;
            flex-direction: column;
            transition: all 0.3s ease;
            background: #ffffff;
            box-shadow: 0 10px 25px rgba(var(--primary-rgb), 0.15);
            border: 1px solid var(--accent-color);
            cursor: default;
        `;

            panel.style.cssText = baseStyles;

            // 设置RGB颜色变量供阴影使用
            const rgbColor = this._hexToRgb(CONFIG.COLORS.primary);
            document.documentElement.style.setProperty('--primary-rgb', rgbColor);

            return panel;
        },

        // 创建头部
        _createHeader() {
            const header = document.createElement('div');
            header.className = this.currentPageType === this.PAGE_TYPES.JOB_LIST
                ? 'boss-header'
                : 'boss-chat-header';

            header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 10px 15px;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--accent-color);
        `;

            const title = this._createTitle();

            // 创建按钮容器
            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `
            display: flex;
            gap: 8px;
        `;

            // 添加清空日志按钮
            const clearLogBtn = this._createIconButton('🗑', () => {
                elements.log.innerHTML = `<div style="color:var(--neutral-color); margin-bottom:8px;">欢迎使用海投助手，愿您在求职路上一帆风顺！</div>`;
            }, this.currentPageType === this.PAGE_TYPES.JOB_LIST
                ? '清空日志'
                : '清空聊天记录');

            // 添加设置按钮 - 直接调用settings.js中的函数
            const settingsBtn = this._createIconButton('⚙', () => {
                showSettingsDialog();
            }, this.currentPageType === this.PAGE_TYPES.JOB_LIST
                ? '插件设置'
                : 'AI人设设置');

            // 添加最小化按钮
            const closeBtn = this._createIconButton('✕', () => {
                state.isMinimized = true;
                elements.panel.style.transform = 'translateY(160%)';
                elements.miniIcon.style.display = 'flex';
            }, this.currentPageType === this.PAGE_TYPES.JOB_LIST
                ? '最小化海投面板'
                : '最小化聊天面板');

            // 将按钮添加到容器
            buttonContainer.append(clearLogBtn, settingsBtn, closeBtn);

            header.append(title, buttonContainer);
            return header;
        },

        // 创建标题内容 - 修复模板字符串问题并优化居中
        _createTitle() {
            const title = document.createElement('div');
            title.style.display = 'flex';
            title.style.alignItems = 'center';
            title.style.gap = '10px';

            // 定义SVG图标
            const customSvg = `
        <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"
             style="width: 100%; height: 100%; fill: white;">
            <path d="M512 116.032a160 160 0 0 1 52.224 311.232v259.008c118.144-22.272 207.552-121.088 207.552-239.36 0-25.152 21.568-45.568 48.128-45.568 26.624 0 48.128 20.416 48.128 45.632 0 184.832-158.848 335.232-354.048 335.232S160 631.808 160 446.976c0-25.152 21.568-45.632 48.128-45.632 26.624 0 48.128 20.48 48.128 45.632 0 118.144 89.088 216.96 206.976 239.296V428.416A160.064 160.064 0 0 1 512 116.032z m0 96a64 64 0 1 0 0 128 64 64 0 0 0 0-128z m-36.672 668.48l-21.888-19.584a17.92 17.92 0 0 0-24.64 0l-21.952 19.584a56.32 56.32 0 0 1-77.504 0l-21.952-19.584a17.92 17.92 0 0 0-24.64 0l-28.288 25.6c-9.6 8.704-23.36 6.4-30.72-4.992a29.696 29.696 0 0 1 4.16-36.672l28.352-25.6a56.32 56.32 0 0 1 77.568 0l21.888 19.584a17.92 17.92 0 0 0 24.704 0l21.824-19.52a56.32 56.32 0 0 1 77.568 0l21.888 19.52a17.92 17.92 0 0 0 24.64 0l21.952-19.52a56.32 56.32 0 0 1 77.504 0l21.952 19.52a17.92 17.92 0 0 0 24.64 0l21.824-19.52a56.32 56.32 0 0 1 77.632 0l21.824 19.52c9.664 8.704 11.52 25.152 4.224 36.672-7.296 11.52-21.12 13.696-30.72 4.992l-21.888-19.584a17.92 17.92 0 0 0-24.64 0l-21.888 19.584a56.32 56.32 0 0 1-77.568 0l-21.888-19.584a17.92 17.92 0 0 0-24.64 0l-21.888 19.584a57.408 57.408 0 0 1-38.656 15.488 58.176 58.176 0 0 1-38.784-15.488z" />
        </svg>
    `;

            // 使用相同的SVG图标用于两种页面类型
            const icon = customSvg;

            // 修复模板字符串语法
            const mainTitle = this.currentPageType === this.PAGE_TYPES.JOB_LIST
                ? `<span style="color:var(--primary-color);">BOSS</span>海投助手`
                : `<span style="color:var(--primary-color);">BOSS</span>智能聊天`;

            const subTitle = this.currentPageType === this.PAGE_TYPES.JOB_LIST
                ? '高效求职 · 智能匹配'
                : '智能对话 · 高效沟通';

            title.innerHTML = `
        <div style="
            width: 40px;
            height: 40px;
            background: var(--primary-color);
            border-radius: 10px;
            display: flex;
            justify-content: center;
            align-items: center;
            color: white;
            font-weight: bold;
            box-shadow: 0 2px 8px rgba(var(--primary-rgb), 0.3);
        ">
            ${icon}
        </div>
        <div>
            <h3 style="
                margin: 0;
                color: #2c3e50;
                font-weight: 600;
                font-size: 1.2rem;
            ">
                ${mainTitle}
            </h3>
            <span style="
                font-size:0.8em;
                color:var(--neutral-color);
            ">
                ${subTitle}
            </span>
        </div>
    `;

            return title;
        },

        // 创建页面控制区域
        _createPageControls() {
            if (this.currentPageType === this.PAGE_TYPES.JOB_LIST) {
                return this._createJobListControls();
            } else {
                return this._createChatControls();
            }
        },

        // 创建职位列表页面控制区域
        _createJobListControls() {
            const container = document.createElement('div');
            container.className = 'boss-joblist-controls';
            container.style.marginBottom = '15px';
            container.style.padding = '0 10px';

            // 筛选条件区域
            const filterContainer = this._createFilterContainer();

            elements.controlBtn = this._createTextButton(
                '启动海投',
                'var(--primary-color)',
                () => {
                    toggleProcess();
                }
            );

            // 居中控制按钮
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = `
            display: flex;
            justify-content: center;
            width: 100%;
        `;
            btnContainer.appendChild(elements.controlBtn);

            container.append(filterContainer, btnContainer);
            return container;
        },

        // 创建聊天页面控制区域
        _createChatControls() {
            const container = document.createElement('div');
            container.className = 'boss-chat-controls';
            container.style.marginBottom = '15px';
            container.style.padding = '0 10px';

            // 人设和模板选择
            const configRow = document.createElement('div');
            configRow.style.cssText = `
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
        `;

            const personaCol = this._createSelectControl('AI人设：', 'ai-persona-selector', [
                { value: 'default', text: '默认' },
                { value: 'tech', text: '技术专家' },
                { value: 'product', text: '产品经理' },
                { value: 'marketing', text: '市场营销' }
            ]);

            const templateCol = this._createSelectControl('回复模板：', 'reply-template-selector', [
                { value: 'standard', text: '标准' },
                { value: 'brief', text: '简洁' },
                { value: 'detailed', text: '详细' }
            ]);

            elements.personaSelector = personaCol.querySelector('select');
            configRow.append(personaCol, templateCol);

            elements.controlBtn = this._createTextButton(
                '开始智能聊天',
                'var(--primary-color)',
                () => {
                    toggleChatProcess();
                }
            );

            // 居中控制按钮
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = `
            display: flex;
            justify-content: center;
            width: 100%;
        `;
            btnContainer.appendChild(elements.controlBtn);

            container.append(configRow, btnContainer);
            return container;
        },

        // 创建筛选容器
        _createFilterContainer() {
            const filterContainer = document.createElement('div');
            filterContainer.style.cssText = `
            background: var(--secondary-color);
            border-radius: 12px;
            padding: 15px;
            margin-bottom: 15px;
        `;

            // 岗位和地点筛选使用两列布局
            const filterRow = document.createElement('div');
            filterRow.style.cssText = `
            display: flex;
            gap: 10px;
            margin-bottom: 12px;
        `;

            // 职位名包含和职位名排除
            const includeFilterCol = this._createInputControl('职位名包含：', 'include-filter', '如：前端,开发');
            const excludeFilterCol = this._createInputControl('职位名排除：', 'exclude-filter', '如：实习,销售');

            elements.includeInput = includeFilterCol.querySelector('input');
            elements.excludeInput = excludeFilterCol.querySelector('input');

            filterRow.append(includeFilterCol, excludeFilterCol);

            // 加海投服务QQ群按钮
            const joinGroupBtn = document.createElement('button');
            joinGroupBtn.className = 'boss-advanced-filter-btn';
            joinGroupBtn.innerHTML = '<i class="fa fa-sliders"></i> 海投服务群';
            joinGroupBtn.style.cssText = `
            width: 100%;
            padding: 8px 10px;
            background: white;
            color: var(--primary-color);
            border: 1px solid var(--primary-color);
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            text-align: center;
            transition: all 0.2s ease;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 5px;
        `;

            joinGroupBtn.addEventListener('click', () => {
                window.open('https://qun.qq.com/universal-share/share?ac=1&authKey=wjyQkU9iG7wc%2BsIEOWFE6cA0ayLLBdYwpMsKYveyufXSOE5FBe7bb9xxvuNYVsEn&busi_data=eyJncm91cENvZGUiOiIxMDIxNDcxODEzIiwidG9rZW4iOiJDaFYxYVpySU9FUVJrRzkwdUZ2QlFVUTQzZzV2VS83TE9mY0NNREluaUZCR05YcnNjWmpKU2V5Q2FYTllFVlJMIiwidWluIjoiMzU1NTg0NDY3OSJ9&data=M7fVC3YlI68T2S2VpmsR20t9s_xJj6HNpF0GGk2ImSQ9iCE8fZomQgrn_ADRZF0Ee4OSY0x6k2tI5P47NlkWug&svctype=4&tempid=h5_group_info', '_blank');
            });

            joinGroupBtn.addEventListener('mouseenter', () => {
                joinGroupBtn.style.backgroundColor = 'var(--primary-color)';
                joinGroupBtn.style.color = 'white';
            });

            joinGroupBtn.addEventListener('mouseleave', () => {
                joinGroupBtn.style.backgroundColor = 'white';
                joinGroupBtn.style.color = 'var(--primary-color)';
            });

            filterContainer.append(filterRow, joinGroupBtn);
            return filterContainer;
        },

        // 创建输入控件
        _createInputControl(labelText, id, placeholder) {
            const controlCol = document.createElement('div');
            controlCol.style.cssText = 'flex: 1;';

            const label = document.createElement('label');
            label.textContent = labelText;
            label.style.cssText = 'display:block; margin-bottom:5px; font-weight: 500; color: #333; font-size: 0.9rem;';

            const input = document.createElement('input');
            input.id = id;
            input.placeholder = placeholder;
            input.className = 'boss-filter-input';
            input.style.cssText = `
            width: 100%;
            padding: 8px 10px;
            border-radius: 8px;
            border: 1px solid #d1d5db;
            font-size: 14px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            transition: all 0.2s ease;
        `;

            controlCol.append(label, input);
            return controlCol;
        },

        // 创建选择控件
        _createSelectControl(labelText, id, options) {
            const controlCol = document.createElement('div');
            controlCol.style.cssText = 'flex: 1;';

            const label = document.createElement('label');
            label.textContent = labelText;
            label.style.cssText = 'display:block; margin-bottom:5px; font-weight: 500; color: #333; font-size: 0.9rem;';

            const select = document.createElement('select');
            select.id = id;
            select.style.cssText = `
            width: 100%;
            padding: 8px 10px;
            border-radius: 8px;
            border: 1px solid #d1d5db;
            font-size: 14px;
            background: white;
            color: #333;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            transition: all 0.2s ease;
        `;

            // 添加选项
            options.forEach(option => {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.textContent = option.text;
                select.appendChild(opt);
            });

            controlCol.append(label, select);
            return controlCol;
        },

        // 日志区域
        _createLogger() {
            const log = document.createElement('div');
            log.id = 'pro-log';
            log.className = this.currentPageType === this.PAGE_TYPES.JOB_LIST
                ? 'boss-joblist-log'
                : 'boss-chat-log';

            const height = this.currentPageType === this.PAGE_TYPES.JOB_LIST ? '180px' : '220px';

            log.style.cssText = `
            height: ${height};
            overflow-y: auto;
            background: var(--secondary-color);
            border-radius: 12px;
            padding: 12px;
            font-size: 13px;
            line-height: 1.5;
            margin-bottom: 15px;
            margin-left: 10px;
            margin-right: 10px;
            transition: all 0.3s ease;
            user-select: text;
            scrollbar-width: thin;
            scrollbar-color: var(--primary-color) var(--secondary-color);
        `;

            // 自定义滚动条样式
            log.innerHTML += `
            <style>
                #pro-log::-webkit-scrollbar {
                    width: 6px;
                }
                #pro-log::-webkit-scrollbar-track {
                    background: var(--secondary-color);
                    border-radius: 4px;
                }
                #pro-log::-webkit-scrollbar-thumb {
                    background-color: var(--primary-color);
                    border-radius: 4px;
                }
            </style>
        `;

            return log;
        },

        // 面板页脚
        _createFooter() {
            const footer = document.createElement('div');
            footer.className = this.currentPageType === this.PAGE_TYPES.JOB_LIST
                ? 'boss-joblist-footer'
                : 'boss-chat-footer';

            footer.style.cssText = `
            text-align: center;
            font-size: 0.8em;
            color: var(--neutral-color);
            padding-top: 15px;
            border-top: 1px solid var(--accent-color);
            margin-top: auto;
            padding: 15px;
        `;

            const statsContainer = document.createElement('div');
            statsContainer.style.cssText = `
            display: flex;
            justify-content: space-around;
            margin-bottom: 15px;
        `;

            footer.append(statsContainer, document.createTextNode('© 2025 Yangshengzhou · All Rights Reserved'));
            return footer;
        },

        // 文本按钮
        _createTextButton(text, bgColor, onClick) {
            const btn = document.createElement('button');
            btn.className = 'boss-btn';
            btn.textContent = text;
            btn.style.cssText = `
            width: 100%;
            max-width: 320px;
            padding: 10px 16px;
            background: ${bgColor};
            color: #fff;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 15px;
            font-weight: 500;
            transition: all 0.3s ease;
            display: flex;
            justify-content: center;
            align-items: center;
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        `;

            this._addButtonHoverEffects(btn);
            btn.addEventListener('click', onClick);

            return btn;
        },

        // 图标按钮
        _createIconButton(icon, onClick, title) {
            const btn = document.createElement('button');
            btn.className = 'boss-icon-btn';
            btn.innerHTML = icon;
            btn.title = title;
            btn.style.cssText = `
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: none;
            background: ${this.currentPageType === this.PAGE_TYPES.JOB_LIST ? 'var(--accent-color)' : 'var(--accent-color)'};
            cursor: pointer;
            font-size: 16px;
            transition: all 0.2s ease;
            display: flex;
            justify-content: center;
            align-items: center;
            color: var(--primary-color);
        `;

            btn.addEventListener('click', onClick);
            btn.addEventListener('mouseenter', () => {
                btn.style.backgroundColor = 'var(--primary-color)';
                btn.style.color = '#fff';
                btn.style.transform = 'scale(1.1)';
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.backgroundColor = this.currentPageType === this.PAGE_TYPES.JOB_LIST ? 'var(--accent-color)' : 'var(--accent-color)';
                btn.style.color = 'var(--primary-color)';
                btn.style.transform = 'scale(1)';
            });

            return btn;
        },

        // 添加按钮悬停效果
        _addButtonHoverEffects(btn) {
            btn.addEventListener('mouseenter', () => {
                btn.style.transform = 'translateY(-2px)';
                btn.style.boxShadow = `0 6px 15px rgba(var(--primary-rgb), 0.3)`;
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'translateY(0)';
                btn.style.boxShadow = '0 4px 10px rgba(0,0,0,0.1)';
            });
        },

        // 设置面板可拖动功能
        _makeDraggable(panel) {
            const header = panel.querySelector('.boss-header, .boss-chat-header');

            if (!header) return;

            header.style.cursor = 'move';

            let isDragging = false;
            let startX = 0, startY = 0;
            let initialX = panel.offsetLeft, initialY = panel.offsetTop;

            header.addEventListener('mousedown', (e) => {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                initialX = panel.offsetLeft;
                initialY = panel.offsetTop;
                panel.style.transition = 'none';
                panel.style.zIndex = '2147483647';
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;

                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                panel.style.left = `${initialX + dx}px`;
                panel.style.top = `${initialY + dy}px`;
                panel.style.right = 'auto';
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    panel.style.transition = 'all 0.3s ease';
                    panel.style.zIndex = '2147483646';
                }
            });
        },

        // 最小化图标
        createMiniIcon() {
            elements.miniIcon = document.createElement('div');
            elements.miniIcon.style.cssText = `
        width: ${CONFIG.MINI_ICON_SIZE || 48}px;
        height: ${CONFIG.MINI_ICON_SIZE || 48}px;
        position: fixed;
        bottom: 40px;
        left: 40px;
        background: var(--primary-color);
        border-radius: 50%;
        box-shadow: 0 6px 16px rgba(var(--primary-rgb), 0.4);
        cursor: pointer;
        display: none;
        justify-content: center;
        align-items: center;
        color: #fff;
        z-index: 2147483647;
        transition: all 0.3s ease;
        overflow: hidden;
        padding: 8px; /* 添加内边距 */
    `;

            // SVG图标
            const customSvg = `
        <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"
             style="width: 100%; height: 100%; fill: white;">
            <path d="M512 116.032a160 160 0 0 1 52.224 311.232v259.008c118.144-22.272 207.552-121.088 207.552-239.36 0-25.152 21.568-45.568 48.128-45.568 26.624 0 48.128 20.416 48.128 45.632 0 184.832-158.848 335.232-354.048 335.232S160 631.808 160 446.976c0-25.152 21.568-45.632 48.128-45.632 26.624 0 48.128 20.48 48.128 45.632 0 118.144 89.088 216.96 206.976 239.296V428.416A160.064 160.064 0 0 1 512 116.032z m0 96a64 64 0 1 0 0 128 64 64 0 0 0 0-128z m-36.672 668.48l-21.888-19.584a17.92 17.92 0 0 0-24.64 0l-21.952 19.584a56.32 56.32 0 0 1-77.504 0l-21.952-19.584a17.92 17.92 0 0 0-24.64 0l-28.288 25.6c-9.6 8.704-23.36 6.4-30.72-4.992a29.696 29.696 0 0 1 4.16-36.672l28.352-25.6a56.32 56.32 0 0 1 77.568 0l21.888 19.584a17.92 17.92 0 0 0 24.704 0l21.824-19.52a56.32 56.32 0 0 1 77.568 0l21.888 19.52a17.92 17.92 0 0 0 24.64 0l21.952-19.52a56.32 56.32 0 0 1 77.504 0l21.952 19.52a17.92 17.92 0 0 0 24.64 0l21.824-19.52a56.32 56.32 0 0 1 77.632 0l21.824 19.52c9.664 8.704 11.52 25.152 4.224 36.672-7.296 11.52-21.12 13.696-30.72 4.992l-21.888-19.584a17.92 17.92 0 0 0-24.64 0l-21.888 19.584a56.32 56.32 0 0 1-77.568 0l-21.888-19.584a17.92 17.92 0 0 0-24.64 0l-21.888 19.584a57.408 57.408 0 0 1-38.656 15.488 58.176 58.176 0 0 1-38.784-15.488z" />
        </svg>
    `;

            elements.miniIcon.innerHTML = customSvg;

            // 添加悬停效果
            elements.miniIcon.addEventListener('mouseenter', () => {
                elements.miniIcon.style.transform = 'scale(1.1)';
                elements.miniIcon.style.boxShadow = `0 8px 20px rgba(var(--primary-rgb), 0.5)`;
            });

            elements.miniIcon.addEventListener('mouseleave', () => {
                elements.miniIcon.style.transform = 'scale(1)';
                elements.miniIcon.style.boxShadow = `0 6px 16px rgba(var(--primary-rgb), 0.4)`;
            });

            // 添加点击事件
            elements.miniIcon.addEventListener('click', () => {
                state.isMinimized = false;
                elements.panel.style.transform = 'translateY(0)';
                elements.miniIcon.style.display = 'none';
            });

            document.body.appendChild(elements.miniIcon);
        },

        // 十六进制颜色转RGB
        _hexToRgb(hex) {
            // 去除可能存在的#前缀
            hex = hex.replace('#', '');

            // 解析RGB值
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);

            return `${r}, ${g}, ${b}`;
        }
    };

    // 设置界面和逻辑
    // 1. 更新settings对象
    const settings = {
        useAutoSendResume: JSON.parse(localStorage.getItem('useAutoSendResume') || 'true'),
        excludeHeadhunters: JSON.parse(localStorage.getItem('excludeHeadhunters') || 'false'),
        autoScrollSpeed: parseInt(localStorage.getItem('autoScrollSpeed') || '500'),
        customPhrases: JSON.parse(localStorage.getItem('customPhrases') || '[]'),
        actionDelays: {
            click: parseInt(localStorage.getItem('clickDelay') || '130')
        },
        notifications: {
            enabled: JSON.parse(localStorage.getItem('notificationsEnabled') || 'true'),
            sound: JSON.parse(localStorage.getItem('notificationSound') || 'true')
        },
        ai: {
            role: localStorage.getItem('aiRole') || '你是个正在积极寻找工作机会的求职者，回复礼貌简短、言简意赅且避免大段文字，突出优势和能力展现专业素养。'
        },
        autoReply: JSON.parse(localStorage.getItem('autoReply') || 'true'),
        autoApply: JSON.parse(localStorage.getItem('autoApply') || 'true'),
        intervals: {
            basic: parseInt(localStorage.getItem('basicInterval') || '1000'),
            operation: parseInt(localStorage.getItem('operationInterval') || '800')
        },
        recruiterActivityStatus: JSON.parse(localStorage.getItem('recruiterActivityStatus') || '["不限"]'),
        // 自动发送图片简历相关配置
        useAutoSendImageResume: JSON.parse(localStorage.getItem('useAutoSendImageResume') || 'false'),
        imageResumePath: localStorage.getItem('imageResumePath') || '',
        imageResumeData: localStorage.getItem('imageResumeData') || null
    };

    // 2. saveSettings函数，保存配置
    function saveSettings() {
        localStorage.setItem('useAutoSendResume', settings.useAutoSendResume.toString());
        localStorage.setItem('excludeHeadhunters', settings.excludeHeadhunters.toString());
        localStorage.setItem('autoScrollSpeed', settings.autoScrollSpeed.toString());
        localStorage.setItem('customPhrases', JSON.stringify(settings.customPhrases));
        localStorage.setItem('clickDelay', settings.actionDelays.click.toString());
        localStorage.setItem('notificationsEnabled', settings.notifications.enabled.toString());
        localStorage.setItem('notificationSound', settings.notifications.sound.toString());
        localStorage.setItem('aiRole', settings.ai.role);
        localStorage.setItem('autoReply', settings.autoReply.toString());
        localStorage.setItem('autoApply', settings.autoApply.toString());
        localStorage.setItem('basicInterval', settings.intervals.basic.toString());
        localStorage.setItem('operationInterval', settings.intervals.operation.toString());
        localStorage.setItem('recruiterActivityStatus', JSON.stringify(settings.recruiterActivityStatus));
        // 保存图片简历配置
        localStorage.setItem('useAutoSendImageResume', settings.useAutoSendImageResume.toString());
        localStorage.setItem('imageResumePath', settings.imageResumePath);
        // 存储图片数据
        if (settings.imageResumeData) {
            localStorage.setItem('imageResumeData', settings.imageResumeData);
        }
    }

    // 3. loadSettings函数加载配置
    function loadSettings() {
        settings.useAutoSendResume = JSON.parse(localStorage.getItem('useAutoSendResume') || 'true');
        settings.excludeHeadhunters = JSON.parse(localStorage.getItem('excludeHeadhunters') || 'false');
        settings.autoScrollSpeed = parseInt(localStorage.getItem('autoScrollSpeed') || '500');
        settings.customPhrases = JSON.parse(localStorage.getItem('customPhrases') || '[]');
        settings.actionDelays.click = parseInt(localStorage.getItem('clickDelay') || '130');
        settings.notifications.enabled = JSON.parse(localStorage.getItem('notificationsEnabled') || 'true');
        settings.notifications.sound = JSON.parse(localStorage.getItem('notificationSound') || 'true');
        settings.ai.role = localStorage.getItem('aiRole') || '你是个正在积极寻找工作机会的求职者，回复礼貌简短、言简意赅且避免大段文字，突出优势和能力展现专业素养。';
        settings.autoReply = JSON.parse(localStorage.getItem('autoReply') || 'true');
        settings.autoApply = JSON.parse(localStorage.getItem('autoApply') || 'true');
        settings.intervals.basic = parseInt(localStorage.getItem('basicInterval') || '1000');
        settings.intervals.operation = parseInt(localStorage.getItem('operationInterval') || '800');
        settings.recruiterActivityStatus = JSON.parse(localStorage.getItem('recruiterActivityStatus') || '["不限"]');
        // 加载图片简历配置
        settings.useAutoSendImageResume = JSON.parse(localStorage.getItem('useAutoSendImageResume') || 'false');
        settings.imageResumePath = localStorage.getItem('imageResumePath') || '';
        settings.imageResumeData = localStorage.getItem('imageResumeData') || null;
    }

    // 4. createSettingsDialog函数添加新UI元素
    function createSettingsDialog() {
        const dialog = document.createElement('div');
        dialog.id = 'boss-settings-dialog';
        dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: clamp(300px, 90vw, 550px);
        height: 80vh;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        z-index: 999999;
        display: none;
        flex-direction: column;
        font-family: 'Segoe UI', sans-serif;
        overflow: hidden;
        transition: all 0.3s ease;
    `;

        dialog.innerHTML += `
        <style>
            #boss-settings-dialog {
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.95);
            }
            #boss-settings-dialog.active {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }
            .setting-item {
                transition: all 0.2s ease;
            }
            .setting-item:hover {
                background-color: rgba(0, 123, 255, 0.05);
            }
            .multi-select-container {
                position: relative;
                width: 100%;
                margin-top: 10px;
            }
            .multi-select-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px;
                border-radius: 8px;
                border: 1px solid #d1d5db;
                background: white;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .multi-select-header:hover {
                border-color: rgba(0, 123, 255, 0.7);
            }
            .multi-select-options {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                max-height: 200px;
                overflow-y: auto;
                border-radius: 8px;
                border: 1px solid #d1d5db;
                background: white;
                z-index: 100;
                box-shadow: 0 4px 10px rgba(0,0,0,0.1);
                display: none;
            }
            .multi-select-option {
                padding: 10px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .multi-select-option:hover {
                background-color: rgba(0, 123, 255, 0.05);
            }
            .multi-select-option.selected {
                background-color: rgba(0, 123, 255, 0.1);
            }
            .multi-select-clear {
                color: #666;
                cursor: pointer;
                margin-left: 5px;
            }
            .multi-select-clear:hover {
                color: #333;
            }
        </style>
    `;

        const dialogHeader = createDialogHeader('海投助手·BOSS设置');

        const dialogContent = document.createElement('div');
        dialogContent.style.cssText = `
        padding: 18px;
        flex: 1;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(0, 123, 255, 0.5) rgba(0, 0, 0, 0.05);
    `;

        dialogContent.innerHTML += `
    <style>
        #boss-settings-dialog ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        #boss-settings-dialog ::-webkit-scrollbar-track {
            background: rgba(0,0,0,0.05);
            border-radius: 10px;
            margin: 8px 0;
        }
        #boss-settings-dialog ::-webkit-scrollbar-thumb {
            background: rgba(0, 123, 255, 0.5);
            border-radius: 10px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            transition: all 0.2s ease;
        }
        #boss-settings-dialog ::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 123, 255, 0.7);
            box-shadow: 0 1px 5px rgba(0,0,0,0.15);
        }
    </style>
    `;

        const tabsContainer = document.createElement('div');
        tabsContainer.style.cssText = `
        display: flex;
        border-bottom: 1px solid rgba(0, 123, 255, 0.2);
        margin-bottom: 20px;
    `;

        const aiTab = document.createElement('button');
        aiTab.textContent = 'AI人设';
        aiTab.className = 'settings-tab active';
        aiTab.style.cssText = `
        padding: 9px 15px;
        background: rgba(0, 123, 255, 0.9);
        color: white;
        border: none;
        border-radius: 8px 8px 0 0;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        margin-right: 5px;
    `;

        const advancedTab = document.createElement('button');
        advancedTab.textContent = '高级设置';
        advancedTab.className = 'settings-tab';
        advancedTab.style.cssText = `
        padding: 9px 15px;
        background: rgba(0, 0, 0, 0.05);
        color: #333;
        border: none;
        border-radius: 8px 8px 0 0;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        margin-right: 5px;
    `;

        const intervalTab = document.createElement('button');
        intervalTab.textContent = '间隔设置';
        intervalTab.className = 'settings-tab';
        intervalTab.style.cssText = `
        padding: 9px 15px;
        background: rgba(0, 0, 0, 0.05);
        color: #333;
        border: none;
        border-radius: 8px 8px 0 0;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        margin-right: 5px;
    `;

        tabsContainer.append(aiTab, advancedTab, intervalTab);

        const aiSettingsPanel = document.createElement('div');
        aiSettingsPanel.id = 'ai-settings-panel';

        const roleSettingResult = createSettingItem(
            'AI角色定位',
            '定义AI在对话中的角色和语气特点',
            () => document.getElementById('ai-role-input')
        );

        const roleSetting = roleSettingResult.settingItem;

        const roleInput = document.createElement('textarea');
        roleInput.id = 'ai-role-input';
        roleInput.rows = 5;
        roleInput.style.cssText = `
        width: 100%;
        padding: 12px;
        border-radius: 8px;
        border: 1px solid #d1d5db;
        resize: vertical;
        font-size: 14px;
        transition: all 0.2s ease;
        margin-top: 10px;
    `;

        addFocusBlurEffects(roleInput);
        roleSetting.append(roleInput);

        const presetRoleSettingResult = createSettingItem(
            '预设角色',
            '选择预设的AI角色模板',
            () => document.getElementById('ai-preset-select')
        );

        const presetRoleSetting = presetRoleSettingResult.settingItem;

        const presetSelect = document.createElement('select');
        presetSelect.id = 'ai-preset-select';
        presetSelect.style.cssText = `
        width: 100%;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid #d1d5db;
        font-size: 14px;
        background: white;
        color: #333;
        margin-top: 10px;
        transition: all 0.2s ease;
    `;

        const presets = [
            { value: 'default', text: '默认角色' },
            { value: 'tech', text: '技术专家' },
            { value: 'product', text: '产品经理' },
            { value: 'marketing', text: '市场营销' }
        ];

        presets.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.value;
            option.textContent = preset.text;
            presetSelect.appendChild(option);
        });

        presetSelect.addEventListener('change', () => {
            if (presetSelect.value !== 'custom') {
                const presetValues = {
                    'default': '你是个正在积极寻找工作机会的求职者，回复礼貌简短、言简意赅且避免大段文字，突出优势和能力展现专业素养。',
                    'tech': '你是资深技术专家，对技术问题有深入理解。回复简短，言简意赅的同时保持专业和礼貌。遇到不确定的问题，会坦诚说明。',
                    'product': '你是经验丰富的产品经理，善于沟通和理解需求。回复简短，言简意赅的同时会主动提问以明确需求。',
                    'marketing': '你是市场营销专家，擅长沟通和推广。回复简短，言简意赅的同时会突出价值点。'
                };
                roleInput.value = presetValues[presetSelect.value];
            }
        });

        presetRoleSetting.append(presetSelect);

        aiSettingsPanel.append(roleSetting, presetRoleSetting);

        const advancedSettingsPanel = document.createElement('div');
        advancedSettingsPanel.id = 'advanced-settings-panel';
        advancedSettingsPanel.style.display = 'none';

        const autoReplySettingResult = createSettingItem(
            '自动回复模式',
            '开启后系统将自动回复消息',
            () => document.querySelector('#toggle-auto-reply-mode input')
        );

        const autoReplySetting = autoReplySettingResult.settingItem;
        const autoReplyDescriptionContainer = autoReplySettingResult.descriptionContainer;

        const autoReplyToggle = createToggleSwitch(
            'auto-reply-mode',
            settings.autoReply,
            (checked) => { settings.autoReply = checked; }
        );

        autoReplyDescriptionContainer.append(autoReplyToggle);

        const autoSendResumeSettingResult = createSettingItem(
            '自动发送简历',
            '开启后系统将自动发送简历给HR',
            () => document.querySelector('#toggle-auto-send-resume input')
        );

        const autoSendResumeSetting = autoSendResumeSettingResult.settingItem;
        const autoSendResumeDescriptionContainer = autoSendResumeSettingResult.descriptionContainer;

        const autoSendResumeToggle = createToggleSwitch(
            'auto-send-resume',
            settings.useAutoSendResume,
            (checked) => { settings.useAutoSendResume = checked; }
        );

        autoSendResumeDescriptionContainer.append(autoSendResumeToggle);

        const excludeHeadhuntersSettingResult = createSettingItem(
            '投递时排除猎头',
            '开启后将不会向猎头职位自动投递简历',
            () => document.querySelector('#toggle-exclude-headhunters input')
        );

        const excludeHeadhuntersSetting = excludeHeadhuntersSettingResult.settingItem;
        const excludeHeadhuntersDescriptionContainer = excludeHeadhuntersSettingResult.descriptionContainer;

        const excludeHeadhuntersToggle = createToggleSwitch(
            'exclude-headhunters',
            settings.excludeHeadhunters,
            (checked) => { settings.excludeHeadhunters = checked; }
        );

        excludeHeadhuntersDescriptionContainer.append(excludeHeadhuntersToggle);

        // 自动发送图片简历开关
        const autoSendImageResumeSettingResult = createSettingItem(
            '自动发送图片简历',
            '开启后将发送图片简历给HR',
            () => document.querySelector('#toggle-auto-send-image-resume input')
        );

        const autoSendImageResumeSetting = autoSendImageResumeSettingResult.settingItem;
        const autoSendImageResumeDescriptionContainer = autoSendImageResumeSettingResult.descriptionContainer;

        const autoSendImageResumeToggle = createToggleSwitch(
            'auto-send-image-resume',
            settings.useAutoSendImageResume,
            (checked) => {
                settings.useAutoSendImageResume = checked;
                // 启用/禁用文件选择按钮
                const fileInput = document.getElementById('image-resume-input');
                const fileButton = document.getElementById('select-image-resume-btn');
                if (fileInput && fileButton) {
                    fileInput.disabled = !checked;
                    fileButton.disabled = !checked;
                }

                // 当开关打开且未选择文件时，自动弹出文件选择框
                if (checked && !settings.imageResumePath) {
                    setTimeout(() => {
                        fileInput.click();
                    }, 100);
                }
            }
        );

        autoSendImageResumeDescriptionContainer.append(autoSendImageResumeToggle);

        // 图片简历选择按钮和显示区域
        const imageResumeSettingResult = createSettingItem(
            '选择图片简历',
            '选择要发送的简历图片',
            () => document.getElementById('select-image-resume-btn')
        );

        const imageResumeSetting = imageResumeSettingResult.settingItem;

        const fileInputContainer = document.createElement('div');
        fileInputContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    margin-top: 10px;
`;

        const fileInput = document.createElement('input');
        fileInput.id = 'image-resume-input';
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        fileInput.disabled = !settings.useAutoSendImageResume;

        const fileButton = document.createElement('button');
        fileButton.id = 'select-image-resume-btn';
        fileButton.textContent = '选择图片文件';
        fileButton.style.cssText = `
    padding: 8px 16px;
    border-radius: 6px;
    border: 1px solid rgba(0, 123, 255, 0.7);
    background: rgba(0, 123, 255, 0.1);
    color: rgba(0, 123, 255, 0.9);
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
    white-space: nowrap;
    disabled: ${settings.useAutoSendImageResume ? 'false' : 'true'};
`;

        const fileNameDisplay = document.createElement('div');
        fileNameDisplay.id = 'image-resume-filename';
        fileNameDisplay.style.cssText = `
    flex: 1;
    padding: 8px;
    border-radius: 6px;
    border: 1px solid #d1d5db;
    background: #f8fafc;
    color: #334155;
    font-size: 14px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
`;
        fileNameDisplay.textContent = settings.imageResumePath || '未选择文件';

        fileButton.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                settings.imageResumePath = file.name;

                // 读取图片并转换为Base64
                const reader = new FileReader();
                reader.onload = function (event) {
                    settings.imageResumeData = event.target.result;
                    fileNameDisplay.textContent = file.name;
                };
                reader.readAsDataURL(file);
            } else {
                // 修复：用户取消选择时重置状态并关闭开关
                settings.useAutoSendImageResume = false;
                settings.imageResumePath = '';
                settings.imageResumeData = null;
                fileNameDisplay.textContent = '未选择文件';

                // 更新开关UI状态
                const autoSendImageResumeInput = document.querySelector('#toggle-auto-send-image-resume input');
                if (autoSendImageResumeInput) {
                    autoSendImageResumeInput.checked = false;
                    // 触发change事件更新样式
                    autoSendImageResumeInput.dispatchEvent(new Event('change'));
                }
            }
        });

        fileButton.addEventListener('mouseenter', () => {
            if (!fileButton.disabled) {
                fileButton.style.background = 'rgba(0, 123, 255, 0.2)';
            }
        });

        fileButton.addEventListener('mouseleave', () => {
            if (!fileButton.disabled) {
                fileButton.style.background = 'rgba(0, 123, 255, 0.1)';
            }
        });

        fileButton.addEventListener('focus', () => {
            if (!fileButton.disabled) {
                fileButton.style.boxShadow = '0 0 0 3px rgba(0, 123, 255, 0.2)';
            }
        });

        fileButton.addEventListener('blur', () => {
            fileButton.style.boxShadow = 'none';
        });

        fileInputContainer.append(fileButton, fileNameDisplay, fileInput);
        imageResumeSetting.append(fileInputContainer);

        const recruiterStatusSettingResult = createSettingItem(
            '投递招聘者状态',
            '筛选活跃状态符合要求的招聘者进行投递',
            () => document.querySelector('#recruiter-status-select .select-header')
        );

        const recruiterStatusSetting = recruiterStatusSettingResult.settingItem;

        const statusSelect = document.createElement('div');
        statusSelect.id = 'recruiter-status-select';
        statusSelect.className = 'custom-select';
        statusSelect.style.cssText = `
        position: relative;
        width: 100%;
        margin-top: 10px;
    `;

        const statusHeader = document.createElement('div');
        statusHeader.className = 'select-header';
        statusHeader.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        background: white;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        min-height: 44px;
    `;

        const statusDisplay = document.createElement('div');
        statusDisplay.className = 'select-value';
        statusDisplay.style.cssText = `
        flex: 1;
        text-align: left;
        color: #334155;
        font-size: 14px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    `;
        statusDisplay.textContent = getStatusDisplayText();

        const statusIcon = document.createElement('div');
        statusIcon.className = 'select-icon';
        statusIcon.innerHTML = '&#9660;';
        statusIcon.style.cssText = `
        margin-left: 10px;
        color: #64748b;
        transition: transform 0.2s ease;
    `;

        const statusClear = document.createElement('button');
        statusClear.className = 'select-clear';
        statusClear.innerHTML = '×';
        statusClear.style.cssText = `
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 16px;
        margin-left: 8px;
        display: none;
        transition: color 0.2s ease;
    `;

        statusHeader.append(statusDisplay, statusClear, statusIcon);

        const statusOptions = document.createElement('div');
        statusOptions.className = 'select-options';
        statusOptions.style.cssText = `
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        right: 0;
        max-height: 240px;
        overflow-y: auto;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        background: white;
        z-index: 100;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        display: none;
        transition: all 0.2s ease;
        scrollbar-width: thin;
        scrollbar-color: #cbd5e1 #f1f5f9;
    `;

        statusOptions.innerHTML += `
        <style>
            .select-options::-webkit-scrollbar {
                width: 6px;
            }
            .select-options::-webkit-scrollbar-track {
                background: #f1f5f9;
                border-radius: 10px;
            }
            .select-options::-webkit-scrollbar-thumb {
                background: #cbd5e1;
                border-radius: 10px;
            }
            .select-options::-webkit-scrollbar-thumb:hover {
                background: #94a3b8;
            }
        </style>
    `;

        const statusOptionsList = [
            { value: '不限', text: '不限' },
            { value: '在线', text: '在线' },
            { value: '刚刚活跃', text: '刚刚活跃' },
            { value: '今日活跃', text: '今日活跃' },
            { value: '3日内活跃', text: '3日内活跃' },
            { value: '本周活跃', text: '本周活跃' },
            { value: '本月活跃', text: '本月活跃' },
            { value: '半年前活跃', text: '半年前活跃' }
        ];

        statusOptionsList.forEach(option => {
            const statusOption = document.createElement('div');
            statusOption.className = 'select-option' + (settings.recruiterActivityStatus.includes(option.value) ? ' selected' : '');
            statusOption.dataset.value = option.value;
            statusOption.style.cssText = `
            padding: 12px 16px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            font-size: 14px;
            color: #334155;
        `;

            const checkIcon = document.createElement('span');
            checkIcon.className = 'check-icon';
            checkIcon.innerHTML = '✓';
            checkIcon.style.cssText = `
            margin-right: 8px;
            color: rgba(0, 123, 255, 0.9);
            font-weight: bold;
            display: ${settings.recruiterActivityStatus.includes(option.value) ? 'inline' : 'none'};
        `;

            const textSpan = document.createElement('span');
            textSpan.textContent = option.text;

            statusOption.append(checkIcon, textSpan);

            statusOption.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleStatusOption(option.value);
            });

            statusOptions.appendChild(statusOption);
        });

        statusHeader.addEventListener('click', () => {
            statusOptions.style.display = statusOptions.style.display === 'block' ? 'none' : 'block';
            statusIcon.style.transform = statusOptions.style.display === 'block' ? 'rotate(180deg)' : 'rotate(0)';
        });

        statusClear.addEventListener('click', (e) => {
            e.stopPropagation();
            settings.recruiterActivityStatus = [];
            updateStatusOptions();
        });

        document.addEventListener('click', (e) => {
            if (!statusSelect.contains(e.target)) {
                statusOptions.style.display = 'none';
                statusIcon.style.transform = 'rotate(0)';
            }
        });

        statusHeader.addEventListener('mouseenter', () => {
            statusHeader.style.borderColor = 'rgba(0, 123, 255, 0.5)';
            statusHeader.style.boxShadow = '0 0 0 3px rgba(0, 123, 255, 0.1)';
        });

        statusHeader.addEventListener('mouseleave', () => {
            if (!statusHeader.contains(document.activeElement)) {
                statusHeader.style.borderColor = '#e2e8f0';
                statusHeader.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
            }
        });

        statusHeader.addEventListener('focus', () => {
            statusHeader.style.borderColor = 'rgba(0, 123, 255, 0.7)';
            statusHeader.style.boxShadow = '0 0 0 3px rgba(0, 123, 255, 0.2)';
        });

        statusHeader.addEventListener('blur', () => {
            statusHeader.style.borderColor = '#e2e8f0';
            statusHeader.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
        });

        statusSelect.append(statusHeader, statusOptions);
        recruiterStatusSetting.append(statusSelect);

        advancedSettingsPanel.append(autoReplySetting, autoSendResumeSetting, excludeHeadhuntersSetting, autoSendImageResumeSetting, imageResumeSetting, recruiterStatusSetting);

        const intervalSettingsPanel = document.createElement('div');
        intervalSettingsPanel.id = 'interval-settings-panel';
        intervalSettingsPanel.style.display = 'none';

        const basicIntervalSettingResult = createSettingItem(
            '基本间隔',
            '滚动、检查新聊天等间隔时间（毫秒）',
            () => document.getElementById('basic-interval-input')
        );

        const basicIntervalSetting = basicIntervalSettingResult.settingItem;

        const basicIntervalInput = document.createElement('input');
        basicIntervalInput.id = 'basic-interval-input';
        basicIntervalInput.type = 'number';
        basicIntervalInput.min = 500;
        basicIntervalInput.max = 10000;
        basicIntervalInput.step = 100;
        basicIntervalInput.style.cssText = `
        width: 100%;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid #d1d5db;
        font-size: 14px;
        margin-top: 10px;
        transition: all 0.2s ease;
    `;

        addFocusBlurEffects(basicIntervalInput);
        basicIntervalSetting.append(basicIntervalInput);

        const operationIntervalSettingResult = createSettingItem(
            '操作间隔',
            '点击沟通按钮之间的间隔时间（毫秒）',
            () => document.getElementById('operation-interval-input')
        );

        const operationIntervalSetting = operationIntervalSettingResult.settingItem;

        const operationIntervalInput = document.createElement('input');
        operationIntervalInput.id = 'operation-interval-input';
        operationIntervalInput.type = 'number';
        operationIntervalInput.min = 100;
        operationIntervalInput.max = 2000;
        operationIntervalInput.step = 50;
        operationIntervalInput.style.cssText = `
        width: 100%;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid #d1d5db;
        font-size: 14px;
        margin-top: 10px;
        transition: all 0.2s ease;
    `;

        addFocusBlurEffects(operationIntervalInput);
        operationIntervalSetting.append(operationIntervalInput);

        const scrollSpeedSettingResult = createSettingItem(
            '自动滚动速度',
            '页面自动滚动的速度 (毫秒/像素)',
            () => document.getElementById('scroll-speed-input')
        );

        const scrollSpeedSetting = scrollSpeedSettingResult.settingItem;

        const scrollSpeedInput = document.createElement('input');
        scrollSpeedInput.id = 'scroll-speed-input';
        scrollSpeedInput.type = 'number';
        scrollSpeedInput.min = 100;
        scrollSpeedInput.max = 2000;
        scrollSpeedInput.step = 50;
        scrollSpeedInput.style.cssText = `
        width: 100%;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid #d1d5db;
        font-size: 14px;
        margin-top: 10px;
        transition: all 0.2s ease;
    `;

        addFocusBlurEffects(scrollSpeedInput);
        scrollSpeedSetting.append(scrollSpeedInput);

        intervalSettingsPanel.append(basicIntervalSetting, operationIntervalSetting, scrollSpeedSetting);

        aiTab.addEventListener('click', () => {
            setActiveTab(aiTab, aiSettingsPanel);
        });

        advancedTab.addEventListener('click', () => {
            setActiveTab(advancedTab, advancedSettingsPanel);
        });

        intervalTab.addEventListener('click', () => {
            setActiveTab(intervalTab, intervalSettingsPanel);
        });

        const dialogFooter = document.createElement('div');
        dialogFooter.style.cssText = `
        padding: 15px 20px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        background: rgba(0, 0, 0, 0.03);
    `;

        const cancelBtn = createTextButton(
            '取消',
            '#e5e7eb',
            () => {
                dialog.style.display = 'none';
            }
        );

        const saveBtn = createTextButton(
            '保存设置',
            'rgba(0, 123, 255, 0.9)',
            () => {
                try {
                    const aiRoleInput = document.getElementById('ai-role-input');
                    settings.ai.role = aiRoleInput ? aiRoleInput.value : '';

                    const basicIntervalInput = document.getElementById('basic-interval-input');
                    const basicIntervalValue = basicIntervalInput ? parseInt(basicIntervalInput.value) : settings.intervals.basic;
                    settings.intervals.basic = isNaN(basicIntervalValue) ? settings.intervals.basic : basicIntervalValue;

                    const operationIntervalInput = document.getElementById('operation-interval-input');
                    const operationIntervalValue = operationIntervalInput ? parseInt(operationIntervalInput.value) : settings.intervals.operation;
                    settings.intervals.operation = isNaN(operationIntervalValue) ? settings.intervals.operation : operationIntervalValue;

                    const scrollSpeedInput = document.getElementById('scroll-speed-input');
                    const scrollSpeedValue = scrollSpeedInput ? parseInt(scrollSpeedInput.value) : settings.autoScrollSpeed;
                    settings.autoScrollSpeed = isNaN(scrollSpeedValue) ? settings.autoScrollSpeed : scrollSpeedValue;

                    saveSettings();

                    showNotification('设置已保存');
                    dialog.style.display = 'none';
                } catch (error) {
                    showNotification('保存失败: ' + error.message, 'error');
                    console.error('保存设置失败:', error);
                }
            }
        );

        dialogFooter.append(cancelBtn, saveBtn);

        dialogContent.append(tabsContainer, aiSettingsPanel, advancedSettingsPanel, intervalSettingsPanel);
        dialog.append(dialogHeader, dialogContent, dialogFooter);

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.style.display = 'none';
            }
        });

        return dialog;
    }

    function showSettingsDialog() {
        let dialog = document.getElementById('boss-settings-dialog');
        if (!dialog) {
            dialog = createSettingsDialog();
            document.body.appendChild(dialog);
        }

        dialog.style.display = 'flex';

        setTimeout(() => {
            dialog.classList.add('active');
            setTimeout(loadSettingsIntoUI, 100);
        }, 10);
    }

    function toggleStatusOption(value) {
        if (value === '不限') {
            settings.recruiterActivityStatus = settings.recruiterActivityStatus.includes('不限') ? [] : ['不限'];
        } else {
            if (settings.recruiterActivityStatus.includes('不限')) {
                settings.recruiterActivityStatus = [value];
            } else {
                if (settings.recruiterActivityStatus.includes(value)) {
                    settings.recruiterActivityStatus = settings.recruiterActivityStatus.filter(v => v !== value);
                } else {
                    settings.recruiterActivityStatus.push(value);
                }

                if (settings.recruiterActivityStatus.length === 0) {
                    settings.recruiterActivityStatus = ['不限'];
                }
            }
        }

        updateStatusOptions();
    }

    function updateStatusOptions() {
        const options = document.querySelectorAll('#recruiter-status-select .select-option');
        options.forEach(option => {
            const isSelected = settings.recruiterActivityStatus.includes(option.dataset.value);
            option.className = 'select-option' + (isSelected ? ' selected' : '');
            option.querySelector('.check-icon').style.display = isSelected ? 'inline' : 'none';

            if (option.dataset.value === '不限') {
                if (isSelected) {
                    options.forEach(opt => {
                        if (opt.dataset.value !== '不限') {
                            opt.className = 'select-option';
                            opt.querySelector('.check-icon').style.display = 'none';
                        }
                    });
                }
            }
        });

        document.querySelector('#recruiter-status-select .select-value').textContent = getStatusDisplayText();

        document.querySelector('#recruiter-status-select .select-clear').style.display =
            settings.recruiterActivityStatus.length > 0 && !settings.recruiterActivityStatus.includes('不限') ? 'inline' : 'none';
    }

    function getStatusDisplayText() {
        if (settings.recruiterActivityStatus.includes('不限')) {
            return '不限';
        }

        if (settings.recruiterActivityStatus.length === 0) {
            return '请选择';
        }

        if (settings.recruiterActivityStatus.length <= 2) {
            return settings.recruiterActivityStatus.join('、');
        }

        return `${settings.recruiterActivityStatus[0]}、${settings.recruiterActivityStatus[1]}等${settings.recruiterActivityStatus.length}项`;
    }

    function loadSettingsIntoUI() {
        const aiRoleInput = document.getElementById('ai-role-input');
        if (aiRoleInput) {
            aiRoleInput.value = settings.ai.role;
        }

        const autoReplyInput = document.querySelector('#toggle-auto-reply-mode input');
        if (autoReplyInput) {
            autoReplyInput.checked = settings.autoReply;
        }

        const autoSendResumeInput = document.querySelector('#toggle-auto-send-resume input');
        if (autoSendResumeInput) {
            autoSendResumeInput.checked = settings.useAutoSendResume;
        }

        const excludeHeadhuntersInput = document.querySelector('#toggle-exclude-headhunters input');
        if (excludeHeadhuntersInput) {
            excludeHeadhuntersInput.checked = settings.excludeHeadhunters;
        }

        const basicIntervalInput = document.getElementById('basic-interval-input');
        if (basicIntervalInput) {
            basicIntervalInput.value = settings.intervals.basic.toString();
        }

        const operationIntervalInput = document.getElementById('operation-interval-input');
        if (operationIntervalInput) {
            operationIntervalInput.value = settings.intervals.operation.toString();
        }

        const scrollSpeedInput = document.getElementById('scroll-speed-input');
        if (scrollSpeedInput) {
            scrollSpeedInput.value = settings.autoScrollSpeed.toString();
        }

        // 加载图片简历设置
        const autoSendImageResumeInput = document.querySelector('#toggle-auto-send-image-resume input');
        if (autoSendImageResumeInput) {
            autoSendImageResumeInput.checked = settings.useAutoSendImageResume;
        }

        const fileNameDisplay = document.getElementById('image-resume-filename');
        if (fileNameDisplay) {
            fileNameDisplay.textContent = settings.imageResumePath || '未选择文件';
        }

        const fileInput = document.getElementById('image-resume-input');
        const fileButton = document.getElementById('select-image-resume-btn');
        if (fileInput && fileButton) {
            fileInput.disabled = !settings.useAutoSendImageResume;
            fileButton.disabled = !settings.useAutoSendImageResume;
        }

        updateStatusOptions();
    }

    function createDialogHeader(title) {
        const header = document.createElement('div');
        header.style.cssText = `
        padding: 9px 16px;
        background: rgba(0, 123, 255, 0.9);
        color: white;
        font-size: 19px;
        font-weight: 500;
        display: flex;
        justify-content: space-between;
        align-items: center;
        position: relative;
    `;

        const titleElement = document.createElement('div');
        titleElement.textContent = title;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.title = '关闭设置';
        closeBtn.style.cssText = `
        width: 32px;
        height: 32px;
        background: rgba(255, 255, 255, 0.15);
        color: white;
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
        font-size: 16px;
    `;

        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.25)';
        });

        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
        });

        closeBtn.addEventListener('click', () => {
            const dialog = document.getElementById('boss-settings-dialog');
            dialog.style.display = 'none';
        });

        header.append(titleElement, closeBtn);
        return header;
    }

    function createSettingItem(title, description, controlGetter) {
        const settingItem = document.createElement('div');
        settingItem.className = 'setting-item';
        settingItem.style.cssText = `
        padding: 15px;
        border-radius: 10px;
        margin-bottom: 15px;
        background: white;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        border: 1px solid rgba(0, 123, 255, 0.1);
        display: flex;
        flex-direction: column;
    `;

        const titleElement = document.createElement('h4');
        titleElement.textContent = title;
        titleElement.style.cssText = `
        margin: 0 0 5px;
        color: #333;
        font-size: 16px;
        font-weight: 500;
    `;

        const descElement = document.createElement('p');
        descElement.textContent = description;
        descElement.style.cssText = `
        margin: 0;
        color: #666;
        font-size: 13px;
        line-height: 1.4;
    `;

        const descriptionContainer = document.createElement('div');
        descriptionContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
    `;

        const textContainer = document.createElement('div');
        textContainer.append(titleElement, descElement);

        descriptionContainer.append(textContainer);

        settingItem.append(descriptionContainer);

        settingItem.addEventListener('click', () => {
            const control = controlGetter();
            if (control && typeof control.focus === 'function') {
                control.focus();
            }
        });

        return {
            settingItem,
            descriptionContainer
        };
    }

    function createToggleSwitch(id, isChecked, onChange) {
        const container = document.createElement('div');
        container.className = 'toggle-container';
        container.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

        const switchContainer = document.createElement('div');
        switchContainer.className = 'toggle-switch';
        switchContainer.style.cssText = `
        position: relative;
        width: 50px;
        height: 26px;
        border-radius: 13px;
        background-color: #e5e7eb;
        transition: background-color 0.3s;
        cursor: pointer;
    `;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `toggle-${id}`;
        checkbox.checked = isChecked;
        checkbox.style.display = 'none';

        const slider = document.createElement('span');
        slider.className = 'toggle-slider';
        slider.style.cssText = `
        position: absolute;
        top: 3px;
        left: 3px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background-color: white;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        transition: transform 0.3s;
    `;

        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                switchContainer.style.backgroundColor = 'rgba(0, 123, 255, 0.9)';
                slider.style.transform = 'translateX(24px)';
            } else {
                switchContainer.style.backgroundColor = '#e5e7eb';
                slider.style.transform = 'translateX(0)';
            }

            if (onChange) {
                onChange(checkbox.checked);
            }
        });

        if (isChecked) {
            switchContainer.style.backgroundColor = 'rgba(0, 123, 255, 0.9)';
            slider.style.transform = 'translateX(24px)';
        }

        switchContainer.addEventListener('click', () => {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        });

        switchContainer.append(checkbox, slider);
        container.append(switchContainer);

        return container;
    }

    function createTextButton(text, backgroundColor, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.cssText = `
        padding: 9px 18px;
        border-radius: 8px;
        border: none;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        background: ${backgroundColor};
        color: white;
    `;

        button.addEventListener('click', onClick);

        return button;
    }

    function addFocusBlurEffects(element) {
        element.addEventListener('focus', () => {
            element.style.borderColor = 'rgba(0, 123, 255, 0.7)';
            element.style.boxShadow = '0 0 0 3px rgba(0, 123, 255, 0.2)';
        });

        element.addEventListener('blur', () => {
            element.style.borderColor = '#d1d5db';
            element.style.boxShadow = 'none';
        });
    }

    function setActiveTab(tab, panel) {
        const tabs = document.querySelectorAll('.settings-tab');
        const panels = [
            document.getElementById('ai-settings-panel'),
            document.getElementById('advanced-settings-panel'),
            document.getElementById('interval-settings-panel')
        ];

        tabs.forEach(t => {
            t.classList.remove('active');
            t.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
            t.style.color = '#333';
        });

        panels.forEach(p => {
            p.style.display = 'none';
        });

        tab.classList.add('active');
        tab.style.backgroundColor = 'rgba(0, 123, 255, 0.9)';
        tab.style.color = 'white';

        panel.style.display = 'block';
    }

    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        const bgColor = type === 'success' ? 'rgba(40, 167, 69, 0.9)' : 'rgba(220, 53, 69, 0.9)';

        notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${bgColor};
        color: white;
        padding: 10px 15px;
        border-radius: 8px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        z-index: 9999999;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;

        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => notification.style.opacity = '1', 10);
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => document.body.removeChild(notification), 300);
        }, 2000);
    }

    function filterJobsByKeywords(jobDescriptions) {
        const excludeKeywords = [];
        const includeKeywords = [];

        return jobDescriptions.filter(description => {
            for (const keyword of excludeKeywords) {
                if (description.includes(keyword)) {
                    return false;
                }
            }

            if (includeKeywords.length > 0) {
                return includeKeywords.some(keyword => description.includes(keyword));
            }

            return true;
        });
    }

    // 核心功能模块
    const Core = {
        basicInterval: parseInt(localStorage.getItem('basicInterval')) || CONFIG.BASIC_INTERVAL,
        operationInterval: parseInt(localStorage.getItem('operationInterval')) || CONFIG.OPERATION_INTERVAL,
        messageObserver: null,
        lastProcessedMessage: null,
        processingMessage: false,

        async startProcessing() {
            if (location.pathname.includes('/jobs')) await this.autoScrollJobList();

            while (state.isRunning) {
                if (location.pathname.includes('/jobs')) await this.processJobList();
                else if (location.pathname.includes('/chat')) await this.handleChatPage();
                await this.delay(this.basicInterval);
            }
        },

        async autoScrollJobList() {
            return new Promise((resolve) => {
                const cardSelector = 'li.job-card-box';
                const maxHistory = 3;
                const waitTime = this.basicInterval;
                let cardCountHistory = [];
                let isStopped = false;

                const scrollStep = async () => {
                    if (isStopped) return;

                    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
                    await this.delay(waitTime);

                    const cards = document.querySelectorAll(cardSelector);
                    const currentCount = cards.length;
                    cardCountHistory.push(currentCount);

                    if (cardCountHistory.length > maxHistory) cardCountHistory.shift();

                    if (cardCountHistory.length === maxHistory && new Set(cardCountHistory).size === 1) {
                        this.log("当前页面岗位加载完成，开始沟通");
                        resolve(cards);
                        return;
                    }

                    scrollStep();
                };

                scrollStep();

                this.stopAutoScroll = () => {
                    isStopped = true;
                    resolve(null);
                };
            });
        },

        async processJobList() {
            const excludeHeadhunters = JSON.parse(localStorage.getItem('excludeHeadhunters') || 'false');
            const activeStatusFilter = JSON.parse(localStorage.getItem('recruiterActivityStatus') || '["不限"]');

            // 使用新的包含/排除关键词筛选逻辑
            state.jobList = Array.from(document.querySelectorAll('li.job-card-box')).filter(card => {
                const title = card.querySelector('.job-name')?.textContent?.toLowerCase() || '';
                const location = card.querySelector('.company-location')?.textContent?.toLowerCase().trim() || '';
                const headhuntingElement = card.querySelector('.job-tag-icon');
                const altText = headhuntingElement ? headhuntingElement.alt : '';

                // 职位名包含筛选（空数组表示不限制）
                const includeMatch = state.includeKeywords.length === 0 ||
                    state.includeKeywords.some(kw => title.includes(kw.trim()));

                // 职位名排除筛选（空数组表示不限制）
                const excludeMatch = state.excludeKeywords.length === 0 ||
                    !state.excludeKeywords.some(kw => title.includes(kw.trim()));

                const excludeHeadhunterMatch = !excludeHeadhunters || !altText.includes("猎头");

                return includeMatch && excludeMatch && excludeHeadhunterMatch;
            });

            if (!state.jobList.length) {
                this.log('没有符合条件的职位');
                toggleProcess();
                return;
            }

            if (state.currentIndex >= state.jobList.length) {
                this.resetCycle();
                return;
            }

            const currentCard = state.jobList[state.currentIndex];
            currentCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            currentCard.click();

            await this.delay(this.operationInterval);

            let activeTime = '未知';
            const onlineTag = document.querySelector('.boss-online-tag');
            if (onlineTag && onlineTag.textContent.trim() === '在线') {
                activeTime = '在线';
            } else {
                const activeTimeElement = document.querySelector('.boss-active-time');
                activeTime = activeTimeElement?.textContent?.trim() || '未知';
            }

            const isActiveStatusMatch = activeStatusFilter.includes('不限') || activeStatusFilter.includes(activeTime);

            if (!isActiveStatusMatch) {
                this.log(`跳过: 招聘者状态 "${activeTime}"`);
                state.currentIndex++;
                return;
            }

            // 记录筛选条件日志
            const includeLog = state.includeKeywords.length ? `包含【${state.includeKeywords.join('、')}】` : '无包含限制';
            const excludeLog = state.excludeKeywords.length ? `排除【${state.excludeKeywords.join('、')}】` : '无排除限制';
            this.log(`正在沟通：${++state.currentIndex}/${state.jobList.length}，招聘者"${activeTime}"`);

            const chatBtn = document.querySelector('a.op-btn-chat');
            if (chatBtn) {
                const btnText = chatBtn.textContent.trim();
                if (btnText === '立即沟通') {
                    chatBtn.click();
                    await this.handleGreetingModal();
                }
            }
        },

        async handleGreetingModal() {
            await this.delay(this.operationInterval);

            const btn = [...document.querySelectorAll('.default-btn.cancel-btn')]
                .find(b => b.textContent.trim() === '留在此页');

            if (btn) {
                btn.click();
                await this.delay(this.operationInterval);
            }
        },

        async handleChatPage() {
            this.resetMessageState();

            if (this.messageObserver) {
                this.messageObserver.disconnect();
                this.messageObserver = null;
            }

            const latestChatLi = await this.waitForElement(this.getLatestChatLi);
            if (!latestChatLi) return;

            const nameEl = latestChatLi.querySelector('.name-text');
            const companyEl = latestChatLi.querySelector('.name-box span:nth-child(2)');
            const name = (nameEl?.textContent || '未知').trim();
            const company = (companyEl?.textContent || '').trim();
            const hrKey = `${name}-${company}`.toLowerCase();

            if (!latestChatLi.classList.contains('last-clicked')) {
                await this.simulateClick(latestChatLi.querySelector('.figure'));
                latestChatLi.classList.add('last-clicked');
                state.hrInteractions.currentTopHRKey = hrKey;

                await this.delay(this.operationInterval);
                await HRInteractionManager.handleHRInteraction(hrKey);
            }

            await this.setupMessageObserver(hrKey);
        },

        resetMessageState() {
            this.lastProcessedMessage = null;
            this.processingMessage = false;
        },

        async setupMessageObserver(hrKey) {
            const chatContainer = await this.waitForElement('.chat-message .im-list');
            if (!chatContainer) return;

            this.messageObserver = new MutationObserver(async (mutations) => {
                let hasNewFriendMessage = false;
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        hasNewFriendMessage = Array.from(mutation.addedNodes).some(node =>
                            node.classList?.contains('item-friend')
                        );
                        if (hasNewFriendMessage) break;
                    }
                }

                if (hasNewFriendMessage) {
                    await this.handleNewMessage(hrKey);
                }
            });

            this.messageObserver.observe(chatContainer, { childList: true, subtree: true });
        },

        async handleNewMessage(hrKey) {
            if (!state.isRunning) return;
            if (this.processingMessage) return;

            this.processingMessage = true;

            try {
                await this.delay(this.operationInterval);

                const lastMessage = await this.getLastFriendMessageText();
                if (!lastMessage) return;

                const cleanedMessage = this.cleanMessage(lastMessage);
                const shouldSendResumeOnly = cleanedMessage.includes('简历');

                if (cleanedMessage === this.lastProcessedMessage) return;

                this.lastProcessedMessage = cleanedMessage;
                this.log(`对方: ${lastMessage}`);

                await this.delay(200);
                const updatedMessage = await this.getLastFriendMessageText();
                if (updatedMessage && this.cleanMessage(updatedMessage) !== cleanedMessage) {
                    await this.handleNewMessage(hrKey);
                    return;
                }

                const autoSendResume = JSON.parse(localStorage.getItem('useAutoSendResume') || 'true');
                const autoReplyEnabled = JSON.parse(localStorage.getItem('autoReply') || 'true');

                if (shouldSendResumeOnly && autoSendResume) {
                    this.log('对方提到"简历"，正在发送简历');
                    const sent = await HRInteractionManager.sendResume();
                    if (sent) {
                        state.hrInteractions.sentResumeHRs.add(hrKey);
                        StatePersistence.saveState();
                        this.log(`已向 ${hrKey} 发送简历`);
                    }
                } else if (autoReplyEnabled) {
                    await HRInteractionManager.handleHRInteraction(hrKey);
                }

                await this.delay(500);
                const postReplyMessage = await this.getLastFriendMessageText();
            } catch (error) {
                this.log(`处理消息出错: ${error.message}`);
            } finally {
                this.processingMessage = false;
            }
        },

        cleanMessage(message) {
            if (!message) return '';

            let clean = message.replace(/<[^>]*>/g, '');
            clean = clean.trim().replace(/\s+/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '');
            return clean;
        },

        getLatestChatLi() {
            return document.querySelector('li[role="listitem"][class]:has(.friend-content-warp)');
        },

        async aiReply() {
            if (!state.isRunning) return;
            try {
                const autoReplyEnabled = JSON.parse(localStorage.getItem('autoReply') || 'true');
                if (!autoReplyEnabled) {
                    return false;
                }

                if (!state.ai.useAiReply) {
                    return false;
                }

                const lastMessage = await this.getLastFriendMessageText();
                if (!lastMessage) return false;

                const today = new Date().toISOString().split('T')[0];
                if (state.ai.lastAiDate !== today) {
                    state.ai.replyCount = 0;
                    state.ai.lastAiDate = today;
                    StatePersistence.saveState();
                }

                const maxReplies = state.user.isPremiumUser ? 25 : 10;
                if (state.ai.replyCount >= maxReplies) {
                    this.log(`今天AI回复次数已达上限，充值获取更多`);
                    return false;
                }

                const aiReplyText = await this.requestAi(lastMessage);
                if (!aiReplyText) return false;

                this.log(`AI回复: ${aiReplyText.slice(0, 30)}...`);
                state.ai.replyCount++;
                StatePersistence.saveState();

                const inputBox = await this.waitForElement('#chat-input');
                if (!inputBox) return false;

                inputBox.textContent = '';
                inputBox.focus();
                document.execCommand('insertText', false, aiReplyText);
                await this.delay(this.operationInterval / 10);

                const sendButton = document.querySelector('.btn-send');
                if (sendButton) {
                    await this.simulateClick(sendButton);
                } else {
                    const enterKeyEvent = new KeyboardEvent('keydown', {
                        key: 'Enter', keyCode: 13, code: 'Enter', which: 13, bubbles: true
                    });
                    inputBox.dispatchEvent(enterKeyEvent);
                }

                return true;
            } catch (error) {
                this.log(`AI回复出错: ${error.message}`);
                return false;
            }
        },

        async requestAi(message) {
            const authToken = (function () {
                const c = [0x73, 0x64, 0x56, 0x45, 0x44, 0x41, 0x42, 0x6a, 0x5a, 0x65, 0x49, 0x6b, 0x77,
                    0x58, 0x4e, 0x42, 0x46, 0x4e, 0x42, 0x73, 0x3a, 0x43, 0x71, 0x4d, 0x58, 0x6a,
                    0x71, 0x65, 0x50, 0x56, 0x43, 0x4a, 0x62, 0x55, 0x59, 0x4a, 0x50, 0x63, 0x69, 0x70, 0x4a
                ];
                return c.map(d => String.fromCharCode(d)).join('');
            })();

            const apiUrl = (function () {
                const e = '68747470733a2f2f737061726b2d6170692d6f70656e2e78662d79756e2e636f6d2f76312f636861742f636f6d706c6574696f6e73';
                return e.replace(/../g, f => String.fromCharCode(parseInt(f, 16)));
            })();

            const requestBody = {
                model: 'lite',
                messages: [
                    { role: 'system', content: localStorage.getItem('aiRole') || '你是有经验的求职者，你会用口语化的表达（如“行”、“呃”）和语气词（如“啊”、“吗”）使对话自然。你回复对方很肯定且言简意赅，不会发送段落和长句子。' },
                    { role: 'user', content: message }
                ],
                temperature: 0.9, top_p: 0.8, max_tokens: 512
            };

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST', url: apiUrl,
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
                    data: JSON.stringify(requestBody),
                    onload: (response) => {
                        try {
                            const result = JSON.parse(response.responseText);
                            if (result.code !== 0) throw new Error('API错误: ' + result.message + '（Code: ' + result.code + '）');
                            resolve(result.choices[0].message.content.trim());
                        } catch (error) {
                            reject(new Error('响应解析失败: ' + error.message + '\n原始响应: ' + response.responseText));
                        }
                    },
                    onerror: (error) => reject(new Error('网络请求失败: ' + error))
                });
            });
        },

        async getLastFriendMessageText() {
            try {
                const chatContainer = document.querySelector('.chat-message .im-list');
                if (!chatContainer) return null;

                const friendMessages = Array.from(chatContainer.querySelectorAll('li.message-item.item-friend'));
                if (friendMessages.length === 0) return null;

                const lastMessageEl = friendMessages[friendMessages.length - 1];
                const textEl = lastMessageEl.querySelector('.text span');
                return textEl?.textContent?.trim() || null;
            } catch (error) {
                this.log(`获取消息出错: ${error.message}`);
                return null;
            }
        },

        async simulateClick(element) {
            if (!element) return;

            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            const dispatchMouseEvent = (type, options = {}) => {
                const event = new MouseEvent(type, {
                    bubbles: true, cancelable: true, view: document.defaultView, clientX: x, clientY: y, ...options
                });
                element.dispatchEvent(event);
            };

            dispatchMouseEvent('mouseover'); await this.delay(30);
            dispatchMouseEvent('mousemove'); await this.delay(30);
            dispatchMouseEvent('mousedown', { button: 0 }); await this.delay(30);
            dispatchMouseEvent('mouseup', { button: 0 }); await this.delay(30);
            dispatchMouseEvent('click', { button: 0 });
        },

        async waitForElement(selectorOrFunction, timeout = 5000) {
            return new Promise((resolve) => {
                let element;
                if (typeof selectorOrFunction === 'function') element = selectorOrFunction();
                else element = document.querySelector(selectorOrFunction);

                if (element) return resolve(element);

                const timeoutId = setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
                const observer = new MutationObserver(() => {
                    if (typeof selectorOrFunction === 'function') element = selectorOrFunction();
                    else element = document.querySelector(selectorOrFunction);
                    if (element) { clearTimeout(timeoutId); observer.disconnect(); resolve(element); }
                });
                observer.observe(document.body, { childList: true, subtree: true });
            });
        },

        async delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); },

        resetCycle() {
            toggleProcess();
            this.log('所有岗位沟通完成，恭喜您即将找到理想工作！');
            state.currentIndex = 0;
            state.operation.lastMessageTime = 0;
        },

        log(message) {
            const logEntry = `[${new Date().toLocaleTimeString()}] ${message}`;
            const logPanel = document.querySelector('#pro-log');
            if (logPanel) {
                const logItem = document.createElement('div');
                logItem.className = 'log-item';
                logItem.textContent = logEntry;
                logPanel.appendChild(logItem);
                logPanel.scrollTop = logPanel.scrollHeight;
            }
        }
    };

    // 工具函数 utils.js
    function toggleProcess() {
        state.isRunning = !state.isRunning;

        if (state.isRunning) {
            // 获取职位名包含和排除的关键词
            state.includeKeywords = elements.includeInput.value.trim().toLowerCase().split(',').filter(keyword => keyword.trim() !== '');
            state.excludeKeywords = elements.excludeInput.value.trim().toLowerCase().split(',').filter(keyword => keyword.trim() !== '');

            elements.controlBtn.textContent = '停止海投';
            elements.controlBtn.style.background = `linear-gradient(45deg, ${CONFIG.COLORS.SECONDARY}, #f44336)`;

            const startTime = new Date();
            Core.log(`开始自动海投，时间：${startTime.toLocaleTimeString()}`);
            Core.log(`职位名筛选：包含【${state.includeKeywords.join('、') || '无'}】，排除【${state.excludeKeywords.join('、') || '无'}】`);

            Core.startProcessing();
        } else {
            elements.controlBtn.textContent = '启动海投';
            elements.controlBtn.style.background = `linear-gradient(45deg, ${CONFIG.COLORS.PRIMARY}, #4db6ac)`;

            state.isRunning = false;

            const stopTime = new Date();
            Core.log(`停止自动海投，时间：${stopTime.toLocaleTimeString()}`);
            Core.log(`本次共沟通 ${state.currentIndex} 个岗位`);

            state.currentIndex = 0;
        }
    }

    function toggleChatProcess() {
        state.isRunning = !state.isRunning;

        if (state.isRunning) {
            elements.controlBtn.textContent = '停止智能聊天';
            elements.controlBtn.style.background = `linear-gradient(45deg, ${CONFIG.COLORS.SECONDARY}, #f44336)`;

            const startTime = new Date();
            Core.log(`开始智能聊天，时间：${startTime.toLocaleTimeString()}`);

            Core.startProcessing();
        } else {
            elements.controlBtn.textContent = '开始智能聊天';
            elements.controlBtn.style.background = `linear-gradient(45deg, ${CONFIG.COLORS.PRIMARY}, #4db6ac)`;

            // 停止处理
            state.isRunning = false;

            // 断开消息监听
            if (Core.messageObserver) {
                Core.messageObserver.disconnect();
                Core.messageObserver = null;
            }

            const stopTime = new Date();
            Core.log(`停止智能聊天，时间：${stopTime.toLocaleTimeString()}`);
        }
    }

    function showCustomAlert(message) {
        const overlay = document.createElement('div');
        overlay.id = 'custom-alert-overlay';
        overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        backdrop-filter: blur(3px);
        animation: fadeIn 0.3s ease-out;
    `;

        const dialog = document.createElement('div');
        dialog.id = 'custom-alert-dialog';
        dialog.style.cssText = `
        background: white;
        border-radius: 16px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        width: 90%;
        max-width: 400px;
        overflow: hidden;
        transform: scale(0.95);
        animation: scaleIn 0.3s ease-out forwards;
    `;

        const header = document.createElement('div');
        header.style.cssText = `
        padding: 16px 24px;
        background: ${CONFIG.COLORS.PRIMARY};
        color: white;
        font-size: 18px;
        font-weight: 500;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
        header.innerHTML = `<span>BOSS海投助手</span><i class="fa fa-info-circle ml-2"></i>`;

        const content = document.createElement('div');
        content.style.cssText = `
        padding: 24px;
        font-size: 16px;
        line-height: 1.8;
        color: #333;
    `;
        content.innerHTML = message.replace(/\n/g, '<br>');

        const footer = document.createElement('div');
        footer.style.cssText = `
        padding: 12px 24px;
        display: flex;
        justify-content: center;
        border-top: 1px solid #eee;
    `;

        const confirmBtn = document.createElement('button');
        confirmBtn.style.cssText = `
        background: ${CONFIG.COLORS.PRIMARY};
        color: white;
        border: none;
        border-radius: 8px;
        padding: 10px 24px;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.3s;
        box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4);
    `;
        confirmBtn.textContent = '确定';

        confirmBtn.addEventListener('click', () => {
            overlay.remove();
        });

        confirmBtn.addEventListener('mouseenter', () => {
            confirmBtn.style.transform = 'translateY(-2px)';
            confirmBtn.style.boxShadow = '0 6px 16px rgba(33, 150, 243, 0.5)';
        });

        confirmBtn.addEventListener('mouseleave', () => {
            confirmBtn.style.transform = 'translateY(0)';
            confirmBtn.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.4)';
        });

        footer.appendChild(confirmBtn);

        dialog.appendChild(header);
        dialog.appendChild(content);
        dialog.appendChild(footer);

        overlay.appendChild(dialog);

        document.body.appendChild(overlay);

        const style = document.createElement('style');
        style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes scaleIn {
            from {
                transform: scale(0.95);
                opacity: 0;
            }
            to {
                transform: scale(1);
                opacity: 1;
            }
        }
    `;
        document.head.appendChild(style);
    }

    function showConfirmDialog(message, confirmCallback, cancelCallback) {
        const overlay = document.createElement('div');
        overlay.id = 'custom-confirm-overlay';
        overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        backdrop-filter: blur(3px);
        animation: fadeIn 0.3s ease-out;
    `;

        const dialog = document.createElement('div');
        dialog.id = 'custom-confirm-dialog';
        dialog.style.cssText = `
        background: white;
        border-radius: 16px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        width: 90%;
        max-width: 400px;
        overflow: hidden;
        transform: scale(0.95);
        animation: scaleIn 0.3s ease-out forwards;
    `;

        const header = document.createElement('div');
        header.style.cssText = `
        padding: 16px 24px;
        background: ${CONFIG.COLORS.PRIMARY};
        color: white;
        font-size: 18px;
        font-weight: 500;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
        header.innerHTML = `<span>BOSS海投助手</span><i class="fa fa-question-circle ml-2"></i>`;

        const content = document.createElement('div');
        content.style.cssText = `
        padding: 24px;
        font-size: 16px;
        line-height: 1.8;
        color: #333;
    `;
        content.textContent = message;

        const buttonArea = document.createElement('div');
        buttonArea.style.cssText = `
        padding: 12px 24px;
        display: flex;
        justify-content: space-around;
        border-top: 1px solid #eee;
    `;

        const confirmBtn = document.createElement('button');
        confirmBtn.style.cssText = `
        background: ${CONFIG.COLORS.PRIMARY};
        color: white;
        border: none;
        border-radius: 8px;
        padding: 10px 24px;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.3s;
        box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4);
    `;
        confirmBtn.textContent = '确认';

        confirmBtn.addEventListener('click', () => {
            if (typeof confirmCallback === 'function') {
                confirmCallback();
            }
            overlay.remove();
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.style.cssText = `
        background: #f0f0f0;
        color: #666;
        border: none;
        border-radius: 8px;
        padding: 10px 24px;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.3s;
    `;
        cancelBtn.textContent = '取消';

        cancelBtn.addEventListener('click', () => {
            if (typeof cancelCallback === 'function') {
                cancelCallback();
            }
            overlay.remove();
        });

        buttonArea.appendChild(cancelBtn);
        buttonArea.appendChild(confirmBtn);

        dialog.appendChild(header);
        dialog.appendChild(content);
        dialog.appendChild(buttonArea);

        overlay.appendChild(dialog);

        document.body.appendChild(overlay);

        const style = document.createElement('style');
        style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes scaleIn {
            from {
                transform: scale(0.95);
                opacity: 0;
            }
            to {
                transform: scale(1);
                opacity: 1;
            }
        }
    `;
        document.head.appendChild(style);
    }

    function showProgress(message, progress) {
        let progressContainer = document.getElementById('progress-container');
        let progressBar = document.getElementById('progress-bar');
        let progressText = document.getElementById('progress-text');

        if (!progressContainer) {
            progressContainer = document.createElement('div');
            progressContainer.id = 'progress-container';
            progressContainer.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            padding: 24px;
            width: 90%;
            max-width: 400px;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            gap: 16px;
        `;

            progressText = document.createElement('div');
            progressText.id = 'progress-text';
            progressText.style.cssText = `
            font-size: 16px;
            color: #333;
            text-align: center;
        `;

            const progressBackground = document.createElement('div');
            progressBackground.style.cssText = `
            height: 12px;
            background: #f0f0f0;
            border-radius: 6px;
            overflow: hidden;
        `;

            progressBar = document.createElement('div');
            progressBar.id = 'progress-bar';
            progressBar.style.cssText = `
            height: 100%;
            background: linear-gradient(90deg, ${CONFIG.COLORS.PRIMARY}, #4db6ac);
            border-radius: 6px;
            transition: width 0.3s ease;
            width: 0%;
        `;

            progressBackground.appendChild(progressBar);
            progressContainer.appendChild(progressText);
            progressContainer.appendChild(progressBackground);

            document.body.appendChild(progressContainer);
        }

        progressText.textContent = message;
        progressBar.style.width = `${progress}%`;

        if (progress >= 100) {
            setTimeout(() => {
                if (progressContainer && progressContainer.parentNode) {
                    progressContainer.parentNode.removeChild(progressContainer);
                }
            }, 1000);
        }
    }

    const letter = {
        showLetterToUser: function () {
            const COLORS = {
                primary: '#4285f4',
                primaryDark: '#1967d2',
                accent: '#e8f0fe',
                text: '#333',
                textLight: '#666',
                background: '#f8f9fa'
            };

            const overlay = document.createElement('div');
            overlay.id = 'letter-overlay';
            overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            backdrop-filter: blur(5px);
            animation: fadeIn 0.3s ease-out;
        `;

            const envelopeContainer = document.createElement('div');
            envelopeContainer.id = 'envelope-container';
            envelopeContainer.style.cssText = `
            position: relative;
            width: 90%;
            max-width: 650px;
            height: 400px;
            perspective: 1000px;
        `;

            const envelope = document.createElement('div');
            envelope.id = 'envelope';
            envelope.style.cssText = `
            position: absolute;
            width: 100%;
            height: 100%;
            transform-style: preserve-3d;
            transition: transform 0.6s ease;
        `;

            const envelopeBack = document.createElement('div');
            envelopeBack.id = 'envelope-back';
            envelopeBack.style.cssText = `
            position: absolute;
            width: 100%;
            height: 100%;
            background: ${COLORS.background};
            border-radius: 10px;
            box-shadow: 0 15px 35px rgba(0,0,0,0.2);
            backface-visibility: hidden;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 30px;
            cursor: pointer;
            transition: all 0.3s;
        `;
            envelopeBack.innerHTML = `
            <div style="font-size:clamp(1.5rem, 3vw, 1.8rem);font-weight:600;color:${COLORS.primary};margin-bottom:10px;">
                <i class="fa fa-envelope-o mr-2"></i>致海投用户的一封信
            </div>
            <div style="font-size:clamp(1rem, 2vw, 1.1rem);color:${COLORS.textLight};text-align:center;">
                点击开启高效求职之旅
            </div>
            <div style="position:absolute;bottom:20px;font-size:0.85rem;color:#999;">
                © 2025 BOSS海投助手 | Yangshengzhou 版权所有
            </div>
        `;

            envelopeBack.addEventListener('click', () => {
                envelope.style.transform = 'rotateY(180deg)';
                setTimeout(() => {
                    const content = document.getElementById('letter-content');
                    if (content) {
                        content.style.display = 'block';
                        content.style.animation = 'fadeInUp 0.5s ease-out forwards';
                    }
                }, 300);
            });

            const envelopeFront = document.createElement('div');
            envelopeFront.id = 'envelope-front';
            envelopeFront.style.cssText = `
            position: absolute;
            width: 100%;
            height: 100%;
            background: #fff;
            border-radius: 10px;
            box-shadow: 0 15px 35px rgba(0,0,0,0.2);
            transform: rotateY(180deg);
            backface-visibility: hidden;
            display: flex;
            flex-direction: column;
        `;

            const titleBar = document.createElement('div');
            titleBar.style.cssText = `
            padding: 20px 30px;
            background: linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark});
            color: white;
            font-size: clamp(1.2rem, 2.5vw, 1.4rem);
            font-weight: 600;
            border-radius: 10px 10px 0 0;
            display: flex;
            align-items: center;
        `;
            titleBar.innerHTML = `<i class="fa fa-envelope-open-o mr-2"></i>致海投助手用户：`;

            const letterContent = document.createElement('div');
            letterContent.id = 'letter-content';
            letterContent.style.cssText = `
            flex: 1;
            padding: 25px 30px;
            overflow-y: auto;
            font-size: clamp(0.95rem, 2vw, 1.05rem);
            line-height: 1.8;
            color: ${COLORS.text};
            background: url('https://picsum.photos/id/1068/1000/1000') center / cover no-repeat;
            background-blend-mode: overlay;
            background-color: rgba(255,255,255,0.95);
            display: none;
        `;
            letterContent.innerHTML = `
            <div style="margin-bottom:20px;">
                <p>你好，未来的成功人士：</p>
                <p class="mt-2">&emsp;&emsp;展信如晤。</p>
                <p class="mt-3">
                    &emsp;&emsp;我是Yangshengzhou，我曾经和你一样在求职路上反复碰壁。
                    简历石沉大海、面试邀约寥寥、沟通效率低下...于是我做了这个小工具。
                </p>
                <p class="mt-3">
                    &emsp;&emsp;现在，我将它分享给你，希望能够帮到你：
                </p>
                <ul class="mt-3 ml-6 list-disc" style="text-indent:0;">
                    <li><strong>&emsp;&emsp;自动沟通页面岗位</strong>，一键打招呼</li>
                    <li><strong>&emsp;&emsp;AI智能回复HR提问</strong>，24小时在线不错过任何机会</li>
                    <li><strong>&emsp;&emsp;个性化沟通策略</strong>，大幅提升面试邀约率</li>
                </ul>
                <p class="mt-3">
                    &emsp;&emsp;工具只是辅助，你的能力才是核心竞争力。
                    愿它成为你求职路上的得力助手，助你斩获Offer！
                </p>
                <p class="mt-2">
                    &emsp;&emsp;冀以尘雾之微补益山海，荧烛末光增辉日月。
                </p>
                <p class="mt-2">
                    &emsp;&emsp;如果插件对你有帮助，请给她点个 Star🌟！
                </p>
            </div>
            <div style="text-align:right;font-style:italic;color:${COLORS.textLight};text-indent:0;">
                Yangshengzhou<br>
                2025年6月于南昌
            </div>
        `;

            const buttonArea = document.createElement('div');
            buttonArea.style.cssText = `
            padding: 15px 30px;
            display: flex;
            justify-content: center;
            border-top: 1px solid #eee;
            background: ${COLORS.background};
            border-radius: 0 0 10px 10px;
        `;

            const startButton = document.createElement('button');
            startButton.style.cssText = `
            background: linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark});
            color: white;
            border: none;
            border-radius: 8px;
            padding: 12px 30px;
            font-size: clamp(1rem, 2vw, 1.1rem);
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s;
            box-shadow: 0 6px 16px rgba(66, 133, 244, 0.3);
            outline: none;
            display: flex;
            align-items: center;
        `;
            startButton.innerHTML = `<i class="fa fa-rocket mr-2"></i>开始使用`;

            startButton.addEventListener('click', () => {
                envelopeContainer.style.animation = 'scaleOut 0.3s ease-in forwards';
                overlay.style.animation = 'fadeOut 0.3s ease-in forwards';
                setTimeout(() => {
                    // 移除遮罩层
                    if (overlay.parentNode === document.body) {
                        document.body.removeChild(overlay);
                    }
                    // 点完信后跳转网页
                    //     window.open('https://qun.qq.com/universal-share/share?ac=1&authKey=wjyQkU9iG7wc%2BsIEOWFE6cA0ayLLBdYwpMsKYveyufXSOE5FBe7bb9xxvuNYVsEn&busi_data=eyJncm91cENvZGUiOiIxMDIxNDcxODEzIiwidG9rZW4iOiJDaFYxYVpySU9FUVJrRzkwdUZ2QlFVUTQzZzV2VS83TE9mY0NNREluaUZCR05YcnNjWmpKU2V5Q2FYTllFVlJMIiwidWluIjoiMzU1NTg0NDY3OSJ9&data=M7fVC3YlI68T2S2VpmsR20t9s_xJj6HNpF0GGk2ImSQ9iCE8fZomQgrn_ADRZF0Ee4OSY0x6k2tI5P47NlkWug&svctype=4&tempid=h5_group_info', '_blank');
                    // }, 300);
                    window.open('https://gitee.com/Yangshengzhou', '_blank');
                }, 300);
            });

            buttonArea.appendChild(startButton);
            envelopeFront.appendChild(titleBar);
            envelopeFront.appendChild(letterContent);
            envelopeFront.appendChild(buttonArea);
            envelope.appendChild(envelopeBack);
            envelope.appendChild(envelopeFront);
            envelopeContainer.appendChild(envelope);
            overlay.appendChild(envelopeContainer);
            document.body.appendChild(overlay);

            const style = document.createElement('style');
            style.textContent = `
            @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes fadeOut { from { opacity: 1 } to { opacity: 0 } }
            @keyframes scaleOut { from { transform: scale(1); opacity: 1 } to { transform: scale(.9); opacity: 0 } }
            @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }

            #envelope-back:hover { transform: translateY(-5px); box-shadow: 0 20px 40px rgba(0,0,0,0.25); }
            #envelope-front button:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(66, 133, 244, 0.4); }
            #envelope-front button:active { transform: translateY(1px); }

            @media (max-width: 480px) {
                #envelope-container { height: 350px; }
                #letter-content { font-size: 0.9rem; padding: 15px; }
            }
        `;
            document.head.appendChild(style);
        }
    };

    const guide = {
        steps: [
            {
                target: 'div.city-label.active',
                content: '👋 海投前，先在BOSS<span class="highlight">筛选出岗位</span>！\n\n助手会先滚动收集界面上显示的岗位，\n随后依次进行沟通~',
                highlightColor: '#4285f4', // 主蓝色
                arrowPosition: 'bottom',
                defaultPosition: { left: '50%', top: '20%', transform: 'translateX(-50%)' }
            },
            {
                target: 'a[ka="header-jobs"]',
                content: '🚀 <span class="highlight">职位页操作流程</span>：\n\n1️⃣ 扫描职位卡片\n2️⃣ 检查并"立即沟通"（需开启“自动打招呼”）\n3️⃣ 留在当前页，继续沟通下一个职位\n\n全程无需手动干预，高效投递！',
                highlightColor: '#3367d6', // 主蓝加深10%
                arrowPosition: 'bottom',
                defaultPosition: { left: '25%', top: '80px' }
            },
            {
                target: 'a[ka="header-message"]',
                content: '💬 进入<span class="highlight">聊天界面</span>！\n\n助手会进行：\n✅ 发送常用语和发送图片简历\n✅ 尝试发送您的简历附件\n\n让沟通更加轻松高效！',
                highlightColor: '#2a56c6', // 主蓝加深15%
                arrowPosition: 'left',
                defaultPosition: { right: '150px', top: '100px' }
            },
            {
                target: 'div.logo',
                content: '🤖 <span class="highlight">聊天页智能处理逻辑</span>：\n\n🆕 新沟通：自动发送自我介绍+简历\n💬 已有回复：AI生成个性化回复\n\n您只需专注面试！',
                highlightColor: '#1a73e8', // 主蓝加深20%
                arrowPosition: 'right',
                defaultPosition: { left: '200px', top: '20px' }
            },
            {
                target: 'div.logo',
                content: '❗ <span class="highlight">特别注意</span>：\n\n1. <span class="warning">BOSS直聘每日打招呼上限为150次</span>\n2. 聊天页仅处理当前最上方最新对话\n3. 打招呼后对方显示在聊天页\n4. <span class="warning">投递操作过于频繁有封号风险</span>',
                highlightColor: '#0d47a1', // 主蓝加深30%
                arrowPosition: 'bottom',
                defaultPosition: { left: '50px', top: '80px' }
            }
        ],
        currentStep: 0,
        guideElement: null,
        overlay: null,
        highlightElements: [],
        chatUrl: 'https://www.zhipin.com/web/geek/chat', // 聊天页面URL

        showGuideToUser() {
            // 创建遮罩层
            this.overlay = document.createElement('div');
            this.overlay.id = 'guide-overlay';
            this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(2px);
            z-index: 99997;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
            document.body.appendChild(this.overlay);

            // 创建引导卡片
            this.guideElement = document.createElement('div');
            this.guideElement.id = 'guide-tooltip';
            this.guideElement.style.cssText = `
            position: fixed;
            z-index: 99999;
            width: 320px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            overflow: hidden;
            opacity: 0;
            transform: translateY(10px);
            transition: opacity 0.3s ease, transform 0.3s ease;
        `;
            document.body.appendChild(this.guideElement);

            // 显示遮罩层
            setTimeout(() => {
                this.overlay.style.opacity = '1';

                // 延迟显示第一步，增强视觉层次感
                setTimeout(() => {
                    this.showStep(0);
                }, 300);
            }, 100);
        },

        showStep(stepIndex) {
            const step = this.steps[stepIndex];
            if (!step) return;

            this.clearHighlights();
            const target = document.querySelector(step.target);

            if (target) {
                // 创建高亮区域
                const rect = target.getBoundingClientRect();
                const highlight = document.createElement('div');
                highlight.className = 'guide-highlight';
                highlight.style.cssText = `
                position: fixed;
                top: ${rect.top}px;
                left: ${rect.left}px;
                width: ${rect.width}px;
                height: ${rect.height}px;
                background: ${step.highlightColor || '#4285f4'};
                opacity: 0.2;
                border-radius: 4px;
                z-index: 99998;
                box-shadow: 0 0 0 4px ${step.highlightColor || '#4285f4'};
                animation: guide-pulse 2s infinite;
            `;
                document.body.appendChild(highlight);
                this.highlightElements.push(highlight);

                // 计算提示框位置（基于目标元素）
                this.setGuidePositionFromTarget(step, rect);
            } else {
                console.warn('引导目标元素未找到，使用默认位置:', step.target);
                // 使用默认位置显示提示框
                this.setGuidePositionFromDefault(step);
            }

            // 设置引导提示框内容
            let buttonsHtml = '';

            // 根据是否为最后一步生成不同的按钮
            if (stepIndex === this.steps.length - 1) {
                // 最后一步：只显示"完成"按钮，居中对齐
                buttonsHtml = `
                <div class="guide-buttons" style="display: flex; justify-content: center; padding: 16px; border-top: 1px solid #f0f0f0; background: #f9fafb;">
                    <button id="guide-finish-btn" style="padding: 8px 32px; background: ${step.highlightColor || '#4285f4'}; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);">
                        完成
                    </button>
                </div>
            `;
            } else {
                // 非最后一步：显示"下一步"和"跳过"按钮
                buttonsHtml = `
                <div class="guide-buttons" style="display: flex; justify-content: flex-end; padding: 16px; border-top: 1px solid #f0f0f0; background: #f9fafb;">
                    <button id="guide-skip-btn" style="padding: 8px 16px; background: white; color: #4b5563; border: 1px solid #e5e7eb; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease;">跳过</button>
                    <button id="guide-next-btn" style="padding: 8px 16px; background: ${step.highlightColor || '#4285f4'}; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; margin-left: 8px; transition: all 0.2s ease; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);">下一步</button>
                </div>
            `;
            }

            // 使用<div>替代<pre>，支持HTML标签
            this.guideElement.innerHTML = `
            <div class="guide-header" style="padding: 16px; background: ${step.highlightColor || '#4285f4'}; color: white;">
                <div class="guide-title" style="font-size: 16px; font-weight: 600;">海投助手引导</div>
                <div class="guide-step" style="font-size: 12px; opacity: 0.8; margin-top: 2px;">步骤 ${stepIndex + 1}/${this.steps.length}</div>
            </div>
            <div class="guide-content" style="padding: 20px; font-size: 14px; line-height: 1.6;">
                <div style="white-space: pre-wrap; font-family: inherit; margin: 0;">${step.content}</div>
            </div>
            ${buttonsHtml}
        `;

            // 重新绑定按钮事件
            if (stepIndex === this.steps.length - 1) {
                // 最后一步：绑定完成按钮
                document.getElementById('guide-finish-btn').addEventListener('click', () => this.endGuide(true));
            } else {
                // 非最后一步：绑定下一步和跳过按钮
                document.getElementById('guide-next-btn').addEventListener('click', () => this.nextStep());
                document.getElementById('guide-skip-btn').addEventListener('click', () => this.endGuide());
            }

            // 添加按钮悬停效果
            if (stepIndex === this.steps.length - 1) {
                const finishBtn = document.getElementById('guide-finish-btn');
                finishBtn.addEventListener('mouseenter', () => {
                    finishBtn.style.background = this.darkenColor(step.highlightColor || '#4285f4', 15);
                    finishBtn.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                });
                finishBtn.addEventListener('mouseleave', () => {
                    finishBtn.style.background = step.highlightColor || '#4285f4';
                    finishBtn.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)';
                });
            } else {
                const nextBtn = document.getElementById('guide-next-btn');
                const skipBtn = document.getElementById('guide-skip-btn');

                nextBtn.addEventListener('mouseenter', () => {
                    nextBtn.style.background = this.darkenColor(step.highlightColor || '#4285f4', 15);
                    nextBtn.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                });
                nextBtn.addEventListener('mouseleave', () => {
                    nextBtn.style.background = step.highlightColor || '#4285f4';
                    nextBtn.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)';
                });

                skipBtn.addEventListener('mouseenter', () => {
                    skipBtn.style.background = '#f3f4f6';
                });
                skipBtn.addEventListener('mouseleave', () => {
                    skipBtn.style.background = 'white';
                });
            }

            // 显示提示框
            this.guideElement.style.opacity = '1';
            this.guideElement.style.transform = 'translateY(0)';
        },

        // 根据目标元素计算提示框位置
        setGuidePositionFromTarget(step, rect) {
            let left, top;
            const guideWidth = 320;
            const guideHeight = 240;

            // 根据箭头方向调整位置
            switch (step.arrowPosition) {
                case 'top':
                    left = rect.left + rect.width / 2 - guideWidth / 2;
                    top = rect.top - guideHeight - 20;
                    break;
                case 'bottom':
                    left = rect.left + rect.width / 2 - guideWidth / 2;
                    top = rect.bottom + 20;
                    break;
                case 'left':
                    left = rect.left - guideWidth - 20;
                    top = rect.top + rect.height / 2 - guideHeight / 2;
                    break;
                case 'right':
                    left = rect.right + 20;
                    top = rect.top + rect.height / 2 - guideHeight / 2;
                    break;
                default:
                    left = rect.right + 20;
                    top = rect.top;
            }

            // 确保提示框不超出屏幕
            left = Math.max(10, Math.min(left, window.innerWidth - guideWidth - 10));
            top = Math.max(10, Math.min(top, window.innerHeight - guideHeight - 10));

            // 设置位置
            this.guideElement.style.left = `${left}px`;
            this.guideElement.style.top = `${top}px`;
            this.guideElement.style.transform = 'translateY(0)';
        },

        // 使用默认位置显示提示框
        setGuidePositionFromDefault(step) {
            const position = step.defaultPosition || { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

            // 应用默认位置样式
            Object.assign(this.guideElement.style, {
                left: position.left,
                top: position.top,
                right: position.right || 'auto',
                bottom: position.bottom || 'auto',
                transform: position.transform || 'none'
            });
        },

        nextStep() {
            // 清除当前步骤的事件监听
            const currentStep = this.steps[this.currentStep];
            if (currentStep) {
                const target = document.querySelector(currentStep.target);
                if (target) {
                    target.removeEventListener('click', this.nextStep);
                }
            }

            this.currentStep++;
            if (this.currentStep < this.steps.length) {
                // 隐藏当前提示框，显示下一步
                this.guideElement.style.opacity = '0';
                this.guideElement.style.transform = 'translateY(10px)';

                setTimeout(() => {
                    this.showStep(this.currentStep);
                }, 300);
            } else {
                this.endGuide(true); // 传递true表示引导已完成
            }
        },

        clearHighlights() {
            this.highlightElements.forEach(el => el.remove());
            this.highlightElements = [];
        },

        endGuide(isCompleted = false) {
            // 清除高亮和事件
            this.clearHighlights();

            // 淡出提示框和遮罩
            this.guideElement.style.opacity = '0';
            this.guideElement.style.transform = 'translateY(10px)';
            this.overlay.style.opacity = '0';

            // 延迟移除元素
            setTimeout(() => {
                if (this.overlay && this.overlay.parentNode) {
                    this.overlay.parentNode.removeChild(this.overlay);
                }
                if (this.guideElement && this.guideElement.parentNode) {
                    this.guideElement.parentNode.removeChild(this.guideElement);
                }

                // 当引导完成时打开聊天页面
                if (isCompleted && this.chatUrl) {
                    window。open(this.chatUrl, '_blank');
                }
            }, 300);

            // 触发引导结束事件
            document.dispatchEvent(new Event('guideEnd'));
        },

        // 辅助函数：颜色加深
        darkenColor(color, percent) {
            let R = parseInt(color.substring(1, 3), 16);
            let G = parseInt(color.substring(3, 5), 16);
            let B = parseInt(color.substring(5, 7), 16);

            R = parseInt(R * (100 - percent) / 100);
            G = parseInt(G * (100 - percent) / 100);
            B = parseInt(B * (100 - percent) / 100);

            R = (R < 255) ? R : 255;
            G = (G < 255) ? G : 255;
            B = (B < 255) ? B : 255;

            R = Math.round(R);
            G = Math.round(G);
            B = Math.round(B);

            const RR = ((R.toString(16).length === 1) ? "0" + R.toString(16) : R.toString(16));
            const GG = ((G.toString(16).length === 1) ? "0" + G.toString(16) : G.toString(16));
            const BB = ((B.toString(16).length === 1) ? "0" + B.toString(16) : B.toString(16));

            return `#${RR}${GG}${BB}`;
        }
    };

    // 添加脉冲动画样式和高亮样式
    const style = document.createElement('style');
    style.textContent = `
    @keyframes guide-pulse {
        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(66, 133, 244, 0.4); }
        70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(66, 133, 244, 0); }
        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(66, 133, 244, 0); }
    }

    .guide-content .highlight {
        font-weight: 700;
        color: #1a73e8;
    }

    .guide-content .warning {
        font-weight: 700;
        color: #d93025;
    }
`;
    document.head.appendChild(style);

    const STORAGE = {
        LETTER: 'letterLastShown',
        GUIDE: 'shouldShowGuide',
        AI_COUNT: 'aiReplyCount',
        AI_DATE: 'lastAiDate'
    };

    function getToday() {
        return new Date().toISOString().split('T')[0];
    }

    function init() {
        try {
            const midnight = new Date();
            midnight.setDate(midnight.getDate() + 1);
            midnight.setHours(0, 0, 0, 0);
            setTimeout(() => {
                localStorage.removeItem(STORAGE.AI_COUNT);
                localStorage.removeItem(STORAGE.AI_DATE);
                localStorage.removeItem(STORAGE.LETTER);
            }, midnight - Date.now());
            UI.init();
            document.body.style.position = 'relative';
            const today = getToday();
            if (location.pathname.includes('/jobs')) {
                if (localStorage.getItem(STORAGE.LETTER) !== today) {
                    letter.showLetterToUser();
                    localStorage.setItem(STORAGE.LETTER, today);
                } else if (localStorage.getItem(STORAGE.GUIDE) !== 'true') {
                    guide.showGuideToUser();
                    localStorage.setItem(STORAGE.GUIDE, 'true');
                }
                Core.log('欢迎使用海投助手，我将自动投递岗位！');
            } else if (location.pathname.includes('/chat')) {
                Core。log('欢迎使用海投助手，我将自动发送简历！');
            }
        } catch (error) {
            console.error('初始化失败:', error);
            if (UI.notify) UI.notify('初始化失败', 'error');
        }
    }

    window.addEventListener('load', init);
})();

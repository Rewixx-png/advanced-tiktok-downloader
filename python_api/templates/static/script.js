document.addEventListener('DOMContentLoaded', () => {
    // --- Элементы DOM ---
    const bgVideo = document.getElementById('bg-video');
    const playerElement = document.getElementById('player');
    const permissionBanner = document.getElementById('permission-banner');
    const allowAudioBtn = document.getElementById('allow-audio-btn');
    const playerBanner = document.getElementById('player-banner');
    const closePlayerBtn = document.getElementById('close-player-btn');
    const toggleBlurBtn = document.getElementById('toggle-blur-btn');
    const toggleWaterBtn = document.getElementById('toggle-water-btn');
    const showPlayerBtn = document.getElementById('show-player-btn');
    const copyLinkBtn = document.querySelector('.copy-btn');
    const toggleFitBtn = document.getElementById('toggle-fit-btn'); 

    // [ИСПРАВЛЕНО] Возвращаем 'settings' в список элементов управления
    const player = new Plyr(playerElement, { 
        controls: ['play', 'progress', 'current-time', 'volume', 'settings'] 
    });

    // --- Состояние и аудио контекст ---
    let isBlurEnabled = true;
    let isWaterEffectEnabled = true;
    let audioContext, bgVideoSource, bgVideoGain, playerSource, playerGain, underwaterFilter;
    let pauseTimeout = null;
    let isAudioReady = false;

    // --- Функции аудио ---
    function setupAudioContext() {
        if (isAudioReady) return;
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        bgVideoSource = audioContext.createMediaElementSource(bgVideo);
        bgVideoGain = audioContext.createGain();
        underwaterFilter = audioContext.createBiquadFilter();
        underwaterFilter.type = 'lowpass';
        underwaterFilter.frequency.value = 400;
        bgVideoSource.connect(underwaterFilter).connect(bgVideoGain).connect(audioContext.destination);

        playerSource = audioContext.createMediaElementSource(playerElement);
        playerGain = audioContext.createGain();
        playerSource.connect(playerGain).connect(audioContext.destination);

        bgVideo.volume = 1;
        playerElement.volume = 1;
        playerGain.gain.value = 0;
        bgVideoGain.gain.value = 0;
        
        isAudioReady = true;
    }

    function fadeVolume(gainNode, targetVolume, duration = 500) {
        if (!isAudioReady) return;
        gainNode.gain.cancelScheduledValues(audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(targetVolume, audioContext.currentTime + duration / 1000);
    }

    // --- Обработчики событий ---

    allowAudioBtn.addEventListener('click', () => {
        setupAudioContext();
        audioContext.resume().then(() => {
            bgVideo.muted = false;
            fadeVolume(bgVideoGain, 0.7, 1000);
            permissionBanner.classList.add('hidden');
        });
    });

    closePlayerBtn.addEventListener('click', () => {
        player.pause();
        playerBanner.classList.add('hidden');
        bgVideo.style.opacity = '1';
        setTimeout(() => showPlayerBtn.style.display = 'flex', 300);
    });

    showPlayerBtn.addEventListener('click', () => {
        playerBanner.classList.remove('hidden');
        showPlayerBtn.style.display = 'none';
        bgVideo.style.opacity = '0.3';
    });

    toggleBlurBtn.addEventListener('click', () => {
        isBlurEnabled = !isBlurEnabled;
        bgVideo.style.filter = isBlurEnabled ? 'blur(25px) brightness(0.6)' : 'blur(0px) brightness(0.9)';
        toggleBlurBtn.classList.toggle('toggled', !isBlurEnabled);
    });

    toggleWaterBtn.addEventListener('click', () => {
        if (!isAudioReady) return;
        isWaterEffectEnabled = !isWaterEffectEnabled;
        underwaterFilter.frequency.linearRampToValueAtTime(
            isWaterEffectEnabled ? 400 : 20000,
            audioContext.currentTime + 0.5
        );
        toggleWaterBtn.classList.toggle('toggled', !isWaterEffectEnabled);
    });
    
    // --- [ИСПРАВЛЕНО] Обработчик для кнопки смены масштаба ---
    toggleFitBtn.addEventListener('click', () => {
        bgVideo.classList.toggle('original-size-mode'); // Используем правильный класс
        toggleFitBtn.classList.toggle('toggled');
    });

    copyLinkBtn.addEventListener('click', () => {
        const urlToCopy = copyLinkBtn.getAttribute('data-clipboard-text');
        navigator.clipboard.writeText(urlToCopy).then(() => {
            const originalHTML = copyLinkBtn.innerHTML;
            copyLinkBtn.innerHTML = '<span class="icon">✅</span> Скопировано!';
            copyLinkBtn.disabled = true;
            setTimeout(() => {
                copyLinkBtn.innerHTML = originalHTML;
                copyLinkBtn.disabled = false;
            }, 2000);
        }).catch(err => {
            console.error('Ошибка при копировании ссылки: ', err);
            alert('Не удалось скопировать ссылку.');
        });
    });

    player.on('play', () => { clearTimeout(pauseTimeout); fadeVolume(bgVideoGain, 0); fadeVolume(playerGain, 1); });
    player.on('pause', () => { pauseTimeout = setTimeout(() => { fadeVolume(playerGain, 0); fadeVolume(bgVideoGain, 0.7); }, 100); });
    player.on('ended', () => { fadeVolume(playerGain, 0); fadeVolume(bgVideoGain, 0.7); });
    player.on('seeking', () => clearTimeout(pauseTimeout));

    let isDragging = false, initialX, initialY, xOffset, yOffset;
    function dragStart(e) {
        if (e.target.closest('.plyr, .action-btn, .close-btn, .video-description')) return;
        isDragging = true;
        playerBanner.classList.add('dragging');
        const transform = new DOMMatrix(window.getComputedStyle(playerBanner).getPropertyValue('transform'));
        xOffset = transform.e; yOffset = transform.f;
        if (e.type === "touchstart") { initialX = e.touches[0].clientX - xOffset; initialY = e.touches[0].clientY - yOffset;
        } else { e.preventDefault(); initialX = e.clientX - xOffset; initialY = e.clientY - yOffset; }
        document.addEventListener('mousemove', drag);
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchend', dragEnd);
    }
    function drag(e) {
        if (!isDragging) return;
        e.preventDefault();
        let currentX, currentY;
        if (e.type === "touchmove") { currentX = e.touches[0].clientX - initialX; currentY = e.touches[0].clientY - initialY;
        } else { currentX = e.clientX - initialX; currentY = e.clientY - initialY; }
        playerBanner.style.transform = `translate(${currentX}px, ${currentY}px)`;
    }
    function dragEnd() {
        isDragging = false;
        playerBanner.classList.remove('dragging');
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('touchmove', drag);
        document.removeEventListener('mouseup', dragEnd);
        document.removeEventListener('touchend', dragEnd);
    }
    playerBanner.addEventListener('mousedown', dragStart);
    playerBanner.addEventListener('touchstart', dragStart, { passive: false });
});
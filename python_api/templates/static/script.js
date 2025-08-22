document.addEventListener('DOMContentLoaded', () => {
    // --- Инициализация элементов ---
    const bgVideo = document.getElementById('bg-video');
    const authorWatermark = document.getElementById('author-watermark');
    const authorNickname = document.getElementById('author-nickname');
    const authorAvatar = document.getElementById('author-avatar');
    const toggleFitBtn = document.getElementById('toggle-fit-btn');
    // ... остальной код инициализации
    const permissionBanner = document.getElementById('permission-banner'); const allowAudioBtn = document.getElementById('allow-audio-btn'); const playerBanner = document.getElementById('player-banner'); const closePlayerBtn = document.getElementById('close-player-btn'); const showPlayerBtn = document.getElementById('show-player-btn'); const toggleBlurBtn = document.getElementById('toggle-blur-btn'); const toggleWaterBtn = document.getElementById('toggle-water-btn');

    let audioContext, sourceNode, lowPassFilter, gainNode; let isAudioContextInit = false; let videoFadeInterval, playerFadeInterval;
    if (authorNickname) { const text = authorNickname.textContent; authorNickname.innerHTML = ''; text.split('').forEach(char => { const span = document.createElement('span'); span.textContent = char; authorNickname.appendChild(span); }); }
    const player = new Plyr('#player', { controls: ['play', 'progress', 'current-time', 'mute', 'volume', 'settings'], settings: ['speed'], volume: 1 });
    function fadeAudio(mediaElement, targetVolume, duration = 800) { const intervalTime = 20; const steps = duration / intervalTime; const volumeChange = (targetVolume - mediaElement.volume) / steps; const isVideo = mediaElement.tagName === 'VIDEO'; if (isVideo && videoFadeInterval) clearInterval(videoFadeInterval); if (!isVideo && playerFadeInterval) clearInterval(playerFadeInterval); const fade = setInterval(() => { if (Math.abs(mediaElement.volume - targetVolume) < Math.abs(volumeChange) * 1.1) { mediaElement.volume = targetVolume; if (targetVolume === 0) { if (!isVideo) mediaElement.pause(); else mediaElement.muted = true; } clearInterval(fade); } else { mediaElement.muted = false; mediaElement.volume += volumeChange; } }, intervalTime); if (isVideo) videoFadeInterval = fade; else playerFadeInterval = fade; }
    function initAudioContext() { if (isAudioContextInit) return; audioContext = new (window.AudioContext || window.webkitAudioContext)(); sourceNode = audioContext.createMediaElementSource(bgVideo); lowPassFilter = audioContext.createBiquadFilter(); lowPassFilter.type = 'lowpass'; lowPassFilter.frequency.setValueAtTime(400, audioContext.currentTime); gainNode = audioContext.createGain(); sourceNode.connect(lowPassFilter).connect(gainNode).connect(audioContext.destination); isAudioContextInit = true; }
    if (allowAudioBtn) { allowAudioBtn.addEventListener('click', () => { initAudioContext(); bgVideo.muted = false; bgVideo.volume = 1; permissionBanner.classList.add('hidden'); }); }
    player.on('play', () => { if (!isAudioContextInit) initAudioContext(); player.media.volume = 0; fadeAudio(bgVideo, 0); fadeAudio(player.media, 1); });
    player.on('pause', () => { fadeAudio(player.media, 0); if (!permissionBanner.classList.contains('hidden')) return; fadeAudio(bgVideo, 1); });
    function updateEffects(isTransitioning = false) { const isWaterSoundOn = toggleWaterBtn.classList.contains('toggled'); const isBlurOff = toggleBlurBtn.classList.contains('toggled'); let filterString = ''; if (isTransitioning) { filterString += 'blur(1px) '; } if (!isBlurOff) { filterString += 'brightness(0.6) blur(25px)'; } else { filterString += 'brightness(1)'; } bgVideo.style.filter = filterString.trim(); if (isAudioContextInit) { const targetFrequency = isWaterSoundOn ? 400 : 20000; lowPassFilter.frequency.linearRampToValueAtTime(targetFrequency, audioContext.currentTime + 1.0); } }
    if (toggleWaterBtn) { toggleWaterBtn.classList.add('toggled'); toggleWaterBtn.addEventListener('click', () => { toggleWaterBtn.classList.toggle('toggled'); updateEffects(); }); }
    if (toggleBlurBtn) { toggleBlurBtn.addEventListener('click', () => { toggleBlurBtn.classList.toggle('toggled'); updateEffects(); }); }
    let isDragging = false, offsetX, offsetY;
    if (playerBanner) playerBanner.addEventListener('mousedown', (e) => { if (e.target.closest('button, input, a, .plyr__controls')) return; isDragging = true; playerBanner.classList.add('dragging'); offsetX = e.clientX - playerBanner.getBoundingClientRect().left; offsetY = e.clientY - playerBanner.getBoundingClientRect().top; });
    document.addEventListener('mousemove', (e) => { if (isDragging) { playerBanner.style.left = `${e.clientX - offsetX}px`; playerBanner.style.top = `${e.clientY - offsetY}px`; } });
    document.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; playerBanner.classList.remove('dragging'); } });
    if (closePlayerBtn) closePlayerBtn.addEventListener('click', () => { playerBanner.classList.add('hidden'); showPlayerBtn.style.display = 'flex'; });
    if (showPlayerBtn) showPlayerBtn.addEventListener('click', () => { playerBanner.classList.remove('hidden'); showPlayerBtn.style.display = 'none'; });
    
    // ==========================================================
    // === ОБНОВЛЕННАЯ ЛОГИКА АНИМАЦИИ С АВАТАРКОЙ ===
    // ==========================================================
    if (toggleFitBtn && bgVideo && authorWatermark && authorNickname && authorAvatar) {
        const letters = authorNickname.querySelectorAll('span');
        toggleFitBtn.addEventListener('click', () => {
            updateEffects(true);
            toggleFitBtn.classList.toggle('toggled');
            const isSizeMode = bgVideo.classList.toggle('original-size-mode');
            
            authorWatermark.classList.toggle('visible', isSizeMode);
            
            if (isSizeMode) {
                // ПОЯВЛЕНИЕ
                authorAvatar.classList.remove('hiding');
                authorAvatar.classList.add('appearing');
                letters.forEach(span => { span.style.transform = 'translate(0, 0) rotate(0) scale(1)'; });

                // После завершения быстрой анимации, переключаем на медленную
                setTimeout(() => {
                    authorAvatar.classList.remove('appearing');
                    authorAvatar.classList.add('looping');
                }, 1200); // 1.2s - длительность анимации spin-in

            } else {
                // ИСЧЕЗНОВЕНИЕ
                authorAvatar.classList.remove('looping');
                authorAvatar.classList.add('hiding');
                letters.forEach(span => {
                    const x = (Math.random() - 0.5) * 400, y = (Math.random() - 0.5) * 300, rot = (Math.random() - 0.5) * 720, scale = Math.random() * 0.4;
                    span.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`;
                });
            }
            
            setTimeout(() => {
                updateEffects(false);
                // После анимации скрытия, сбрасываем класс, чтобы аватарка была готова к появлению
                if (!isSizeMode) {
                    authorAvatar.classList.remove('hiding');
                }
            }, 800); // 0.8s - длительность transition
        });
    }
    
    updateEffects();
});
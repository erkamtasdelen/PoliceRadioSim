document.addEventListener('DOMContentLoaded', function() {
    // HTML elementlerini seçme
    const radioImg = document.getElementById('radio-img');
    const toggleBtn = document.getElementById('toggle-btn');
    const beepBtn = document.getElementById('beep-btn');
    const channelDisplay = document.getElementById('channel-display');
    const channelUpBtn = document.getElementById('channel-up');
    const channelDownBtn = document.getElementById('channel-down');
    const usersCountDisplay = document.getElementById('users-count');
    const peerIdDisplay = document.getElementById('peer-id');
    
    // Ses dosyalarını oluşturma
    const radioOnSound = new Audio('Radio_On.mp3');
    const radioOffSound = new Audio('Radio_Off.mp3');
    const beepSound = new Audio('Beep.wav');
    
    // Statik gürültü sesi oluşturma
    const createStaticNoise = () => {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const noiseNode = audioContext.createScriptProcessor(4096, 1, 1);
        const gainNode = audioContext.createGain();
        
        noiseNode.onaudioprocess = (e) => {
            const output = e.outputBuffer.getChannelData(0);
            for (let i = 0; i < output.length; i++) {
                output[i] = Math.random() * 2 - 1;
            }
        };
        
        // Gürültü seviyesini daha düşük ayarlıyoruz
        gainNode.gain.value = 0.01; // 0.05'ten 0.01'e düşürüldü
        noiseNode.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        return {
            start: () => {
                console.log("Statik gürültü başlatıldı");
                gainNode.gain.value = 0.01; // 0.05'ten 0.01'e düşürüldü
            },
            stop: () => {
                console.log("Statik gürültü durduruldu");
                gainNode.gain.value = 0;
            },
            setVolume: (vol) => {
                console.log(`Statik gürültü seviyesi: ${vol}`);
                gainNode.gain.value = vol;
            }
        };
    };
    
    // Telsiz durumu
    let isRadioOn = false;
    let currentChannel = 1;
    let staticNoise = null;
    let stream = null;
    let mediaRecorder = null;
    let usersInChannel = 0;
    
    // WebSocket değişkenleri
    let socket = null;
    let clientId = null;
    
    // Güç ışığı ekleyerek telsizin durumunu görselleştirme
    const createPowerIndicator = () => {
        const indicator = document.createElement('div');
        indicator.classList.add('power-indicator');
        indicator.style.position = 'absolute';
        indicator.style.top = '26%';
        indicator.style.right = '64%';
        indicator.style.width = '20px';
        indicator.style.height = '20px';
        indicator.style.borderRadius = '50%';
        indicator.style.backgroundColor = '#333';
        indicator.style.boxShadow = '0 0 5px rgba(0, 0, 0, 0.5)';
        document.querySelector('.radio-wrapper').appendChild(indicator);
        return indicator;
    };
    
    const powerIndicator = createPowerIndicator();
    
    // WebSocket bağlantısı kurma
    const connectWebSocket = () => {
        // WebSocket sunucusuna bağlan (render.com'daki sunucu adresi)
        // NOT: Bu adresi kendi WebSocket sunucu adresinizle değiştirin
        const wsServerUrl = "wss://radio-ws.onrender.com";
        
        console.log("WebSocket bağlantısı kuruluyor:", wsServerUrl);
        usersCountDisplay.textContent = "Bağlanıyor...";
        usersCountDisplay.style.color = "#ffaa00";
        
        try {
            socket = new WebSocket(wsServerUrl);
            
            socket.onopen = function() {
                console.log("WebSocket bağlantısı başarılı");
                usersCountDisplay.textContent = "Bağlantı Kuruldu";
                usersCountDisplay.style.color = "#00ff00";
                
                // Benzersiz ID oluştur
                clientId = 'telsiz_' + Math.random().toString(36).substring(2, 10);
                peerIdDisplay.textContent = "ID: " + clientId;
                peerIdDisplay.style.display = 'block';
                
                // Kanala katılma mesajı gönder
                joinChannel(currentChannel);
            };
            
            socket.onmessage = function(event) {
                console.log("Mesaj alındı:", event.data);
                
                try {
                    const message = JSON.parse(event.data);
                    
                    // Mesaj türüne göre işlem yap
                    if (message.type === 'join') {
                        // Kanala katılma mesajı
                        console.log("Kullanıcı kanala katıldı:", message.clientId, "Kanal:", message.channel);
                        updateUsersInChannel(message.channel, message.userCount);
                    } 
                    else if (message.type === 'leave') {
                        // Kanaldan ayrılma mesajı
                        console.log("Kullanıcı kanaldan ayrıldı:", message.clientId, "Kanal:", message.channel);
                        updateUsersInChannel(message.channel, message.userCount);
                    }
                    else if (message.type === 'audio' && message.channel === currentChannel && message.clientId !== clientId) {
                        // Ses verisi
                        console.log("Ses verisi alındı. Kanal:", message.channel, "Gönderen:", message.clientId);
                        playReceivedAudio(message.audioData);
                    }
                    else if (message.type === 'channel_info') {
                        // Kanal bilgisi
                        console.log("Kanal bilgisi:", message.channel, "Kullanıcı sayısı:", message.userCount);
                        updateUsersInChannel(message.channel, message.userCount);
                    }
                } catch (e) {
                    console.error("Mesaj işlenirken hata:", e);
                }
            };
            
            socket.onclose = function(event) {
                console.log("WebSocket bağlantısı kapatıldı. Kod:", event.code, "Neden:", event.reason);
                usersCountDisplay.textContent = "Bağlantı Kesildi";
                usersCountDisplay.style.color = "#ff0000";
                
                // 5 saniye sonra yeniden bağlanmayı dene
                if (isRadioOn) {
                    setTimeout(connectWebSocket, 5000);
                }
            };
            
            socket.onerror = function(error) {
                console.error("WebSocket hatası:", error);
                usersCountDisplay.textContent = "Bağlantı Hatası";
                usersCountDisplay.style.color = "#ff0000";
            };
            
            return true;
        } catch (e) {
            console.error("WebSocket bağlantısı kurulurken hata:", e);
            usersCountDisplay.textContent = "Bağlantı Hatası";
            usersCountDisplay.style.color = "#ff0000";
            return false;
        }
    };
    
    // Kanala katıl
    const joinChannel = (channel) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            console.log("Kanala katılınıyor:", channel);
            
            const joinMessage = {
                type: 'join',
                channel: channel,
                clientId: clientId
            };
            
            socket.send(JSON.stringify(joinMessage));
        } else {
            console.error("Kanala katılınamıyor: WebSocket bağlantısı açık değil.");
        }
    };
    
    // Kanaldan ayrıl
    const leaveChannel = (channel) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            console.log("Kanaldan ayrılınıyor:", channel);
            
            const leaveMessage = {
                type: 'leave',
                channel: channel,
                clientId: clientId
            };
            
            socket.send(JSON.stringify(leaveMessage));
        }
    };
    
    // Kanal kullanıcı sayısını güncelle
    const updateUsersInChannel = (channel, userCount) => {
        if (channel === currentChannel) {
            usersInChannel = userCount || 0;
            usersCountDisplay.textContent = `Kanal ${channel}: ${usersInChannel} kullanıcı`;
            usersCountDisplay.style.color = "#00ff00";
        }
    };
    
    // Mikrofon erişimi için izin iste
    const requestMicrophoneAccess = async () => {
        console.log("Mikrofon erişimi isteniyor...");
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            console.log('Mikrofon erişimi başarılı');
            
            // MediaRecorder oluştur
            const options = { mimeType: 'audio/webm' };
            try {
                mediaRecorder = new MediaRecorder(stream, options);
                console.log("MediaRecorder başarıyla oluşturuldu");
            } catch (e) {
                console.warn("WebM codec desteklenmiyor, alternatif kullanılıyor", e);
                mediaRecorder = new MediaRecorder(stream);
            }
            
            let audioChunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
                console.log("Ses verisi parçası alındı, boyut:", event.data.size);
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = () => {
                console.log("Ses kaydı durduruldu, veri işleniyor...");
                // Ses verisini bir Blob olarak al
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                console.log("Oluşturulan Blob boyutu:", audioBlob.size);
                audioChunks = [];
                
                // Blob'u base64'e dönüştür
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = function() {
                    const base64Audio = reader.result.split(',')[1];
                    console.log("Base64 ses verisi oluşturuldu, boyut:", base64Audio.length);
                    
                    // Ses verisini WebSocket üzerinden gönder
                    if (socket && socket.readyState === WebSocket.OPEN) {
                        const audioMessage = {
                            type: 'audio',
                            channel: currentChannel,
                            clientId: clientId,
                            audioData: base64Audio
                        };
                        
                        console.log("Ses verisi gönderiliyor. Kanal:", currentChannel);
                        socket.send(JSON.stringify(audioMessage));
                    } else {
                        console.error("Ses verisi gönderilemiyor: WebSocket bağlantısı açık değil.");
                    }
                };
            };
            
            return true;
        } catch (error) {
            console.error('Mikrofon erişimi hatası:', error);
            alert('Mikrofon erişimi sağlanamadı. Lütfen izinleri kontrol edin. Hata: ' + error.message);
            return false;
        }
    };
    
    // Base64 formatındaki ses verisini çalma
    const playReceivedAudio = (base64Audio) => {
        if (!isRadioOn) {
            console.log("Telsiz kapalı olduğu için ses oynatılmıyor");
            return;
        }
        
        console.log("Alınan ses verisi işleniyor...");
        try {
            const audioData = atob(base64Audio);
            const arrayBuffer = new ArrayBuffer(audioData.length);
            const view = new Uint8Array(arrayBuffer);
            
            for (let i = 0; i < audioData.length; i++) {
                view[i] = audioData.charCodeAt(i);
            }
            
            const blob = new Blob([arrayBuffer], { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            
            console.log("Bip sesi çalınıyor...");
            // Ses efekti ekleyerek çal
            beepSound.play().then(() => {
                setTimeout(() => {
                    console.log("Alınan ses oynatılıyor...");
                    audio.play().then(() => {
                        // Oynatma tamamlandığında URL'yi temizle
                        console.log("Ses oynatma tamamlandı");
                        URL.revokeObjectURL(audioUrl);
                    }).catch(e => {
                        console.error('Ses çalma hatası:', e);
                        alert("Ses oynatılırken bir hata oluştu: " + e.message);
                    });
                }, 500);
            }).catch(e => {
                console.error('Bip sesi çalma hatası:', e);
                alert("Bip sesi çalınırken bir hata oluştu: " + e.message);
            });
        } catch (e) {
            console.error('Ses verisi işlenirken hata:', e);
            alert("Ses verisi işlenirken bir hata oluştu: " + e.message);
        }
    };
    
    // Telsiz açma/kapama fonksiyonu
    toggleBtn.addEventListener('click', async function() {
        if (isRadioOn) {
            // Telsizi kapat
            radioOffSound.play();
            powerIndicator.style.backgroundColor = '#333';
            powerIndicator.style.boxShadow = '0 0 5px rgba(0, 0, 0, 0.5)';
            
            // Kanal ekranını ve butonlarını gizle
            channelDisplay.style.display = 'none';
            channelUpBtn.style.display = 'none';
            channelDownBtn.style.display = 'none';
            usersCountDisplay.style.display = 'none';
            peerIdDisplay.style.display = 'none';
            
            // Statik gürültüyü durdur
            if (staticNoise) {
                staticNoise.stop();
            }
            
            // Mevcut kanaldan ayrıl
            leaveChannel(currentChannel);
            
            // WebSocket bağlantısını kapat
            if (socket) {
                socket.close();
            }
            
            // Ses akışını kapat
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }
            
            isRadioOn = false;
        } else {
            // Telsizi aç
            radioOnSound.play();
            powerIndicator.style.backgroundColor = '#00ff00';
            powerIndicator.style.boxShadow = '0 0 10px #00ff00';
            
            // Kanal ekranını ve butonlarını göster
            channelDisplay.style.display = 'block';
            channelDisplay.textContent = currentChannel.toString().padStart(2, '0');
            channelUpBtn.style.display = 'flex';
            channelDownBtn.style.display = 'flex';
            usersCountDisplay.style.display = 'block';
            
            // Statik gürültü başlat
            if (!staticNoise) {
                staticNoise = createStaticNoise();
            }
            staticNoise.start();
            
            // Mikrofon erişimi iste
            if (!stream) {
                const hasMicAccess = await requestMicrophoneAccess();
                if (!hasMicAccess) {
                    console.error("Mikrofon erişimi olmadan telsiz kullanılamaz");
                    return;
                }
            }
            
            // WebSocket bağlantısı kur
            connectWebSocket();
            
            isRadioOn = true;
        }
    });
    
    // Kanal değiştirme butonları
    channelUpBtn.addEventListener('click', function() {
        if (!isRadioOn) return;
        
        // Mevcut kanaldan ayrıl
        leaveChannel(currentChannel);
        
        // Kanal artır (1-16 arası)
        currentChannel = currentChannel < 16 ? currentChannel + 1 : 1;
        channelDisplay.textContent = currentChannel.toString().padStart(2, '0');
        
        // Yeni kanala katıl
        joinChannel(currentChannel);
        
        // Kanal değişim efekti
        beepSound.play();
    });
    
    channelDownBtn.addEventListener('click', function() {
        if (!isRadioOn) return;
        
        // Mevcut kanaldan ayrıl
        leaveChannel(currentChannel);
        
        // Kanal azalt (1-16 arası)
        currentChannel = currentChannel > 1 ? currentChannel - 1 : 16;
        channelDisplay.textContent = currentChannel.toString().padStart(2, '0');
        
        // Yeni kanala katıl
        joinChannel(currentChannel);
        
        // Kanal değişim efekti
        beepSound.play();
    });
    
    // Konuşma fonksiyonu
    beepBtn.addEventListener('mousedown', function() {
        if (!isRadioOn) {
            alert('Önce telsizi açmalısınız!');
            return;
        }
        
        // Konuş düğmesine basıldığında görsel efekt
        beepBtn.classList.add('active-talk');
        
        // Bip sesi çal
        beepSound.play();
        
        // Statik gürültüyü azalt
        if (staticNoise) {
            staticNoise.setVolume(0.01);
        }
        
        // Kayda başla
        if (mediaRecorder && mediaRecorder.state === 'inactive') {
            mediaRecorder.start();
        }
    });
    
    beepBtn.addEventListener('mouseup', function() {
        if (!isRadioOn) return;
        
        // Konuş düğmesi bırakıldığında efekti kaldır
        beepBtn.classList.remove('active-talk');
        
        // Statik gürültüyü normale döndür
        if (staticNoise) {
            staticNoise.setVolume(0.01);
        }
        
        // Kaydı durdur
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    });
    
    // Sayfa kapatıldığında kaynakları temizle
    window.addEventListener('beforeunload', function() {
        if (socket) {
            // Kanaldan ayrıl
            leaveChannel(currentChannel);
            // WebSocket bağlantısını kapat
            socket.close();
        }
        
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    });
}); 
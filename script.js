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
    const serverUrl = 'wss://policeradiosim.onrender.com/'; // WebSocket sunucu URL'i
    
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
        try {
            socket = new WebSocket(serverUrl);
            
            socket.onopen = () => {
                console.log('WebSocket bağlantısı kuruldu');
                
                // HTML element kontrolü (null olabilir)
                const connectionStatus = document.getElementById('connectionStatus');
                if (connectionStatus) {
                    connectionStatus.innerText = 'Bağlı';
                    connectionStatus.className = 'connected';
                }
                
                // Rastgele client ID oluştur
                clientId = 'client_' + Math.random().toString(36).substring(2, 9);
                console.log('Client ID:', clientId);
                
                if (peerIdDisplay) {
                    peerIdDisplay.textContent = `ID: ${clientId}`;
                    peerIdDisplay.style.display = 'block';
                }
                
                // Bağlantı kurulduğunda mevcut kanala katıl
                joinChannel(currentChannel);
                
                // Kullanıcı sayısını göster
                if (usersCountDisplay) {
                    usersCountDisplay.textContent = 'Kullanıcılar Aranıyor...';
                    usersCountDisplay.style.display = 'block';
                }
            };
            
            socket.onclose = (event) => {
                console.log('WebSocket bağlantısı kapandı', event);
                
                // HTML element kontrolü
                const connectionStatus = document.getElementById('connectionStatus');
                if (connectionStatus) {
                    connectionStatus.innerText = 'Bağlantı Kesildi';
                    connectionStatus.className = 'disconnected';
                }
                
                // Eğer telsiz açıksa yeniden bağlanmayı dene
                if (isRadioOn) {
                    setTimeout(connectWebSocket, 3000);
                }
            };
            
            socket.onerror = (error) => {
                console.error('WebSocket hatası:', error);
                
                // HTML element kontrolü
                const connectionStatus = document.getElementById('connectionStatus');
                if (connectionStatus) {
                    connectionStatus.innerText = 'Bağlantı Hatası';
                    connectionStatus.className = 'error';
                }
            };
            
            socket.onmessage = (event) => {
                handleWebSocketMessage(event);
            };
        } catch (error) {
            console.error('WebSocket bağlantı hatası:', error);
            
            // HTML element kontrolü
            const connectionStatus = document.getElementById('connectionStatus');
            if (connectionStatus) {
                connectionStatus.innerText = 'Bağlantı Hatası';
                connectionStatus.className = 'error';
            }
            
            // Eğer telsiz açıksa yeniden bağlanmayı dene
            if (isRadioOn) {
                setTimeout(connectWebSocket, 3000);
            }
        }
    };
    
    // WebSocket üzerinden gelen mesajları işle
    const handleWebSocketMessage = async (event) => {
        try {
            // Gelen veri Blob mu yoksa String mi kontrol et
            if (event.data instanceof Blob) {
                console.log(event.data)
                console.log("Blob formatında ses verisi alındı:", event.data.size);
                console.log("Blob MIME tipi:", event.data.type);
                
                // Blob detaylarını görüntüle
                const blobInfo = {
                    size: event.data.size + " bytes",
                    type: event.data.type || "belirtilmemiş",
                    timestamp: new Date().toISOString()
                };
                console.table(blobInfo);
                
                // Blob formatında ses verisi - doğrudan çal
                playAudioFromBlob(event.data);
                return;
            }
            
            // String mesajı kontrol et
            const messageStr = event.data;
            
            // Welcome mesajını kontrol et
            if (typeof messageStr === 'string' && messageStr.startsWith('Welcome')) {
                console.log("Karşılama mesajı:", messageStr);
                return;
            }
            
            // JSON mesajı parse etmeyi dene
            try {
                const message = JSON.parse(messageStr);
                console.log("JSON mesajı alındı:", message);
                
                switch (message.type) {
                    case 'audio':
                        if (message.channel == currentChannel && message.clientId !== clientId) {
                            console.log("Başka bir kullanıcıdan ses verisi alındı. Kanal:", message.channel);
                            console.log("Alınan JSON ses verisi:", {
                                kimden: message.clientId,
                                format: message.format || "belirtilmemiş",
                                kanal: message.channel,
                                veriUzunluğu: message.audioData ? message.audioData.length + " karakter" : "yok",
                                zamanDamgası: message.timestamp ? new Date(message.timestamp).toISOString() : "belirtilmemiş"
                            });
                            
                            // Veri kontrolü
                            if (!message.audioData || typeof message.audioData !== 'string') {
                                console.error("Geçersiz ses verisi formatı");
                                return;
                            }
                            
                            // Base64 formatındaki ses verisini Blob'a dönüştür
                            try {
                                const binaryAudio = atob(message.audioData);
                                const arrayBuffer = new ArrayBuffer(binaryAudio.length);
                                const uint8Array = new Uint8Array(arrayBuffer);
                                
                                for (let i = 0; i < binaryAudio.length; i++) {
                                    uint8Array[i] = binaryAudio.charCodeAt(i);
                                }
                                
                                // Doğru MIME tipi ile Blob oluştur
                                const mimeType = message.format || 'audio/webm';
                                const audioBlob = new Blob([arrayBuffer], { type: mimeType });
                                console.log("Dönüştürülen Blob:", {
                                    boyut: audioBlob.size + " bytes",
                                    tip: audioBlob.type
                                });
                                
                                // Ses boyutunu kontrol et
                                if (audioBlob.size < 100) {
                                    console.warn("Ses verisi çok küçük, çalma atlanıyor");
                                    return;
                                }
                                
                                playAudioFromBlob(audioBlob);
                            } catch (e) {
                                console.error("Ses verisi dönüştürme hatası:", e);
                            }
                        }
                        break;
                        
                    case 'userCount':
                        // Kullanıcı sayısını güncelle
                        updateActiveUsers(message.count, message.channelCounts);
                        break;
                        
                    case 'clientId':
                        // Sunucudan gelen client ID'yi sakla
                        clientId = message.id;
                        console.log('Sunucudan client ID alındı:', clientId);
                        if (peerIdDisplay) {
                            peerIdDisplay.textContent = `ID: ${clientId}`;
                        }
                        break;
                        
                    case 'join':
                        // Kullanıcı kanalda katıldı
                        console.log(`Bir kullanıcı ${message.channel} kanalına katıldı.`);
                        // Kanal kullanıcı sayısını güncelle
                        if (message.channelUsers) {
                            usersInChannel = message.channelUsers;
                            if (usersCountDisplay) {
                                usersCountDisplay.textContent = `Kullanıcılar: ${usersInChannel}`;
                            }
                        }
                        break;
                        
                    case 'leave':
                        // Kullanıcı kanaldan ayrıldı
                        console.log(`Bir kullanıcı ${message.channel} kanalından ayrıldı.`);
                        break;
                        
                    case 'error':
                        console.error("Sunucu hatası:", message.message);
                        alert(`Sunucu hatası: ${message.message}`);
                        break;
                        
                    default:
                        console.log("Bilinmeyen mesaj türü:", message.type);
                }
            } catch (jsonError) {
                console.warn("Mesaj JSON formatında değil:", messageStr);
            }
        } catch (error) {
            console.error("Mesaj işleme hatası:", error);
        }
    };
    
    // Blob formatındaki ses verisini çal - geliştirilmiş ve daha güvenilir
    const playAudioFromBlob = (audioBlob) => {
        if (!isRadioOn) {
            console.log("Telsiz kapalı, ses çalınmıyor");
            return;
        }
        
        try {
            // Bip sesi çal (Promise return ettiği için hata yönetimi ekle)
            beepSound.play().catch(err => {
                console.log("Bip sesi çalarken hata, ana ses verisine geçiliyor");
            }).finally(() => {
                // Bip sesi çalsa da çalmasa da ses verisini çalmaya devam et
                setTimeout(() => {
                    playSoundData(audioBlob);
                }, 300);
            });
        } catch (error) {
            console.error("Ses çalma sürecinde hata:", error);
            // Hata olsa bile ses verisini çalmayı dene
            playSoundData(audioBlob);
        }
    };
    
    // Gerçek ses verisini çalma - birden fazla yöntem dener
    const playSoundData = (audioBlob) => {
        console.log("Ses verisi çalınmaya çalışılıyor...");
        
        // Blob boyutu kontrol et
        if (!audioBlob || audioBlob.size === 0) {
            console.error("Boş ses verisi, çalma atlanıyor");
            return;
        }
        
        // Blob türünü kontrol et ve düzelt
        let correctBlob = audioBlob;
        if (audioBlob.type !== 'audio/webm' && audioBlob.type !== 'audio/mp3' && audioBlob.type !== 'audio/wav') {
            console.log("Blob türü belirlenmemiş, audio/webm olarak ayarlanıyor");
            correctBlob = new Blob([audioBlob], { type: 'audio/webm' });
        }
        
        // 1. Yöntem: Audio elementi ile çalma
        try {
            const audioUrl = URL.createObjectURL(correctBlob);
            const audio = new Audio();
            
            // Debug için ses değerlerini göster
            audio.addEventListener("loadedmetadata", () => {
                console.log("Ses yüklendi: Süre =", audio.duration, "saniye, Durum =", audio.readyState);
            });
            
            // Oynatma durumunu izle
            let playAttempted = false;
            
            audio.oncanplaythrough = () => {
                // Ses verisini doğrudan oynatma
                if (!playAttempted) {
                    playAttempted = true;
                    audio.play()
                        .then(() => {
                            console.log("Ses çalınıyor");
                            // Statik sesi kıs
                            if (staticNoise) {
                                staticNoise.setVolume(0.001);
                            }
                        })
                        .catch(err => {
                            console.error("Ses çalma hatası (Method 1):", err);
                            // Method 2 ile dene
                            playWithAudioContext(correctBlob);
                        });
                }
            };
            
            audio.onended = () => {
                console.log("Ses çalma tamamlandı");
                URL.revokeObjectURL(audioUrl);
                // Statik sesi normale döndür
                if (staticNoise) {
                    staticNoise.setVolume(0.01);
                }
            };
            
            audio.onerror = (error) => {
                console.error("Ses çalma hatası (audio element):", error);
                URL.revokeObjectURL(audioUrl);
                // Alternatif yöntem ile dene
                playWithAudioContext(correctBlob);
            };
            
            // Ses yüklenemezse
            audio.src = audioUrl;
            audio.load();
            
            // Belirli bir süre içinde çalamazsa, alternatif yöntemi kullan
            setTimeout(() => {
                if (!playAttempted) {
                    console.log("Ses yükleme zaman aşımı, alternatif yöntem deneniyor");
                    playWithAudioContext(correctBlob);
                    URL.revokeObjectURL(audioUrl);
                }
            }, 2000);
        } catch (error) {
            console.error("Ses dosyası oluşturma hatası:", error);
            // Alternatif yöntem dene
            playWithAudioContext(correctBlob);
        }
    };
    
    // 2. Yöntem: Web Audio API kullanarak ses çalma
    const playWithAudioContext = (blob) => {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const fileReader = new FileReader();
            
            fileReader.onload = (event) => {
                const arrayBuffer = event.target.result;
                
                audioContext.decodeAudioData(arrayBuffer)
                    .then(audioBuffer => {
                        console.log("AudioBuffer başarıyla oluşturuldu. Ses çalınıyor (Method 2)");
                        
                        // Statik sesi kıs
                        if (staticNoise) {
                            staticNoise.setVolume(0.001);
                        }
                        
                        // Ses kaynağı oluştur
                        const source = audioContext.createBufferSource();
                        source.buffer = audioBuffer;
                        
                        // Ses bittiğinde
                        source.onended = () => {
                            console.log("AudioContext ses çalma tamamlandı");
                            // Statik sesi normale döndür
                            if (staticNoise) {
                                staticNoise.setVolume(0.01);
                            }
                        };
                        
                        // Bağlantıları yap ve çal
                        source.connect(audioContext.destination);
                        source.start(0);
                    })
                    .catch(error => {
                        console.error("AudioBuffer çözümleme hatası:", error);
                    });
            };
            
            fileReader.onerror = (error) => {
                console.error("Dosya okuma hatası:", error);
            };
            
            fileReader.readAsArrayBuffer(blob);
        } catch (error) {
            console.error("Web Audio API ile çalma hatası:", error);
        }
    };
    
    // Aktif kullanıcı sayısını güncelle
    const updateActiveUsers = (totalCount, channelCounts) => {
        const userCountElement = document.getElementById('userCount');
        if (userCountElement) {
            userCountElement.textContent = `Toplam: ${totalCount} kullanıcı`;
        }
        
        // Mevcut kanaldaki kullanıcı sayısını güncelle
        if (channelCounts && channelCounts[currentChannel]) {
            usersInChannel = channelCounts[currentChannel];
            if (usersCountDisplay) {
                usersCountDisplay.textContent = `Kullanıcılar: ${usersInChannel}`;
            }
        }
        
        const channelCountElement = document.getElementById('channelCount');
        if (channelCountElement) {
            let channelText = '';
            
            // Her kanal için kullanıcı sayısını göster
            for (const [channel, count] of Object.entries(channelCounts)) {
                channelText += `Kanal ${channel}: ${count} kullanıcı<br>`;
            }
            
            channelCountElement.innerHTML = channelText;
        }
    };
    
    // Mikrofon erişimi için izin iste ve MediaRecorder ayarla
    const requestMicrophoneAccess = async () => {
        console.log("Mikrofon erişimi isteniyor...");
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 44100,
                    channelCount: 1
                }
            });
            console.log('Mikrofon erişimi başarılı');
            
            // MediaRecorder oluştur (farklı format seçenekleri dene)
            let options;
            let recorderCreated = false;
            
            // WebM formatını dene
            try {
                options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 };
                mediaRecorder = new MediaRecorder(stream, options);
                recorderCreated = true;
                console.log("MediaRecorder WebM/Opus formatında oluşturuldu");
            } catch (e) {
                console.warn("WebM/Opus codec desteklenmiyor, alternatif deneniyor", e);
            }
            
            // Alternatif: Sadece WebM dene
            if (!recorderCreated) {
                try {
                    options = { mimeType: 'audio/webm', audioBitsPerSecond: 32000 };
                    mediaRecorder = new MediaRecorder(stream, options);
                    recorderCreated = true;
                    console.log("MediaRecorder WebM formatında oluşturuldu");
                } catch (e) {
                    console.warn("WebM codec desteklenmiyor, alternatif deneniyor", e);
                }
            }
            
            // Alternatif: MP3 dene (bazı tarayıcılar desktekler)
            if (!recorderCreated) {
                try {
                    options = { mimeType: 'audio/mp3', audioBitsPerSecond: 32000 };
                    mediaRecorder = new MediaRecorder(stream, options);
                    recorderCreated = true;
                    console.log("MediaRecorder MP3 formatında oluşturuldu");
                } catch (e) {
                    console.warn("MP3 codec desteklenmiyor, alternatif deneniyor", e);
                }
            }
            
            // Son alternatif: Varsayılan codec'i kullan
            if (!recorderCreated) {
                try {
                    mediaRecorder = new MediaRecorder(stream);
                    console.log("MediaRecorder varsayılan formatta oluşturuldu:", mediaRecorder.mimeType);
                    recorderCreated = true;
                } catch (e) {
                    console.error("MediaRecorder oluşturulamadı:", e);
                    alert("Ses kaydedici oluşturulamadı. Tarayıcınız desteklemeyebilir.");
                    return false;
                }
            }
            
            let audioChunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    console.log("Ses verisi parçası alındı, boyut:", event.data.size);
                    audioChunks.push(event.data);
                } else {
                    console.warn("Boş ses verisi parçası, atlanıyor");
                }
            };
            
            mediaRecorder.onstop = () => {
                console.log("Ses kaydı durduruldu, veri işleniyor...");
                
                if (audioChunks.length === 0) {
                    console.warn("Ses verisi yok, gönderilmiyor");
                    return;
                }
                
                // Ses verisini bir Blob olarak al
                const mimeType = mediaRecorder.mimeType || 'audio/webm';
                const audioBlob = new Blob(audioChunks, { type: mimeType });
                console.log("Oluşturulan Blob boyutu:", audioBlob.size, "MIME tipi:", mimeType);
                
                // Blob boyutunu kontrol et
                if (audioBlob.size < 1000) {
                    console.warn("Ses verisi çok küçük, muhtemelen kayıt başarısız");
                    audioChunks = [];
                    return;
                }
                
                // Herhangi bir audio oynatıcı içerisinde çalınabilecek formata getir
                normalizeAudioFormat(audioBlob, currentChannel);
                
                // Ses parçalarını temizle
                audioChunks = [];
            };
            
            return true;
        } catch (error) {
            console.error('Mikrofon erişimi hatası:', error);
            alert('Mikrofon erişimi sağlanamadı. Lütfen izinleri kontrol edin. Hata: ' + error.message);
            return false;
        }
    };
    
    // Ses formatını normalleştir ve gönder
    const normalizeAudioFormat = (audioBlob, channelNumber) => {
        // Blob boyutu kontrolü
        if (!audioBlob || audioBlob.size < 1000) {
            console.error("Geçersiz ses verisi");
            return;
        }
        
        console.log("Ses formatı normalleştiriliyor");
        
        try {
            // 1. Adım: WebM formatında olduğundan emin ol
            const fileReader = new FileReader();
            fileReader.onload = (event) => {
                try {
                    const arrayBuffer = event.target.result;
                    
                    // Web Audio API ile ses verisini işle
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    
                    audioContext.decodeAudioData(arrayBuffer).then(audioBuffer => {
                        console.log("Ses verisi başarıyla çözümlendi");
                        
                        // İşlenmiş ses verisini base64 olarak gönder
                        sendAudioData(audioBlob, channelNumber);
                    }).catch(err => {
                        console.warn("Ses çözümleme hatası, ham veriyi gönderiyorum:", err);
                        // Hata durumunda ham veriyi gönder
                        sendAudioData(audioBlob, channelNumber);
                    });
                } catch (e) {
                    console.error("Ses işleme hatası:", e);
                    // Hata durumunda ham veriyi gönder
                    sendAudioData(audioBlob, channelNumber);
                }
            };
            
            fileReader.onerror = (error) => {
                console.error("Dosya okuma hatası:", error);
                // Hata durumunda ham veriyi gönder
                sendAudioData(audioBlob, channelNumber);
            };
            
            fileReader.readAsArrayBuffer(audioBlob);
        } catch (error) {
            console.error("Ses normalleştirme hatası:", error);
            // Hata durumunda ham veriyi gönder
            sendAudioData(audioBlob, channelNumber);
        }
    };
    
    // Ses verisini WebSocket üzerinden gönder
    const sendAudioData = (audioBlob, channelNumber) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.error("Ses verisi gönderilemiyor: WebSocket bağlantısı açık değil.");
            return;
        }
        
        console.log("Ses gönderiliyor - Kanal:", channelNumber, "Boyut:", audioBlob.size, "bytes", "MIME:", audioBlob.type);
        
        // Boyut kontrolü
        if (audioBlob.size > 100000) {
            console.warn("Ses verisi çok büyük, sıkıştırılıyor...");
            // Daha düşük kalite için burada sıkıştırma işlemi yapılabilir
        }
        
        try {
            const reader = new FileReader();
        
            reader.onloadend = function () {
                try {
                    const result = reader.result;
        
                    if (!result.startsWith("data:audio")) {
                        console.error("Beklenmeyen MIME tipi:", result);
                        return;
                    }
        
                    const base64Audio = result.split(',')[1];
                    
                    // Sunucunun beklediği formatta veri hazırlama
                    const audioMessage = {
                        type: 'audio',
                        channel: channelNumber.toString(), // String olarak gönder
                        clientId: clientId,
                        audioData: base64Audio,
                        format: audioBlob.type || 'audio/webm;codecs=opus',
                        timestamp: Date.now()
                    };
                    
                    // Veri yapısını doğrula
                    if (typeof audioMessage.type !== 'string' || 
                        typeof audioMessage.channel !== 'string' || 
                        typeof audioMessage.clientId !== 'string' || 
                        typeof audioMessage.format !== 'string' || 
                        typeof audioMessage.audioData !== 'string' || 
                        typeof audioMessage.timestamp !== 'number') {
                        console.error("Geçersiz veri formatı:", audioMessage);
                        return;
                    }
        
                    socket.send(JSON.stringify(audioMessage));
                    console.log("Ses verisi JSON formatında gönderildi 🎧");
        
                } catch (e) {
                    console.error("Ses verisi JSON'a çevrilirken hata:", e);
                }
            };
        
            reader.readAsDataURL(audioBlob);
        
        } catch (err) {
            console.error("FileReader hatası:", err);
        }
    };
    
    // Telsiz açma/kapama fonksiyonu
    const toggleRadio = () => {
        isRadioOn = !isRadioOn;

        // UI güncelleme
        if (isRadioOn) {
            // Telsiz açık durumunda güç ışığını yeşil yap
            powerIndicator.style.backgroundColor = '#00ff00';
            powerIndicator.style.boxShadow = '0 0 10px #00ff00';
            
            // Ekranları göster
            if (channelDisplay) {
                channelDisplay.style.display = 'block';
            }
            if (usersCountDisplay) {
                usersCountDisplay.style.display = 'block';
            }
            if (channelUpBtn) {
                channelUpBtn.style.display = 'block';
            }
            if (channelDownBtn) {
                channelDownBtn.style.display = 'block';
            }
        } else {
            // Telsiz kapalı durumunda güç ışığını kırmızı yap
            powerIndicator.style.backgroundColor = '#333';
            powerIndicator.style.boxShadow = '0 0 5px rgba(0, 0, 0, 0.5)';
            
            // Ekranları gizle
            if (channelDisplay) {
                channelDisplay.style.display = 'none';
            }
            if (usersCountDisplay) {
                usersCountDisplay.style.display = 'none';
            }
            if (peerIdDisplay) {
                peerIdDisplay.style.display = 'none';
            }
            if (channelUpBtn) {
                channelUpBtn.style.display = 'none';
            }
            if (channelDownBtn) {
                channelDownBtn.style.display = 'none';
            }
        }
        
        if (isRadioOn) {
            // Telsiz açıldığında
            console.log("Telsiz açıldı");
            radioOnSound.play();
            
            // Statik gürültüyü başlat
            if (!staticNoise) {
                staticNoise = createStaticNoise();
            }
            staticNoise.start();
            
            // WebSocket bağlantısını kur
            connectWebSocket();
            
            // Mevcut kanalı göster
            updateChannelDisplay();
            
            // Mikrofon erişimini kontrol et
            if (!mediaRecorder) {
                requestMicrophoneAccess();
            }
        } else {
            // Telsiz kapatıldığında
            console.log("Telsiz kapatıldı");
            radioOffSound.play();
            
            // Statik gürültüyü durdur
            if (staticNoise) {
                staticNoise.stop();
            }
            
            // Ses kaydını durdur, eğer aktifse
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                stopRecording();
            }
            
            // WebSocket bağlantısını kapat
            if (socket && socket.readyState === WebSocket.OPEN) {
                // Kanaldan ayrıl
                leaveChannel(currentChannel);
                socket.close();
            }
            
            // Ekranı temizle
            const connectionStatus = document.getElementById('connectionStatus');
            if (connectionStatus) {
                connectionStatus.innerText = 'Kapalı';
                connectionStatus.className = 'disconnected';
            }
            if (channelDisplay) {
                channelDisplay.innerText = '--';
            }
            
            if (usersCountDisplay) {
                usersCountDisplay.textContent = 'Kullanıcılar: 0';
            }
        }
    };
    
    // Kanal değiştirme fonksiyonu
    const changeChannel = (increment) => {
        if (!isRadioOn) return;
        
        // Ses kaydını durdur (eğer aktifse)
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            stopRecording();
        }
        
        // Kanal değiştirme sesi çal
        beepSound.play();
        
        // Mevcut kanaldan ayrıl
        leaveChannel(currentChannel);
        
        // Yeni kanal numarasını hesapla (1-16 arası)
        const newChannel = currentChannel + increment;
        if (newChannel >= 1 && newChannel <= 16) {
            currentChannel = newChannel;
            
            // Kanal değişikliğini ekranda göster
            updateChannelDisplay();
            
            // Sunucuya kanal değişikliğini bildir
            joinChannel(currentChannel);
        }
    };
    
    // Kanal göstergesini güncelle
    const updateChannelDisplay = () => {
        if (channelDisplay) {
            channelDisplay.innerText = currentChannel.toString().padStart(2, '0');
        }
    };
    
    // Kanala katılma fonksiyonu
    const joinChannel = (channel) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            const joinMessage = {
                type: 'join',
                channel: channel,
                clientId: clientId
            };
            
            socket.send(JSON.stringify(joinMessage));
            console.log(`${channel} kanalına katılma isteği gönderildi`);
        } else {
            console.warn("WebSocket bağlantısı kurulu değil, kanala katılınamıyor");
        }
    };
    
    // Kanaldan ayrılma fonksiyonu
    const leaveChannel = (channel) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            const leaveMessage = {
                type: 'leave',
                channel: channel,
                clientId: clientId
            };
            
            socket.send(JSON.stringify(leaveMessage));
            console.log(`${channel} kanalından ayrılma isteği gönderildi`);
        }
    };
    
    // Kayıt durdurma yardımcı fonksiyonu
    const stopRecording = () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            console.log("Ses kaydı durduruldu");
        }
    };
    
    // Event Listeners
    
    // Telsiz açma/kapama düğmesi
    toggleBtn.addEventListener('click', toggleRadio);
    
    // Kanal değiştirme düğmeleri
    channelUpBtn.addEventListener('click', () => changeChannel(1));
    channelDownBtn.addEventListener('click', () => changeChannel(-1));
    
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
            staticNoise.setVolume(0.005);
        }
        
        // Kayda başla
        if (mediaRecorder && mediaRecorder.state === 'inactive') {
            mediaRecorder.start();
            console.log("Ses kaydı başlatıldı");
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
        stopRecording();
    });
    
    // Sayfa kapatıldığında kaynakları temizle
    window.addEventListener('beforeunload', function() {
        if (socket && socket.readyState === WebSocket.OPEN) {
            // Kanaldan ayrıl
            leaveChannel(currentChannel);
            // WebSocket bağlantısını kapat
            socket.close();
        }
        
        if (stream) {
            // Mikrofon akışını durdur
            stream.getTracks().forEach(track => track.stop());
        }
        
        // Statik gürültüyü durdur
        if (staticNoise) {
            staticNoise.stop();
        }
    });
}); 
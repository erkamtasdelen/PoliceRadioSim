document.addEventListener('DOMContentLoaded', function() {
    // HTML elementlerini seçme
    const radioImg = document.getElementById('radio-img');
    const toggleBtn = document.getElementById('toggle-btn');
    const beepBtn = document.getElementById('beep-btn');
    const channelDisplay = document.getElementById('channel-display');
    const channelUpBtn = document.getElementById('channel-up');
    const channelDownBtn = document.getElementById('channel-down');
    const usersCountDisplay = document.getElementById('userscount');
    const peerIdDisplay = document.getElementById('peer-id');
    const codeZeroBtn = document.getElementById('code-zero-btn');
    

    
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
        gainNode.gain.value = 0.01;
        noiseNode.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        return {
            start: () => {
                gainNode.gain.value = 0.01;
            },
            stop: () => {
                gainNode.gain.value = 0;
            },
            setVolume: (vol) => {
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
            console.log("WebSocket bağlantısı kuruluyor...", serverUrl);
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
            console.error("WebSocket bağlantı hatası:", error);
            
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
                const blobText = await new Response(event.data).text();
                if (blobText.startsWith('{') && blobText.includes('"type":"audio"')) {
                    const jsonData = JSON.parse(blobText);
                    processJsonAudio(jsonData);
                    return;
                }
                
                playAudioFromBlob(event.data);
                return;
            }
            
            // String mesajı kontrol et
            const messageStr = event.data;
            
            if (typeof messageStr === 'string' && messageStr.startsWith('Welcome')) {
                return;
            }
            
            // JSON mesajı parse et
            if (typeof messageStr === 'string') {
                try {
                    const message = JSON.parse(messageStr);
                    
                    switch (message.type) {
                        case 'audio':
                            processJsonAudio(message);
                            break;
                            
                        case 'userCount':
                            updateActiveUsers(message.count, message.channelCounts);
                            break;
                            
                        case 'clientId':
                            clientId = message.id;
                            if (peerIdDisplay) {
                                peerIdDisplay.textContent = `ID: ${clientId}`;
                            }
                            break;
                            
                        case 'join':
                            if (message.channelUsers) {
                                usersInChannel = message.channelUsers;
                                if (usersCountDisplay) {
                                    usersCountDisplay.textContent = `Kullanıcılar: ${usersInChannel}`;
                                }
                            }
                            break;
                            
                        case 'notification':
                            if (message.notificationType === 'codeZero') {
                                showNotification("KOD 0 ACİL DURUM", `${message.clientId} tarafından KOD 0 acil durum bildirildi!`);
                            }
                            break;
                            
                        case 'error':
                            alert(`Sunucu hatası: ${message.message}`);
                            break;
                    }
                } catch (jsonError) {
                    console.warn("Mesaj JSON formatında değil:", messageStr);
                }
            }
        } catch (error) {
            console.error("Mesaj işleme hatası:", error);
        }
    };
    
    // processJsonAudio fonksiyonuna bir kilit mekanizması ekleyelim
    let isCurrentlyPlayingAudio = false;
    let audioPlaybackQueue = [];
    let audioHistory = []; // Son çalınan ses dosyalarının kimliklerini saklamak için
    const MAX_HISTORY_SIZE = 20; // Saklanan geçmiş kayıt sayısı - iPhone tekrar sorunları için arttırıldı
    const DUPLICATE_TIME_THRESHOLD = 5000; // iOS'taki tekrar algılama için zaman eşiği (ms) - iPhone için 5 saniye
    const SIZE_SIMILARITY_THRESHOLD = 300; // İki ses dosyasının benzer kabul edilmesi için maksimum boyut farkı (bytes)

    function processJsonAudio(message) {
        if (message.channel == currentChannel && message.clientId !== clientId) {
            // Veri kontrolü
            if (!message.audioData || typeof message.audioData !== 'string') {
                return;
            }
            
            // Ses verisi işleme
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
                
                // Ses boyutunu kontrol et
                if (audioBlob.size < 100) {
                    return;
                }
                
                // Ses verisi kimliği oluştur (gönderen+zaman bilgisiyle)
                const audioId = `${message.clientId}_${message.timestamp || Date.now()}`;
                
                // Ek bilgilerle birlikte ses verisini kuyruğa ekle
                queueAudioPlayback(audioBlob, audioId, {
                    clientId: message.clientId,
                    timestamp: message.timestamp,
                    dataLength: message.audioData.length
                });
            } catch (e) {
                console.error("Ses verisi dönüştürme hatası:", e);
            }
        }
    }

    // Ses çalma kuyruğunu yönet
    function queueAudioPlayback(audioBlob, audioId, metadata = {}) {
        // iOS'taki ses duplikasyonunu çözmek için ek kontroller
        const [clientId, timestamp] = audioId.split('_');
        const currentTime = Date.now();
        
        // 1. Aynı ID'ye sahip bir ses zaten kuyrukta ya da geçmişte mi?
        const isDuplicateId = audioPlaybackQueue.some(item => item.id === audioId) || 
                             audioHistory.some(item => item.id === audioId);
        
        if (isDuplicateId) {
            console.log("Birebir aynı ses zaten işlenmiş, atlanıyor");
            return;
        }
        
        // 2. iPhone duplikasyon problemi için: Aynı gönderenden yakın zamanda gelen benzer boyutlu sesler
        const hasSimilarRecentAudio = audioHistory.some(history => {
            // Aynı gönderen mi?
            if (history.clientId === clientId) {
                // Yakın zamanlı mı? (3 saniye içinde)
                const timeDiff = Math.abs(currentTime - history.time);
                if (timeDiff < DUPLICATE_TIME_THRESHOLD) {
                    // Ya aynı boyutlu ses dosyası veya benzer boyutlu ses dosyası mı?
                    const sizeDiff = Math.abs(history.size - audioBlob.size);
                    if (sizeDiff < SIZE_SIMILARITY_THRESHOLD) {
                        return true; // iOS tekrarı olabilir
                    }
                    
                    // Ya da ikisi de tam olarak aynı uzunlukta veri içeriyor mu?
                    if (metadata.dataLength && history.dataLength &&
                        metadata.dataLength === history.dataLength) {
                        return true; // Duplike ses verisi
                    }
                }
            }
            return false;
        });
        
        if (hasSimilarRecentAudio) {
            console.log("iPhone ses tekrarı algılandı - atlanıyor");
            return;
        }
        
        // Ses geçmişini güncelle
        audioHistory.push({
            id: audioId,
            time: currentTime,
            size: audioBlob.size,
            clientId: clientId,
            dataLength: metadata.dataLength
        });
        
        // Geçmiş listesini temizle
        cleanupAudioHistory(currentTime);
        
        // Kuyruğa ekle
        audioPlaybackQueue.push({
            blob: audioBlob,
            id: audioId,
            processTime: currentTime,
            clientId: clientId
        });
        
        // Kuyruk işleme
        processAudioQueue();
    }
    
    // Ses geçmişini temizle
    function cleanupAudioHistory(currentTime) {
        // 10 saniyeden eski kayıtları temizle
        const oldestTime = currentTime - 10000; 
        audioHistory = audioHistory.filter(record => record.time > oldestTime);
        
        // Yine de çok fazla kayıt varsa en eskileri çıkar
        if (audioHistory.length > MAX_HISTORY_SIZE) {
            audioHistory = audioHistory.slice(-MAX_HISTORY_SIZE);
        }
    }

    // Kuyruktaki ses dosyalarını sırayla çal
    function processAudioQueue() {
        // Halihazırda ses çalınıyorsa bekle
        if (isCurrentlyPlayingAudio) {
            return;
        }
        
        // Kuyruk boşsa işlem yapma
        if (audioPlaybackQueue.length === 0) {
            return;
        }
        
        // Kuyruktaki ilk ses verisini al
        const nextAudio = audioPlaybackQueue.shift();
        
        // Çalma kilidi
        isCurrentlyPlayingAudio = true;
        
        // Sesi çal
        playAudioFromBlob(nextAudio.blob, () => {
            // Çalma tamamlandı, kilidi kaldır ve sonraki sesi çal
            isCurrentlyPlayingAudio = false;
            setTimeout(() => {
                processAudioQueue();
            }, 300); // Sesler arasında küçük bir boşluk bırak
        });
    }

    // Blob formatındaki ses verisini çal - geliştirilmiş kilit sistemi
    const playAudioFromBlob = (audioBlob, onComplete) => {
        if (!isRadioOn) {
            isCurrentlyPlayingAudio = false;
            if (onComplete) onComplete();
            return;
        }
        
        try {
            // Bip sesi çal
            beepSound.play().catch(err => {
                console.log("Bip sesi hatası:", err);
            }).finally(() => {
                // Bip sesi çalsa da çalmasa da ses verisini çalmaya devam et
                setTimeout(() => {
                    playSoundData(audioBlob, onComplete);
                }, 300);
            });
        } catch (error) {
            // Hata olsa bile ses verisini çalmayı dene
            playSoundData(audioBlob, onComplete);
        }
    };

    // Gerçek ses verisini çalma - geri çağrı (callback) eklenmiş
    const playSoundData = (audioBlob, onComplete) => {
        // Blob boyutu kontrol et
        if (!audioBlob || audioBlob.size === 0) {
            if (onComplete) onComplete();
            return;
        }
        
        // Blob türünü kontrol et ve düzelt
        let correctBlob = audioBlob;
        if (audioBlob.type !== 'audio/webm' && audioBlob.type !== 'audio/mp3' && audioBlob.type !== 'audio/wav') {
            correctBlob = new Blob([audioBlob], { type: 'audio/webm' });
        }
        
        // 1. Yöntem: Audio elementi ile çalma
        try {
            const audioUrl = URL.createObjectURL(correctBlob);
            const audio = new Audio();
            
            let playAttempted = false;
            
            audio.oncanplaythrough = () => {
                // Ses verisini doğrudan oynatma
                if (!playAttempted) {
                    playAttempted = true;
                    audio.play()
                        .then(() => {
                            // Statik sesi kıs
                            if (staticNoise) {
                                staticNoise.setVolume(0.001);
                            }
                        })
                        .catch(err => {
                            // Method 2 ile dene
                            playWithAudioContext(correctBlob, onComplete);
                        });
                }
            };
            
            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                // Statik sesi normale döndür
                if (staticNoise) {
                    staticNoise.setVolume(0.01);
                }
                if (onComplete) onComplete();
            };
            
            audio.onerror = () => {
                URL.revokeObjectURL(audioUrl);
                // Alternatif yöntem ile dene
                playWithAudioContext(correctBlob, onComplete);
            };
            
            // Ses yüklenemezse
            audio.src = audioUrl;
            audio.load();
            
            // Belirli bir süre içinde çalamazsa, alternatif yöntemi kullan
            setTimeout(() => {
                if (!playAttempted) {
                    playWithAudioContext(correctBlob, onComplete);
                    URL.revokeObjectURL(audioUrl);
                }
            }, 2000);
        } catch (error) {
            // Alternatif yöntem dene
            playWithAudioContext(correctBlob, onComplete);
        }
    };

    // 2. Yöntem: Web Audio API kullanarak ses çalma - geri çağrı eklenmiş
    const playWithAudioContext = (blob, onComplete) => {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const fileReader = new FileReader();
            
            fileReader.onload = (event) => {
                const arrayBuffer = event.target.result;
                
                audioContext.decodeAudioData(arrayBuffer)
                    .then(audioBuffer => {
                        // Statik sesi kıs
                        if (staticNoise) {
                            staticNoise.setVolume(0.001);
                        }
                        
                        // Ses kaynağı oluştur
                        const source = audioContext.createBufferSource();
                        source.buffer = audioBuffer;
                        
                        // Ses bittiğinde
                        source.onended = () => {
                            // Statik sesi normale döndür
                            if (staticNoise) {
                                staticNoise.setVolume(0.01);
                            }
                            if (onComplete) onComplete();
                        };
                        
                        // Bağlantıları yap ve çal
                        source.connect(audioContext.destination);
                        source.start(0);
                    })
                    .catch(() => {
                        if (onComplete) onComplete();
                    });
            };
            
            fileReader.onerror = () => {
                if (onComplete) onComplete();
            };
            
            fileReader.readAsArrayBuffer(blob);
        } catch (error) {
            if (onComplete) onComplete();
        }
    };
    
    // Aktif kullanıcı sayısını güncelle
    const updateActiveUsers = (totalCount, channelCounts) => {
        const userCountElement = document.getElementById('users-count');
        if (userCountElement) {
            userCountElement.textContent = `USERS: ${totalCount}`;
        }
        
        // Mevcut kanaldaki kullanıcı sayısını güncelle
        if (channelCounts && channelCounts[currentChannel]) {
            usersInChannel = channelCounts[currentChannel];
            if (usersCountDisplay) {
                usersCountDisplay.textContent = `Kullanıcılar: ${totalCount}`;
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
                console.warn("WebM/Opus desteklenmiyor, alternatif deneniyor");
            }
            
            // Alternatif: Sadece WebM dene
            if (!recorderCreated) {
                try {
                    options = { mimeType: 'audio/webm', audioBitsPerSecond: 32000 };
                    mediaRecorder = new MediaRecorder(stream, options);
                    recorderCreated = true;
                    console.log("MediaRecorder WebM formatında oluşturuldu");
                } catch (e) {
                    console.warn("WebM desteklenmiyor, alternatif deneniyor");
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
                    console.warn("MP3 desteklenmiyor, varsayılan kullanılacak");
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
                console.log("Ses kaydı durduruldu");
                
                if (audioChunks.length === 0) {
                    console.warn("Ses verisi yok, gönderilmiyor");
                    return;
                }
                
                // Ses verisini bir Blob olarak al
                const mimeType = mediaRecorder.mimeType || 'audio/webm';
                const audioBlob = new Blob(audioChunks, { type: mimeType });
                
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
        
        try {
            // Web Audio API ile ses verisini işle
            const fileReader = new FileReader();
            fileReader.onload = (event) => {
                try {
                    const arrayBuffer = event.target.result;
                    
                    // Web Audio API ile ses verisini işle
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    
                    audioContext.decodeAudioData(arrayBuffer).then(() => {
                        // İşlenmiş ses verisini gönder
                        sendAudioData(audioBlob, channelNumber);
                    }).catch(() => {
                        // Hata durumunda ham veriyi gönder
                        sendAudioData(audioBlob, channelNumber);
                    });
                } catch (e) {
                    // Hata durumunda ham veriyi gönder
                    sendAudioData(audioBlob, channelNumber);
                }
            };
            
            fileReader.onerror = () => {
                // Hata durumunda ham veriyi gönder
                sendAudioData(audioBlob, channelNumber);
            };
            
            fileReader.readAsArrayBuffer(audioBlob);
        } catch (error) {
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
        
        // Boyut kontrolü
        if (audioBlob.size > 100000) {
            console.warn("Ses verisi çok büyük, sıkıştırılıyor...");
            // Daha düşük kalite için burada sıkıştırma işlemi yapılabilir
        } else if (audioBlob.size < 1000) {
            console.warn("Ses verisi çok küçük, gönderilmiyor...");
            return;
        }
        
        try {
            // JSON formatında kanal ve kullanıcı bilgisini içeren ses verisi gönder
            const reader = new FileReader();
        
            reader.onloadend = function () {
                try {
                    const result = reader.result;
        
                    if (!result || typeof result !== 'string') {
                        console.error("FileReader sonucu geçersiz");
                        return;
                    }
        
                    if (!result.startsWith("data:audio")) {
                        console.error("Beklenmeyen MIME tipi");
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
                    
                    // JSON formatına dönüştür
                    const jsonData = JSON.stringify(audioMessage);
        
                    // Veriyi gönder
                    socket.send(jsonData);
                    console.log("Ses verisi gönderildi");
        
                } catch (e) {
                    console.error("Ses verisi JSON'a çevrilirken hata:", e);
                }
            };
        
            reader.onerror = function(error) {
                console.error("FileReader hatası:", error);
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
            if (channelDisplay) channelDisplay.style.display = 'block';
            if (usersCountDisplay) usersCountDisplay.style.display = 'block';
            if (channelUpBtn) channelUpBtn.style.display = 'block';
            if (channelDownBtn) channelDownBtn.style.display = 'block';
            if (codeZeroBtn) codeZeroBtn.style.display = 'block';
            
            console.log("Telsiz açıldı");
            document.getElementById("users-count").style.display = "Block";

            radioOnSound.play();
            
            // Statik gürültüyü başlat
            if (!staticNoise) staticNoise = createStaticNoise();
            staticNoise.start();
            
            // WebSocket bağlantısını kur
            connectWebSocket();
            
            // Mevcut kanalı göster
            updateChannelDisplay();
            
            // Mikrofon erişimini kontrol et
            if (!mediaRecorder) requestMicrophoneAccess();
        } else {
            // Telsiz kapalı durumunda güç ışığını kırmızı yap
            powerIndicator.style.backgroundColor = '#333';
            powerIndicator.style.boxShadow = '0 0 5px rgba(0, 0, 0, 0.5)';
            
            // Ekranları gizle
            if (channelDisplay) channelDisplay.style.display = 'none';
            if (usersCountDisplay) usersCountDisplay.style.display = 'none';
            if (peerIdDisplay) peerIdDisplay.style.display = 'none';
            if (channelUpBtn) channelUpBtn.style.display = 'none';
            if (channelDownBtn) channelDownBtn.style.display = 'none';
            if (codeZeroBtn) codeZeroBtn.style.display = 'none';
            
            console.log("Telsiz kapatıldı");
            document.getElementById("users-count").style.display = "none";

            radioOffSound.play();
            
            // Statik gürültüyü durdur
            if (staticNoise) staticNoise.stop();
            
            // Ses kaydını durdur, eğer aktifse
            if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
            
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
            if (channelDisplay) channelDisplay.innerText = '--';
            if (usersCountDisplay) usersCountDisplay.textContent = 'Kullanıcılar: 0';
        }
    };
    
    // Kanal değiştirme fonksiyonu
    const changeChannel = (increment) => {
        if (!isRadioOn) return;
        
        // Ses kaydını durdur (eğer aktifse)
        if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
        
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
            console.log(`${channel} kanalına katılma isteği gönderiliyor...`);
            const joinMessage = {
                type: 'join',
                channel: channel.toString(), // String olarak gönder
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
    
    // Kod 0 Bildirimi Gönderme Fonksiyonu
    const sendCodeZeroNotification = () => {
        if (!isRadioOn) return;
        
        console.log("Kod 0 bildirim isteği gönderiliyor...");
        
        // Kullanıcılara bildirim göndermek için önce izin isteyelim
        if (!("Notification" in window)) {
            alert("Bu tarayıcı bildirim özelliğini desteklemiyor!");
        } else if (Notification.permission === "granted") {
            // Bildirim izni zaten var, bildirim gönder
            sendNotificationToEveryone();
        } else if (Notification.permission !== "denied") {
            // İzin istenmemiş, izin iste
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    sendNotificationToEveryone();
                }
            });
        }
    };
    
    // Tüm kullanıcılara bildirim gönder
    const sendNotificationToEveryone = () => {
        // Kendimize bildirim gönderelim
        showNotification("KOD 0 ACİL DURUM", `${clientId} tarafından KOD 0 acil durum bildirildi!`);
        
        // WebSocket üzerinden diğer kullanıcılara bildirim gönder
        if (socket && socket.readyState === WebSocket.OPEN) {
            const notificationMessage = {
                type: 'notification',
                notificationType: 'codeZero',
                clientId: clientId,
                timestamp: Date.now()
            };
            
            socket.send(JSON.stringify(notificationMessage));
            console.log("Kod 0 bildirimi gönderildi");
        }
    };
    
    // Bildirim gösterme fonksiyonu
    const showNotification = (title, message) => {
        if (!("Notification" in window)) {
            console.warn("Bu tarayıcı bildirim özelliğini desteklemiyor!");
            return;
        }
        
        if (Notification.permission === "granted") {
            // Bildirim göster
            const notification = new Notification(title, {
                body: message,
                icon: "Radio.png", // Bildirim ikonu
                vibrate: [200, 100, 200, 100, 200, 100, 200], // Titreşim deseni
                tag: "codeZeroNotification", // Aynı tip bildirimleri gruplar
                requireInteraction: true // Kullanıcı kapatana kadar açık kalır
            });
            
            // Bildirime tıklama olayı
            notification.onclick = function() {
                console.log("Kod 0 bildirimine tıklandı");
                window.focus();
                notification.close();
            };
            
            // Sesli uyarı çal
            beepSound.play();
        }
    };
    
    // Event Listeners
    
    // Telsiz açma/kapama düğmesi
    toggleBtn.addEventListener('click', toggleRadio);
    
    // Kanal değiştirme düğmeleri
    channelUpBtn.addEventListener('click', () => changeChannel(1));
    channelDownBtn.addEventListener('click', () => changeChannel(-1));
    
    // Konuşma butonunun uzun basılı tutma sorununu çöz
    if (beepBtn) {
        // Ortak dokunmatik ve fare olayları için işlevler
        const startRecording = (e) => {
            e.preventDefault();
            
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
        };
        
        const stopAndResetRecording = () => {
            if (!isRadioOn) return;
            
            // Konuş düğmesi bırakıldığında efekti kaldır
            beepBtn.classList.remove('active-talk');
            
            // Statik gürültüyü normale döndür
            if (staticNoise) {
                staticNoise.setVolume(0.01);
            }
            
            // Kaydı durdur
            stopRecording();
        };
        
        // Standart olayları önle
        ['contextmenu', 'selectstart', 'copy', 'dragstart'].forEach(eventName => {
            beepBtn.addEventListener(eventName, (e) => {
                e.preventDefault();
                return false;
            });
        });
        
        // Dokunmatik olaylar için
        beepBtn.addEventListener('touchstart', startRecording, { passive: false });
        beepBtn.addEventListener('touchend', stopAndResetRecording, { passive: false });
        beepBtn.addEventListener('touchcancel', stopAndResetRecording);
        
        // Mouse olayları için
        beepBtn.addEventListener('mousedown', startRecording);
        beepBtn.addEventListener('mouseup', stopAndResetRecording);
        beepBtn.addEventListener('mouseleave', stopAndResetRecording);
    }
    
    // Kod 0 butonu
    if (codeZeroBtn) {
        codeZeroBtn.addEventListener('click', sendCodeZeroNotification);
    }
    
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
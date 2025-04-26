/**
 * POLİS TELSİZİ SİMÜLATÖRÜ
 * --------------------------
 * Bu script gerçek bir polis telsizini simüle eden web tabanlı bir uygulama oluşturur.
 * WebSocket ve Web Audio API kullanarak gerçek zamanlı sesli iletişim sağlar.
 * 
 * Ana Özellikler:
 * - 16 farklı kanal arasında geçiş yapabilme
 * - Gerçek zamanlı sesli iletişim
 * - Statik parazit sesi simülasyonu
 * - Acil durum (Kod 0) bildirimleri
 * - Güç açma/kapatma ve telsiz görsel efektleri
 * - Kullanıcı sayısı takibi
 */

// Uygulama başlatma - DOM yüklendikten sonra
document.addEventListener('DOMContentLoaded', function() {
    console.log('[SİSTEM] Telsiz uygulaması başlatılıyor...');
    
    // Loglama yardımcı fonksiyonu - gelişmiş, renkli konsolda loglama
    const logger = {
        info: (message) => {
            console.log(`%c[BİLGİ] ${message}`, 'color: #0066ff; font-weight: bold;');
        },
        success: (message) => {
            console.log(`%c[BAŞARILI] ${message}`, 'color: #00cc44; font-weight: bold;');
        },
        warn: (message) => {
            console.warn(`%c[UYARI] ${message}`, 'color: #ffcc00; font-weight: bold;');
        },
        error: (message, error = null) => {
            console.error(`%c[HATA] ${message}`, 'color: #ff3300; font-weight: bold;');
            if (error) {
                console.error('Hata detayı:', error);
            }
        },
        debug: (message, data = null) => {
            if (data) {
                console.log(`%c[DEBUG] ${message}`, 'color: #999999;', data);
            } else {
                console.log(`%c[DEBUG] ${message}`, 'color: #999999;');
            }
        }
    };
    
    logger.info('Telsiz arayüz elementleri yükleniyor...');

    // HTML elementlerini seçme - DOM elementlerini JavaScript değişkenlerine bağlama
    const radioImg = document.getElementById('radio-img');               // Telsiz görseli
    const toggleBtn = document.getElementById('toggle-btn');             // Açma/kapama düğmesi
    const beepBtn = document.getElementById('beep-btn');                 // Konuşma (PTT) düğmesi
    const channelDisplay = document.getElementById('channel-display');   // Kanal göstergesi
    const channelUpBtn = document.getElementById('channel-up');          // Kanal yukarı düğmesi
    const channelDownBtn = document.getElementById('channel-down');      // Kanal aşağı düğmesi
    const usersCountDisplay = document.getElementById('users-count');    // Kullanıcı sayısı göstergesi
    const peerIdDisplay = document.getElementById('peer-id');            // Kullanıcı ID göstergesi
    const codeZeroBtn = document.getElementById('send_code-zero-btn');   // Acil durum (Kod 0) düğmesi
    
    // HTML elementlerinin varlığını kontrol et
    if (!toggleBtn || !beepBtn) {
        logger.error('Kritik UI elementleri bulunamadı! Uygulama düzgün çalışmayabilir.');
    } else {
        logger.success('Tüm arayüz elementleri başarıyla yüklendi.');
    }

    // Ses dosyalarını oluşturma - Telsiz efekt sesleri için Audio nesneleri
    logger.info('Ses dosyaları yükleniyor...');
    
    const radioOnSound = new Audio('Radio_On.mp3');         // Telsiz açılış sesi
    const radioOffSound = new Audio('Radio_Off.mp3');       // Telsiz kapanış sesi
    const beepSound = new Audio('Beep.wav');                // PTT bip sesi
    const code0Sound = new Audio('KOD0_SOUND.mp3');         // Kod 0 acil durum sesi
    
    // Ses dosyaları yükleme kontrolü
    Promise.all([
        new Promise(resolve => {
            radioOnSound.addEventListener('canplaythrough', resolve);
            radioOnSound.addEventListener('error', (e) => {
                logger.error('Açılış sesi yüklenemedi', e);
                resolve();
            });
        }),
        new Promise(resolve => {
            radioOffSound.addEventListener('canplaythrough', resolve);
            radioOffSound.addEventListener('error', (e) => {
                logger.error('Kapanış sesi yüklenemedi', e);
                resolve();
            });
        }),
        new Promise(resolve => {
            beepSound.addEventListener('canplaythrough', resolve);
            beepSound.addEventListener('error', (e) => {
                logger.error('Bip sesi yüklenemedi', e);
                resolve();
            });
        }),
        new Promise(resolve => {
            code0Sound.addEventListener('canplaythrough', resolve);
            code0Sound.addEventListener('error', (e) => {
                logger.error('Kod 0 acil durum sesi yüklenemedi', e);
                resolve();
            });
        })
    ]).then(() => {
        logger.success('Ses dosyaları başarıyla yüklendi.');
    }).catch(err => {
        logger.warn('Bazı ses dosyaları yüklenemedi, uygulama sesleri eksik olabilir.', err);
    });
    
    // Statik gürültü sesi oluşturma - Web Audio API ile gerçek zamanlı beyaz gürültü üretme
    const createStaticNoise = () => {
        logger.debug('Statik gürültü oluşturuluyor...');
        
        try {
            // Web Audio API için context oluşturma
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Script processor node ile özel ses üretimi (beyaz gürültü)
            const noiseNode = audioContext.createScriptProcessor(4096, 1, 1);
            
            // Ses seviyesini kontrol etmek için gain node
            const gainNode = audioContext.createGain();
            
            // Beyaz gürültü üretme fonksiyonu
            noiseNode.onaudioprocess = (e) => {
                const output = e.outputBuffer.getChannelData(0);
                for (let i = 0; i < output.length; i++) {
                    // Her bir ses örneği için -1 ile 1 arasında rastgele değer (beyaz gürültü)
                    output[i] = Math.random() * 2 - 1;
                }
            };
            
            // Gürültü seviyesini düşük ayarlama
            gainNode.gain.value = 0.01; // %1 seviyesinde başlat
            
            // Ses yolunu bağlama: noise -> gain -> output
            noiseNode.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            logger.success('Statik gürültü modülü başarıyla oluşturuldu.');
            
            // Kontrol arayüzü döndür
            return {
                // Statik sesi başlatma
                start: () => {
                    logger.debug('Statik gürültü başlatıldı');
                    gainNode.gain.value = 0.01;
                },
                
                // Statik sesi durdurma
                stop: () => {
                    logger.debug('Statik gürültü durduruldu');
                    gainNode.gain.value = 0;
                },
                
                // Statik ses seviyesini ayarlama
                setVolume: (vol) => {
                    gainNode.gain.value = vol;
                    logger.debug(`Statik gürültü seviyesi: ${vol}`);
                },
                
                // Kontexte doğrudan erişim
                context: audioContext
            };
        } catch (error) {
            logger.error('Statik gürültü oluşturulurken hata!', error);
            // Başarısız olursa boş bir kontrol nesnesi döndür (null-safe)
            return {
                start: () => {},
                stop: () => {},
                setVolume: () => {},
                context: null
            };
        }
    };
    
    // Telsiz durumu ve ana değişkenler - uygulama durum değişkenleri
    let isRadioOn = false;       // Telsizin açık/kapalı durumu
    let currentChannel = 1;      // Aktif kanal (1-16 arası)
    let staticNoise = null;      // Statik gürültü kontrolörü
    let stream = null;           // Mikrofon akışı
    let mediaRecorder = null;    // Ses kayıt kontrolörü
    let usersInChannel = 0;      // Mevcut kanaldaki kullanıcı sayısı
    
    // WebSocket değişkenleri - sunucu iletişimi
    let socket = null;           // WebSocket bağlantısı
    let clientId = null;         // Kullanıcı kimliği
    const serverUrl = 'wss://policeradiosim.onrender.com/'; // WebSocket sunucu URL'i
    
    logger.info('Uygulama başlangıç değişkenleri ayarlandı.');
    logger.debug('Kullanılacak WebSocket sunucusu:', serverUrl);
    
    // Güç ışığı ekleyerek telsizin durumunu görselleştirme
    const createPowerIndicator = () => {
        logger.debug('Güç göstergesi ışığı oluşturuluyor...');
        
        // Yeni div elementi oluştur
        const indicator = document.createElement('div');
        
        // CSS sınıfı ve stilleri
        indicator.classList.add('power-indicator');
        indicator.style.position = 'absolute';
        indicator.style.top = '26%';
        indicator.style.right = '64%';
        indicator.style.width = '20px';
        indicator.style.height = '20px';
        indicator.style.borderRadius = '50%';
        indicator.style.backgroundColor = '#333';  // Başlangıçta kapalı (koyu gri)
        indicator.style.boxShadow = '0 0 5px rgba(0, 0, 0, 0.5)';
        indicator.style.transition = 'all 0.3s ease'; // Yumuşak geçiş efekti
        
        // Telsiz görseli içine ekle
        const wrapper = document.querySelector('.radio-wrapper');
        if (wrapper) {
            wrapper.appendChild(indicator);
            logger.success('Güç göstergesi başarıyla oluşturuldu.');
        } else {
            logger.error('Güç göstergesi eklenemedi - telsiz container bulunamadı!');
        }
        
        return indicator;
    };
    
    // Güç gösterge ışığını oluştur
    const powerIndicator = createPowerIndicator();
    
    /**
     * =====================================================
     * WEBSOCKET BAĞLANTI YÖNETİMİ
     * =====================================================
     * Aşağıdaki fonksiyonlar, sunucu ile gerçek zamanlı iletişim için
     * WebSocket bağlantısının kurulması, yönetilmesi ve mesaj alışverişini sağlar.
     */
    
    // WebSocket bağlantısı kurma - Sunucu ile gerçek zamanlı bağlantı oluşturma
    const connectWebSocket = () => {
        try {
            logger.info(`WebSocket bağlantısı kuruluyor: ${serverUrl}`);
            
            // Yeni WebSocket bağlantısı oluşturma
            socket = new WebSocket(serverUrl);
            
            // Bağlantı kurulduğunda tetiklenir
            socket.onopen = () => {
                logger.success('WebSocket bağlantısı başarıyla kuruldu');
                
                // Bağlantı durumunu UI'da gösterme (eğer UI elementi varsa)
                const connectionStatus = document.getElementById('connectionStatus');
                if (connectionStatus) {
                    connectionStatus.innerText = 'Bağlı';
                    connectionStatus.className = 'connected';
                }
                
                // Kullanıcı için benzersiz ID oluşturma
                clientId = 'client_' + Math.random().toString(36).substring(2, 9);
                logger.debug(`Benzersiz istemci ID oluşturuldu: ${clientId}`);
                
                // Kullanıcı ID'sini gösterge ekranında gösterme
                if (peerIdDisplay) {
                    peerIdDisplay.textContent = `ID: ${clientId}`;
                    peerIdDisplay.style.display = 'block';
                    logger.debug('Peer ID ekranda gösterildi');
                }
                
                // Bağlantı kurulduğunda mevcut kanala katılma
                joinChannel(currentChannel);
                logger.info(`Otomatik olarak Kanal #${currentChannel}'e katılınıyor...`);
                
                // Kullanıcı sayısını gösterge ekranında gösterme
                if (usersCountDisplay) {
                    usersCountDisplay.textContent = 'USERS: ...';
                    usersCountDisplay.style.display = 'block';
                    logger.debug('Kullanıcı sayısı göstergesi aktifleştirildi');
                }
            };
            
            // Bağlantı kapandığında tetiklenir
            socket.onclose = (event) => {
                logger.warn(`WebSocket bağlantısı kapandı: Kod: ${event.code}, Sebep: ${event.reason || 'Belirtilmemiş'}`);
                
                // Bağlantı durumunu UI'da güncelleme
                const connectionStatus = document.getElementById('connectionStatus');
                if (connectionStatus) {
                    connectionStatus.innerText = 'Bağlantı Kesildi';
                    connectionStatus.className = 'disconnected';
                }
                
                // Eğer telsiz açıksa yeniden bağlanmayı deneme
                if (isRadioOn) {
                    logger.info('Telsiz açık durumda, 3 saniye içinde yeniden bağlanmayı deneyecek');
                    setTimeout(connectWebSocket, 3000);
                }
            };
            
            // Bağlantı hatası oluştuğunda tetiklenir
            socket.onerror = (error) => {
                logger.error('WebSocket bağlantı hatası oluştu', error);
                
                // Bağlantı durumunu UI'da gösterme
                const connectionStatus = document.getElementById('connectionStatus');
                if (connectionStatus) {
                    connectionStatus.innerText = 'Bağlantı Hatası';
                    connectionStatus.className = 'error';
                }
            };
            
            // Sunucudan mesaj geldiğinde tetiklenir
            socket.onmessage = (event) => {
                // Özel mesaj işleme fonksiyonunu çağır
                handleWebSocketMessage(event);
            };
        } catch (error) {
            logger.error("WebSocket bağlantısı kurulamadı!", error);
            
            // Bağlantı durumunu UI'da gösterme
            const connectionStatus = document.getElementById('connectionStatus');
            if (connectionStatus) {
                connectionStatus.innerText = 'Bağlantı Hatası';
                connectionStatus.className = 'error';
            }
            
            // Eğer telsiz açıksa yeniden bağlanmayı deneme
            if (isRadioOn) {
                logger.info('Bağlantı hatası sonrası 3 saniye içinde yeniden bağlanmayı deneyecek');
                setTimeout(connectWebSocket, 3000);
            }
        }
    };
    
    /**
     * WebSocket Mesaj İşleme
     * ----------------------
     * Sunucudan gelen mesajları türlerine göre işler:
     * - Ses verileri
     * - Kullanıcı sayısı güncellemeleri
     * - Acil durum bildirimleri
     * - Sistem mesajları
     */
    const handleWebSocketMessage = async (event) => {
        try {
            // Performans izleme - mesaj işleme süresi
            const startTime = performance.now();
            
            // Gelen veri Blob mu yoksa String mi kontrol et
            if (event.data instanceof Blob) {
                logger.debug('Blob formatında veri alındı, boyut: ' + event.data.size + ' bytes');
                
                // Blob'u metin olarak yorumla, JSON ses verisi olabilir
                const blobText = await new Response(event.data).text();
                if (blobText.startsWith('{') && blobText.includes('"type":"audio"')) {
                    logger.debug('Blob içerisinde JSON ses verisi tespit edildi');
                    const jsonData = JSON.parse(blobText);
                    processJsonAudio(jsonData);
                    return;
                }
                
                // Diğer durumda doğrudan ses verisi olarak çal
                logger.debug('Ham ses verisi olarak işleniyor');
                playAudioFromBlob(event.data);
                return;
            }
            
            // String mesajı kontrol et
            const messageStr = event.data;
            
            // Hoşgeldin mesajlarını atla
            if (typeof messageStr === 'string' && messageStr.startsWith('Welcome')) {
                logger.debug('Sunucu hoş geldin mesajı: ' + messageStr);
                return;
            }
            
            // JSON mesajını parse et
            if (typeof messageStr === 'string') {
                try {
                    const message = JSON.parse(messageStr);
                    logger.debug('JSON mesajı alındı, tür: ' + message.type);
                    
                    // Mesaj türüne göre farklı işlemler
                    switch (message.type) {
                        case 'audio':
                            // Ses verisi - sunucudan gelen ses verisini işle
                            logger.debug(`Ses verisi alındı, kanal: ${message.channel}, gönderen: ${message.clientId}`);
                            processJsonAudio(message);
                            break;
                            
                        // Yeni case: Kod 0 ses echo'su
                        case 'code0Sound':
                            // Kod 0 ses yayını geldi, tüm kanallarda çal
                            logger.warn(`⚠️ KOD 0 ACİL DURUM SESİ: ${message.senderId} tarafından başlatıldı!`);
                            logger.debug(`KOD0 mesajı ayrıntıları: ${JSON.stringify(message)}`);
                            
                            // Kendi gönderdiğimiz mesaj ise (echo değilse) tekrar çalmıyalım
                            if (message.senderId === clientId && !message.server_echo) {
                                logger.debug("Kendi gönderdiğimiz KOD0 mesajı, tekrar çalmıyoruz");
                                // Sadece bildirim göster
                                showNotification("KOD 0 ACİL DURUM", `${message.senderId} tarafından KOD 0 acil durum bildirildi!`);
                            } else {
                                // Diğer kullanıcıların mesajı veya sunucu tarafından echo edilmiş mesaj
                                logger.debug("Diğer kullanıcının veya sunucu echo'su olan KOD0 mesajı, çalıyoruz");
                                showNotification("KOD 0 ACİL DURUM", `${message.senderId} tarafından KOD 0 acil durum bildirildi!`);
                                // Ses dosyasını oynat
                                playCode0Sound();
                            }
                            break;
                            
                        case 'userCount':
                            // Kullanıcı sayısı güncellemesi
                            logger.info(`Kullanıcı sayısı güncellendi: Toplam: ${message.count} kullanıcı`);
                            logger.debug('Kanal dağılımı:', message.channelCounts);
                            updateActiveUsers(message.count, message.channelCounts);
                            break;
                            
                        case 'clientId':
                            // Sunucu tarafından atanan müşteri ID'si
                            clientId = message.id;
                            logger.info(`Sunucu tarafından atanan ID: ${clientId}`);
                            if (peerIdDisplay) {
                                peerIdDisplay.textContent = `ID: ${clientId}`;
                            }
                            break;
                            
                        case 'join':
                            // Kanal katılım bilgisi
                            if (message.channelUsers) {
                                usersInChannel = message.channelUsers;
                                logger.info(`Kanal ${message.channel || currentChannel} katılım: ${usersInChannel} kullanıcı`);
                                if (usersCountDisplay) {
                                    usersCountDisplay.textContent = `USERS: ${usersInChannel}`;
                                }
                            }
                            break;
                            
                        case 'notification':
                            // Bildirim mesajı
                            if (message.notificationType === 'codeZero') {
                                logger.warn(`⚠️ KOD 0 ACİL DURUM: ${message.clientId} tarafından bildirdi!`);
                                showNotification("KOD 0 ACİL DURUM", `${message.clientId} tarafından KOD 0 acil durum bildirildi!`);
                            }
                            break;
                            
                        case 'error':
                            // Hata mesajı
                            logger.error(`Sunucu hatası: ${message.message}`);
                            alert(`Sunucu hatası: ${message.message}`);
                            break;
                            
                        default:
                            // Bilinmeyen mesaj türü
                            logger.warn(`Bilinmeyen mesaj türü: ${message.type}`);
                    }
                } catch (jsonError) {
                    logger.warn("Mesaj JSON formatında değil veya parse edilemiyor", jsonError);
                    logger.debug("Ham mesaj içeriği:", messageStr);
                }
            }
            
            // Performans ölçümünü bitir
            const processingTime = performance.now() - startTime;
            if (processingTime > 50) {  // 50ms'den uzun süren işlemleri logla
                logger.warn(`WebSocket mesaj işleme süresi uzun: ${processingTime.toFixed(2)}ms`);
            }
        } catch (error) {
            logger.error("WebSocket mesaj işleme sırasında genel hata oluştu!", error);
        }
    };
    
    /**
     * =====================================================
     * SES VERİSİ İŞLEME VE ÇALMA
     * =====================================================
     * Aşağıdaki fonksiyonlar ses verilerinin işlenmesi, duplikasyon
     * kontrolü ve çalınması için gerekli mantığı içerir.
     */
    
    // Ses verisi işleme ve duplikasyon kontrolü için değişkenler
    let isCurrentlyPlayingAudio = false;             // Şu anda ses çalınıyor mu?
    let audioPlaybackQueue = [];                     // Çalınacak ses dosyaları kuyruğu
    let audioHistory = [];                           // Son çalınan ses dosyalarının geçmişi
    const MAX_HISTORY_SIZE = 20;                     // Saklanan geçmiş kayıt sayısı
    const DUPLICATE_TIME_THRESHOLD = 5000;           // Duplike ses algılama zaman eşiği (ms)
    const SIZE_SIMILARITY_THRESHOLD = 300;           // Benzer ses boyutu eşiği (bytes)

    /**
     * JSON Audio İşleme
     * -----------------
     * Sunucudan gelen ses verilerini ayrıştırır, duplikasyon kontrolü yapar
     * ve çalma kuyruğuna ekler.
     */
    function processJsonAudio(message) {
        if (message.channel == currentChannel && message.clientId !== clientId) {
            // Veri kontrolü
            if (!message.audioData || typeof message.audioData !== 'string') {
                logger.warn("Geçersiz ses verisi formatı, işlem atlanıyor.");
                return;
            }
            
            // Ses verisi işleme
            try {
                logger.debug(`Ses verisi işleniyor: Kanal #${message.channel}, Gönderen: ${message.clientId}`);
                
                // Base64 kodlu ses verisini ikili (binary) formata dönüştür
                const binaryAudio = atob(message.audioData);
                const arrayBuffer = new ArrayBuffer(binaryAudio.length);
                const uint8Array = new Uint8Array(arrayBuffer);
                
                for (let i = 0; i < binaryAudio.length; i++) {
                    uint8Array[i] = binaryAudio.charCodeAt(i);
                }
                
                // Doğru MIME tipi ile Blob oluştur
                const mimeType = message.format || 'audio/webm';
                const audioBlob = new Blob([arrayBuffer], { type: mimeType });
                
                // Ses boyutunu kontrol et (çok küçük ses verilerini atla)
                if (audioBlob.size < 100) {
                    logger.warn("Ses verisi çok küçük, muhtemelen boş: " + audioBlob.size + " bytes");
                    return;
                }
                
                // Ses verisi kimliği oluştur (gönderen+zaman bilgisiyle)
                const audioId = `${message.clientId}_${message.timestamp || Date.now()}`;
                logger.debug(`Ses kimliği oluşturuldu: ${audioId}, boyut: ${audioBlob.size} bytes, format: ${mimeType}`);
                
                // Ek bilgilerle birlikte ses verisini kuyruğa ekle
                queueAudioPlayback(audioBlob, audioId, {
                    clientId: message.clientId,
                    timestamp: message.timestamp,
                    dataLength: message.audioData.length
                });
            } catch (e) {
                logger.error("Ses verisi dönüştürme hatası:", e);
            }
        }
    }

    function sendMP3FileToAllUsers() {
        fetch("KOD0_SOUND.mp3")
            .then(response => response.blob())
            .then(blob => {
                // MP3 için MIME tipini ayarla
                const mp3Blob = new Blob([blob], { type: 'audio/mp3' });
                
                // Doğrudan gönder veya normalize et (önerilen)
                // normalizeAudioFormat(mp3Blob, currentChannel);
                
                // Alternatif olarak doğrudan gönderilebilir
                sendAudioData(mp3Blob, currentChannel);
            })
            .catch(error => {
                console.error("MP3 dosyası yüklenirken hata oluştu:", error);
            });
    }

    /**
     * Ses Çalma Kuyruğu Yönetimi
     * ---------------------------
     * Ses verilerini bir kuyruğa ekler, duplikasyon kontrolü yapar ve
     * sırayla çalınmasını sağlar. iOS cihazlarda oluşabilecek tekrar
     * sorunlarına karşı özel kontroller içerir.
     */
    function queueAudioPlayback(audioBlob, audioId, metadata = {}) {
        // Performans izleme başlat
        const queueStart = performance.now();
        
        // iOS'taki ses duplikasyonunu çözmek için ek kontroller
        const [clientId, timestamp] = audioId.split('_');
        const currentTime = Date.now();
        
        // 1. Aynı ID'ye sahip bir ses zaten kuyrukta ya da geçmişte mi?
        const isDuplicateId = audioPlaybackQueue.some(item => item.id === audioId) || 
                             audioHistory.some(item => item.id === audioId);
        
        if (isDuplicateId) {
            logger.warn(`Ses duplikasyonu engellendi: ${audioId} - Tam eşleşme`);
            return;
        }
        
        // 2. iPhone duplikasyon problemi için: Aynı gönderenden yakın zamanda gelen benzer boyutlu sesler
        const hasSimilarRecentAudio = audioHistory.some(history => {
            // Aynı gönderen mi?
            if (history.clientId === clientId) {
                // Yakın zamanlı mı? (5 saniye içinde)
                const timeDiff = Math.abs(currentTime - history.time);
                if (timeDiff < DUPLICATE_TIME_THRESHOLD) {
                    // Ya aynı boyutlu ses dosyası veya benzer boyutlu ses dosyası mı?
                    const sizeDiff = Math.abs(history.size - audioBlob.size);
                    if (sizeDiff < SIZE_SIMILARITY_THRESHOLD) {
                        logger.debug(`iOS ses duplikasyonu engellendi: Aynı gönderen (${clientId}), zaman farkı ${timeDiff}ms, boyut farkı ${sizeDiff} bytes`);
                        return true; // iOS tekrarı olabilir
                    }
                    
                    // Ya da ikisi de tam olarak aynı uzunlukta veri içeriyor mu?
                    if (metadata.dataLength && history.dataLength &&
                        metadata.dataLength === history.dataLength) {
                        logger.debug(`Ses duplikasyonu engellendi: Aynı uzunlukta veri (${metadata.dataLength} bytes)`);
                        return true; // Duplike ses verisi
                    }
                }
            }
            return false;
        });
        
        if (hasSimilarRecentAudio) {
            logger.warn(`Ses duplikasyonu engellendi: ${audioId} - Benzer içerik`);
            return;
        }
        
        // Performans ölçümü - duplikasyon kontrolü
        const dupCheckTime = performance.now() - queueStart;
        if (dupCheckTime > 20) {
            logger.warn(`Duplikasyon kontrolü yavaş: ${dupCheckTime.toFixed(2)}ms`);
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
        
        logger.debug(`Ses kuyruğa eklendi. Şu anda kuyrukta ${audioPlaybackQueue.length} ses var.`);
        
        // Kuyruk işleme
        processAudioQueue();
    }
    
    /**
     * Ses Geçmişi Temizleme
     * ---------------------
     * Eski ses kayıtlarını geçmiş listesinden temizler.
     * Bu, hafıza kullanımını azaltır ve duplikasyon kontrolünü hızlandırır.
     */
    function cleanupAudioHistory(currentTime) {
        // 10 saniyeden eski kayıtları temizle
        const oldestTime = currentTime - 10000; 
        const initialLength = audioHistory.length;
        audioHistory = audioHistory.filter(record => record.time > oldestTime);
        
        // Eğer çok kayıt silindiyse log yap
        if (initialLength - audioHistory.length > 5) {
            logger.debug(`Ses geçmişinden ${initialLength - audioHistory.length} eski kayıt temizlendi.`);
        }
        
        // Yine de çok fazla kayıt varsa en eskileri çıkar
        if (audioHistory.length > MAX_HISTORY_SIZE) {
            const removedCount = audioHistory.length - MAX_HISTORY_SIZE;
            audioHistory = audioHistory.slice(-MAX_HISTORY_SIZE);
            logger.debug(`Maksimum geçmiş boyutu aşıldı, ${removedCount} eski kayıt kaldırıldı.`);
        }
    }

    /**
     * Ses Kuyruğu İşleme
     * ------------------
     * Kuyruktaki ses dosyalarını sırayla ve birbiri ardına çalar.
     * Kilitleme mekanizması sayesinde sesler üst üste binmez.
     */
    function processAudioQueue() {
        // Halihazırda ses çalınıyorsa bekle
        if (isCurrentlyPlayingAudio) {
            logger.debug("Başka bir ses çalınıyor, kuyruk bekletiliyor.");
            return;
        }
        
        // Kuyruk boşsa işlem yapma
        if (audioPlaybackQueue.length === 0) {
            return;
        }
        
        // Kuyruktaki ilk ses verisini al
        const nextAudio = audioPlaybackQueue.shift();
        logger.debug(`Kuyruktan ses çalınıyor: ${nextAudio.id}`);
        
        // Çalma kilidi
        isCurrentlyPlayingAudio = true;
        
        // Sesi çal
        playAudioFromBlob(nextAudio.blob, () => {
            // Çalma tamamlandı, kilidi kaldır ve sonraki sesi çal
            logger.debug(`Ses çalma tamamlandı: ${nextAudio.id}`);
            isCurrentlyPlayingAudio = false;
            setTimeout(() => {
                processAudioQueue();
            }, 300); // Sesler arasında küçük bir boşluk bırak
        });
    }

    /**
     * Blob'dan Ses Çalma
     * ------------------
     * Blob formatındaki ses verisini çalmak için ana fonksiyon.
     * Önce bip sesi çalar, ardından asıl ses verisini oynatır.
     */
    const playAudioFromBlob = (audioBlob, onComplete) => {
        if (!isRadioOn) {
            logger.debug("Telsiz kapalı, ses çalınmıyor.");
            isCurrentlyPlayingAudio = false;
            if (onComplete) onComplete();
            return;
        }
        
        try {
            // Bip sesi çal
            logger.debug("Ses çalmadan önce bip sesi çalınıyor");
            beepSound.play().catch(err => {
                logger.warn("Bip sesi çalma hatası:", err);
            }).finally(() => {
                // Bip sesi çalsa da çalmasa da ses verisini çalmaya devam et
                setTimeout(() => {
                    playSoundData(audioBlob, onComplete);
                }, 300);
            });
        } catch (error) {
            // Hata olsa bile ses verisini çalmayı dene
            logger.error("Bip sesi genel hatası, doğrudan sese geçiliyor", error);
            playSoundData(audioBlob, onComplete);
        }
    };

    /**
     * Gerçek Ses Verisini Çalma
     * -------------------------
     * Ham ses verisini çalmak için farklı yöntemler dener.
     * Başarısız olursa alternatif çalma yöntemlerine geçiş yapar.
     */
    const playSoundData = (audioBlob, onComplete) => {
        // Blob boyutu kontrol et
        if (!audioBlob || audioBlob.size === 0) {
            logger.warn("Geçersiz veya boş ses dosyası, çalma atlanıyor");
            if (onComplete) onComplete();
            return;
        }
        
        // Blob türünü kontrol et ve düzelt
        let correctBlob = audioBlob;
        if (audioBlob.type !== 'audio/webm' && audioBlob.type !== 'audio/mp3' && audioBlob.type !== 'audio/wav') {
            logger.debug(`Bilinmeyen ses format türü: ${audioBlob.type}, audio/webm olarak varsayılıyor`);
            correctBlob = new Blob([audioBlob], { type: 'audio/webm' });
        }
        
        // 1. Yöntem: Audio elementi ile çalma
        try {
            logger.debug(`Ses çalınıyor (HTML5 Audio): Boyut: ${correctBlob.size} bytes, Format: ${correctBlob.type}`);
            const audioUrl = URL.createObjectURL(correctBlob);
            const audio = new Audio();
            
            let playAttempted = false;
            
            audio.oncanplaythrough = () => {
                // Ses verisini doğrudan oynatma
                if (!playAttempted) {
                    playAttempted = true;
                    logger.debug("Ses çalmaya hazır, başlatılıyor");
                    audio.play()
                        .then(() => {
                            // Statik sesi kıs
                            if (staticNoise) {
                                staticNoise.setVolume(0.001);
                                logger.debug("Statik gürültü ses seviyesi konuşma için kısıldı");
                            }
                        })
                        .catch(err => {
                            // Method 2 ile dene
                            logger.warn("HTML5 Audio çalma başarısız, Web Audio API deneniyor", err);
                            playWithAudioContext(correctBlob, onComplete);
                        });
                }
            };
            
            audio.onended = () => {
                logger.debug("Ses çalma tamamlandı");
                URL.revokeObjectURL(audioUrl);
                // Statik sesi normale döndür
                if (staticNoise) {
                    staticNoise.setVolume(0.01);
                    logger.debug("Statik gürültü ses seviyesi normale döndürüldü");
                }
                if (onComplete) onComplete();
            };
            
            audio.onerror = (e) => {
                logger.error(`Ses çalma hatası: ${audio.error?.message || 'Bilinmeyen hata'}`, e);
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
                    logger.warn("Ses çalma zaman aşımı (2 saniye), Web Audio API deneniyor");
                    playWithAudioContext(correctBlob, onComplete);
                    URL.revokeObjectURL(audioUrl);
                }
            }, 2000);
        } catch (error) {
            // Alternatif yöntem dene
            logger.error("HTML5 Audio çalma hatası, Web Audio API deneniyor", error);
            playWithAudioContext(correctBlob, onComplete);
        }
    };

    /**
     * Web Audio API ile Ses Çalma (Alternatif Yöntem)
     * ----------------------------------------------
     * HTML5 Audio başarısız olursa, Web Audio API ile ses çalmayı dener.
     * Daha düşük seviyeli ve daha güvenilir bir yaklaşımdır.
     */
    const playWithAudioContext = (blob, onComplete) => {
        try {
            logger.debug("Web Audio API ile ses çalma deneniyor...");
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const fileReader = new FileReader();
            
            fileReader.onload = (event) => {
                const arrayBuffer = event.target.result;
                
                audioContext.decodeAudioData(arrayBuffer)
                    .then(audioBuffer => {
                        logger.debug("Ses verisi başarıyla decode edildi, çalınıyor");
                        // Statik sesi kıs
                        if (staticNoise) {
                            staticNoise.setVolume(0.001);
                        }
                        
                        // Ses kaynağı oluştur
                        const source = audioContext.createBufferSource();
                        source.buffer = audioBuffer;
                        
                        // Ses bittiğinde
                        source.onended = () => {
                            logger.debug("Web Audio API ses çalma tamamlandı");
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
                    .catch((err) => {
                        logger.error("Ses decode etme hatası", err);
                        if (onComplete) onComplete();
                    });
            };
            
            fileReader.onerror = (error) => {
                logger.error("FileReader hatası", error);
                if (onComplete) onComplete();
            };
            
            fileReader.readAsArrayBuffer(blob);
        } catch (error) {
            logger.error("Web Audio API ile ses çalma hatası", error);
            if (onComplete) onComplete();
        }
    };
    
    // Aktif kullanıcı sayısını güncelle
    const updateActiveUsers = (totalCount, channelCounts) => {
        const userCountElement = document.getElementById('users-count');
        if (userCountElement) {
            userCountElement.textContent = `USERS: ${totalCount}`;
            logger.debug(`Toplam kullanıcı sayısı güncellendi: ${totalCount}`);
        }
        
        // Mevcut kanaldaki kullanıcı sayısını güncelle
        if (channelCounts && channelCounts[currentChannel]) {
            usersInChannel = channelCounts[currentChannel];
            logger.debug(`Kanal #${currentChannel} kullanıcı sayısı: ${usersInChannel}`);
        }
        
        const channelCountElement = document.getElementById('channelCount');
        if (channelCountElement) {
            let channelText = '';
            
            // Her kanal için kullanıcı sayısını göster
            for (const [channel, count] of Object.entries(channelCounts)) {
                channelText += `Kanal ${channel}: ${count} kullanıcı<br>`;
            }
            
            channelCountElement.innerHTML = channelText;
            logger.debug('Kanal kullanıcı dağılımı güncellendi');
        }
    };
    
    /**
     * =====================================================
     * MİKROFON VE SES KAYIT YÖNETİMİ
     * =====================================================
     * Aşağıdaki fonksiyonlar, mikrofondan ses kaydı alınması ve
     * WebSocket üzerinden diğer kullanıcılara gönderilmesini sağlar.
     */
    
    // Mikrofon erişimi için izin iste ve MediaRecorder ayarla
    const requestMicrophoneAccess = async () => {
        logger.info("Mikrofon erişimi isteniyor...");
        try {
            // Kullanıcıdan mikrofon erişim izni iste
            stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,    // Yankı engelleme
                    noiseSuppression: true,    // Gürültü bastırma
                    autoGainControl: true,     // Otomatik kazanç kontrolü
                    sampleRate: 44100,         // 44.1kHz örnekleme hızı
                    channelCount: 1            // Mono ses
                }
            });
            logger.success('Mikrofon erişimi başarıyla alındı');
            
            // MediaRecorder oluştur (farklı tarayıcıların desteklediği format seçenekleri dene)
            let options;
            let recorderCreated = false;
            
            // WebM formatını dene (en yaygın desteklenen)
            try {
                options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 };
                mediaRecorder = new MediaRecorder(stream, options);
                recorderCreated = true;
                logger.success("MediaRecorder WebM/Opus formatında başarıyla oluşturuldu");
            } catch (e) {
                logger.warn("WebM/Opus codec'i desteklenmiyor, alternatif deneniyor", e);
            }
            
            // Alternatif: Sadece WebM dene (codec belirtmeden)
            if (!recorderCreated) {
                try {
                    options = { mimeType: 'audio/webm', audioBitsPerSecond: 32000 };
                    mediaRecorder = new MediaRecorder(stream, options);
                    recorderCreated = true;
                    logger.success("MediaRecorder genel WebM formatında başarıyla oluşturuldu");
                } catch (e) {
                    logger.warn("WebM formatı desteklenmiyor, alternatif deneniyor", e);
                }
            }
            
            // Alternatif: MP3 dene (bazı tarayıcılar destekler)
            if (!recorderCreated) {
                try {
                    options = { mimeType: 'audio/mp3', audioBitsPerSecond: 32000 };
                    mediaRecorder = new MediaRecorder(stream, options);
                    recorderCreated = true;
                    logger.success("MediaRecorder MP3 formatında başarıyla oluşturuldu");
                } catch (e) {
                    logger.warn("MP3 formatı desteklenmiyor, varsayılan format kullanılacak", e);
                }
            }
            
            // Son alternatif: Varsayılan codec'i kullan
            if (!recorderCreated) {
                try {
                    mediaRecorder = new MediaRecorder(stream);
                    logger.success(`MediaRecorder varsayılan formatta oluşturuldu: ${mediaRecorder.mimeType}`);
                    recorderCreated = true;
                } catch (e) {
                    logger.error("MediaRecorder oluşturulamadı, ses kaydı çalışmayacak", e);
                    alert("Ses kaydedici oluşturulamadı. Tarayıcınız desteklemeyebilir.");
                    return false;
                }
            }
            
            // Kaydedilen ses parçalarını toplamak için dizi
            let audioChunks = [];
            
            // Ses verisi geldiğinde çalışacak fonksiyon
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    logger.debug(`Ses parçası alındı: ${event.data.size} bytes`);
                    audioChunks.push(event.data);
                } else {
                    logger.warn("Boş ses parçası alındı, kaydedilmiyor");
                }
            };
            
            // Kayıt durdurulduğunda çalışacak fonksiyon
            mediaRecorder.onstop = () => {
                logger.debug("Ses kaydı durduruldu, işleniyor...");
                
                // Ses parçalarının varlığını kontrol et
                if (audioChunks.length === 0) {
                    logger.warn("İşlenecek ses verisi bulunamadı");
                    return;
                }
                
                // Tüm ses parçalarını birleştirerek bir Blob oluştur
                const mimeType = mediaRecorder.mimeType || 'audio/webm';
                const audioBlob = new Blob(audioChunks, { type: mimeType });
                
                // Blob boyutunu kontrol et (çok küçük verileri gönderme)
                if (audioBlob.size < 1000) {
                    logger.warn(`Ses verisi çok küçük (${audioBlob.size} bytes), muhtemelen kayıt başarısız oldu`);
                    audioChunks = [];
                    return;
                }
                
                logger.debug(`Ses verisi işlenmeye hazır: ${audioBlob.size} bytes, format: ${mimeType}`);
                
                // Ses formatını düzenle ve gönder
                normalizeAudioFormat(audioBlob, currentChannel);
                
                // Ses parçalarını temizle (bellek kullanımını azalt)
                audioChunks = [];
            };
            
            return true;
        } catch (error) {
            logger.error('Mikrofon erişimi sağlanamadı', error);
            alert('Mikrofon erişimi sağlanamadı. Lütfen tarayıcı izinlerini kontrol edin. Hata: ' + error.message);
            return false;
        }
    };
    
    /**
     * Ses Formatını Normalleştirme ve Gönderme
     * ---------------------------------------
     * Kaydedilen ses verisini sunucuya gönderilmeye uygun hale getirir
     * ve WebSocket üzerinden diğer kullanıcılara gönderir.
     */
    const normalizeAudioFormat = (audioBlob, channelNumber) => {
        // Blob boyutu kontrolü
        if (!audioBlob || audioBlob.size < 1000) {
            logger.error(`Geçersiz ses verisi: ${audioBlob?.size || 0} bytes`);
            return;
        }
        
        logger.debug(`Ses verisi normalleştiriliyor: Kanal #${channelNumber}, ${audioBlob.size} bytes`);
        
        try {
            // Web Audio API ile ses verisini işle ve doğrula
            const fileReader = new FileReader();
            fileReader.onload = (event) => {
                try {
                    const arrayBuffer = event.target.result;
                    
                    // Web Audio API ile ses verisini işle ve doğrula
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    
                    audioContext.decodeAudioData(arrayBuffer).then(() => {
                        // İşlenmiş ses verisi başarıyla doğrulandı, gönder
                        logger.debug("Ses doğrulaması başarılı, veri gönderiliyor");
                        sendAudioData(audioBlob, channelNumber);
                    }).catch((err) => {
                        // Ses verisi doğrulanamadı ama yine de göndermeyi dene
                        logger.warn("Ses doğrulama hatası, yine de gönderiliyor", err);
                        sendAudioData(audioBlob, channelNumber);
                    });
                } catch (e) {
                    // Hata durumunda ham veriyi göndermeyi dene
                    logger.warn("Ses işleme hatası, ham veri gönderiliyor", e);
                    sendAudioData(audioBlob, channelNumber);
                }
            };
            
            fileReader.onerror = (error) => {
                // Okuma hatası, yine de göndermeyi dene
                logger.error("Dosya okuma hatası, ham veri gönderiliyor", error);
                sendAudioData(audioBlob, channelNumber);
            };
            
            fileReader.readAsArrayBuffer(audioBlob);
        } catch (error) {
            // Genel hata, yine de göndermeyi dene
            logger.error("Ses normalleştirme hatası, ham veri gönderiliyor", error);
            sendAudioData(audioBlob, channelNumber);
        }
    };
    
    /**
     * Ses Verisini WebSocket Üzerinden Gönderme
     * ----------------------------------------
     * Ses verisini Base64 formatına dönüştürür ve JSON olarak
     * WebSocket sunucusuna gönderir. Diğer kullanıcılar tarafından alınır.
     */
    const sendAudioData = (audioBlob, channelNumber) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            logger.error("Ses verisi gönderilemiyor: WebSocket bağlantısı açık değil");
            return;
        }
        
        // Ses verisi boyut kontrolü
        if (audioBlob.size > 100000) {
            logger.warn(`Ses verisi çok büyük: ${audioBlob.size} bytes, sıkıştırma gerekebilir`);
        } else if (audioBlob.size < 1000) {
            logger.warn(`Ses verisi çok küçük: ${audioBlob.size} bytes, gönderilmiyor`);
            return;
        }
        
        logger.debug(`Ses verisi gönderiliyor: Kanal #${channelNumber}, ${audioBlob.size} bytes`);
        
        try {
            // FileReader ile Blob'u Base64'e dönüştür
            const reader = new FileReader();
        
            reader.onloadend = function() {
                try {
                    const result = reader.result;
        
                    // Sonuç kontrolü
                    if (!result || typeof result !== 'string') {
                        logger.error("FileReader sonucu geçersiz");
                        return;
                    }
        
                    // MIME tipi kontrolü
                    if (!result.startsWith("data:audio")) {
                        logger.error(`Beklenmeyen MIME tipi: ${result.split(',')[0]}`);
                        return;
                    }
        
                    // Base64 veriyi al (data:audio/xxx;base64, kısmını atla)
                    const base64Audio = result.split(',')[1];
                    
                    // Sunucunun beklediği formatta veri hazırlama
                    const audioMessage = {
                        type: 'audio',                            // Mesaj türü
                        channel: channelNumber.toString(),        // Kanal numarası (string olarak)
                        clientId: clientId,                       // Gönderen kimliği
                        audioData: base64Audio,                   // Base64 kodlu ses verisi
                        format: audioBlob.type || 'audio/webm',   // Ses formatı
                        timestamp: Date.now()                     // Zaman damgası
                    };
                    
                    // JSON formatına dönüştür
                    const jsonData = JSON.stringify(audioMessage);
                    
                    // LOGLAMA: Veri boyutlarını takip et
                    const dataSizeKB = Math.round(jsonData.length / 1024);
                    logger.debug(`Gönderilen veri boyutu: ${dataSizeKB} KB, ses format: ${audioMessage.format}`);
        
                    // Veriyi WebSocket üzerinden gönder
                    socket.send(jsonData);
                    logger.success(`Ses verisi başarıyla gönderildi: Kanal #${channelNumber}`);
        
                } catch (e) {
                    logger.error("Ses verisi JSON'a dönüştürülürken hata oluştu", e);
                }
            };
        
            reader.onerror = function(error) {
                logger.error("FileReader hatası, ses gönderilemedi", error);
            };
        
            // Base64'e dönüştürme işlemini başlat
            reader.readAsDataURL(audioBlob);
        
        } catch (err) {
            logger.error("Ses gönderme genel hatası", err);
        }
    };
    
    /**
     * =====================================================
     * TELSİZ KONTROL FONKSİYONLARI
     * =====================================================
     * Aşağıdaki fonksiyonlar, telsizin açılması/kapanması, kanal değiştirme
     * ve kullanıcı arayüzü güncellemeleri gibi işlemleri gerçekleştirir.
     */
    
    // Telsiz açma/kapama fonksiyonu
    const toggleRadio = () => {
        // Telsiz durumunu değiştir
        isRadioOn = !isRadioOn;

        // UI güncelleme
        if (isRadioOn) {
            logger.info("Telsiz açılıyor...");
            
            // Telsiz açık durumunda güç ışığını yeşil yap
            powerIndicator.style.backgroundColor = '#00ff00';
            powerIndicator.style.boxShadow = '0 0 10px #00ff00';
            
            // UI elementlerini göster
            if (channelDisplay) channelDisplay.style.display = 'block';
            if (usersCountDisplay) usersCountDisplay.style.display = 'block';
            if (channelUpBtn) channelUpBtn.style.display = 'block';
            if (channelDownBtn) channelDownBtn.style.display = 'block';
            if (codeZeroBtn) codeZeroBtn.style.display = 'block';
            
            logger.success("Telsiz açıldı");
            document.getElementById("users-count").style.display = "Block";

            // Telsiz açılış sesini çal
            radioOnSound.play().catch(err => {
                logger.warn("Açılış sesi çalınamadı", err);
            });
            
            // Statik gürültüyü başlat
            if (!staticNoise) {
                logger.debug("Statik gürültü modülü oluşturuluyor");
                staticNoise = createStaticNoise();
            }
            staticNoise.start();
            
            // WebSocket bağlantısını kur
            connectWebSocket();
            
            // Mevcut kanalı göster
            updateChannelDisplay();
            
            // Mikrofon erişimini kontrol et
            if (!mediaRecorder) {
                logger.debug("MediaRecorder henüz oluşturulmamış, mikrofon erişimi isteniyor");
                requestMicrophoneAccess();
            }
        } else {
            logger.info("Telsiz kapatılıyor...");
            
            // Telsiz kapalı durumunda güç ışığını kırmızı yap
            powerIndicator.style.backgroundColor = '#333';
            powerIndicator.style.boxShadow = '0 0 5px rgba(0, 0, 0, 0.5)';
            
            // UI elementlerini gizle
            if (channelDisplay) channelDisplay.style.display = 'none';
            if (usersCountDisplay) usersCountDisplay.style.display = 'none';
            if (peerIdDisplay) peerIdDisplay.style.display = 'none';
            if (channelUpBtn) channelUpBtn.style.display = 'none';
            if (channelDownBtn) channelDownBtn.style.display = 'none';
            if (codeZeroBtn) codeZeroBtn.style.display = 'none';
            
            logger.success("Telsiz kapatıldı");
            document.getElementById("users-count").style.display = "none";

            // Telsiz kapanış sesini çal
            radioOffSound.play().catch(err => {
                logger.warn("Kapanış sesi çalınamadı", err);
            });
            
            // Statik gürültüyü durdur
            if (staticNoise) {
                staticNoise.stop();
                logger.debug("Statik gürültü durduruldu");
            }
            
            // Ses kaydını durdur, eğer aktifse
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                stopRecording();
                logger.debug("Aktif ses kaydı durduruldu");
            }
            
            // WebSocket bağlantısını kapat
            if (socket && socket.readyState === WebSocket.OPEN) {
                // Kanaldan ayrıl
                leaveChannel(currentChannel);
                socket.close();
                logger.debug("WebSocket bağlantısı kapatıldı");
            }
            
            // UI'ı temizle
            const connectionStatus = document.getElementById('connectionStatus');
            if (connectionStatus) {
                connectionStatus.innerText = 'Kapalı';
                connectionStatus.className = 'disconnected';
            }
            if (channelDisplay) channelDisplay.innerText = '--';
            if (usersCountDisplay) usersCountDisplay.textContent = 'USERS: 0';
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
    
    // Kod 0 Sesi Çalma Fonksiyonu
    const playCode0Sound = () => {
        if (!isRadioOn) return;
        
        logger.warn("KOD 0 ACİL DURUM SESİ ÇALINIYOR!");
        
        try {
            // Şu anda bir ses çalıyorsa durdur
            if (isCurrentlyPlayingAudio) {
                logger.debug("Diğer sesleri durduruyoruz");
                // Kuyruktaki sesleri temizle
                audioPlaybackQueue = [];
                // Statik sesi kıs
                if (staticNoise) {
                    staticNoise.setVolume(0.001);
                }
                
                // Çalan ses varsa durdurmaya çalış (mümkünse)
                try {
                    const audioElements = document.querySelectorAll('audio');
                    audioElements.forEach(audio => {
                        if (audio !== code0Sound && audio !== radioOnSound && audio !== radioOffSound) {
                            audio.pause();
                            logger.debug("Çalan ses durduruldu");
                        }
                    });
                } catch (e) {
                    logger.error("Ses durdurma hatası", e);
                }
            }
            
            // Telsiz üzerinde görsel acil durum efekti 
            const radioWrapper = document.querySelector('.radio-wrapper');
            if (radioWrapper) {
                // Acil durum kırmızı yanıp sönme efekti
                radioWrapper.style.animation = 'code0-flash 0.5s infinite alternate';
                radioWrapper.style.boxShadow = '0 0 20px #ff0000';
                
                // 10 saniye sonra efekti kaldır
                setTimeout(() => {
                    radioWrapper.style.animation = '';
                    radioWrapper.style.boxShadow = '';
                }, 10000);
            }
            
            // Önce ses kaydını durdur eğer devam ediyorsa
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                logger.debug("Aktif ses kaydı durduruldu");
            }
            
            // Ses çalma kilidini sıfırla ve kilidi al
            isCurrentlyPlayingAudio = true;
            
            // Kod 0 sesini maksimum ses seviyesinde çal
            code0Sound.volume = 1.0;
            code0Sound.currentTime = 0; // Baştan çal
            
            code0Sound.play().catch(err => {
                logger.error("Kod 0 sesi çalma hatası:", err);
                // Kullanıcı etkileşimi gerektiren durumlarda kullanıcıyı bilgilendir
                if (err.name === 'NotAllowedError') {
                    alert("Ses çalmak için lütfen sayfayla etkileşime geçin");
                }
            });
            
            // LCD ekranı acil durum animasyonu göstersin
            const lcdDisplay = document.querySelector('.lcd-display');
            if (lcdDisplay) {
                lcdDisplay.classList.add('emergency');
                
                // Ekranda "KOD 0" yazısını göster
                const lcdFreq = document.querySelector('.lcd-freq');
                if (lcdFreq) {
                    const originalText = lcdFreq.textContent;
                    lcdFreq.textContent = "KOD 0";
                    lcdFreq.style.color = "#ff0000";
                    
                    // 10 saniye sonra normal göstergeye dön
                    setTimeout(() => {
                        lcdFreq.textContent = originalText;
                        lcdFreq.style.color = "";
                        lcdDisplay.classList.remove('emergency');
                    }, 10000);
                }
            }
            
            // Ses bittiğinde normal duruma dön
            code0Sound.onended = () => {
                logger.debug("Kod 0 ses çalma tamamlandı");
                // Statik sesi normale döndür
                if (staticNoise) {
                    staticNoise.setVolume(0.01);
                }
                // Ses çalma kilidini kaldır
                isCurrentlyPlayingAudio = false;
                // Bekleyen sesleri işle
                setTimeout(processAudioQueue, 500);
            };
        } catch (error) {
            logger.error("Kod 0 sesi çalınırken hata oluştu", error);
            // Hataya rağmen kilidi kaldır
            isCurrentlyPlayingAudio = false;
        }
    };
    
    // Kod 0 Bildirimi Gönderme Fonksiyonu
    const sendCodeZeroNotification = () => {
        if (!isRadioOn) return;
        
        console.log("Kod 0 bildirim isteği gönderiliyor...");
        sendCode0SoundToServer();
        
        
    };
    
    // Yeni fonksiyon: Sunucuya Kod 0 Ses mesajı gönderme
    const sendCode0SoundToServer = () => {
        // Sunucuya Kod 0 ses yayını başlatma mesajı gönder
        if (socket && socket.readyState === WebSocket.OPEN) {
            try {
                logger.warn("Kod 0 ses yayını için sunucuya mesaj hazırlanıyor");
                
                // Mesajı hazırla
                const code0SoundMessage = {
                    type: 'code0Sound',
                    senderId: clientId,
                    timestamp: Date.now()
                };
                
                // JSON olarak dönüştür
                const jsonMessage = JSON.stringify(code0SoundMessage);
                logger.debug(`Kod 0 mesajı: ${jsonMessage}`);
                
                // Gönder
                socket.send(jsonMessage);
                logger.success("Kod 0 ses yayını isteği sunucuya başarıyla gönderildi");
                
                // Kendi cihazımızda çalmaya başla
                playCode0Sound();
                
            } catch (error) {
                logger.error("Kod 0 ses yayını gönderilirken hata oluştu: ", error);
                // Hata olsa bile yerel olarak çal
                playCode0Sound();
            }
        } else {
            logger.error(`WebSocket bağlantısı yok veya uygun durumda değil. Durum: ${socket ? socket.readyState : 'socket yok'}`);
            // Bağlantı yoksa bile yerel olarak çal
            playCode0Sound();
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
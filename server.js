const WebSocket = require("ws");
const fs = require("fs");
const PORT = process.env.PORT || 10000;

const wss = new WebSocket.Server({ port: PORT });

// Aktif kullanıcıları ve kanalları takip et
const activeChannels = {};
const clients = new Map();

wss.on("connection", function connection(ws) {
    console.log("Client connected");
    
    // Yeni kullanıcıya ID ata
    const clientId = "client_" + Math.random().toString(36).substring(2, 9);
    clients.set(ws, { id: clientId, channel: null });

    // Bağlantı kurulduğunda hoşgeldin mesajı gönder
    ws.send("Welcome to the WebSocket server!");
    
    // Client ID bilgisini gönder
    ws.send(JSON.stringify({
        type: 'clientId',
        id: clientId
    }));

    ws.on('message', (msg) => {
        try {
            console.log("Gelen veri türü:", typeof msg, "Buffer mi?", msg instanceof Buffer);
            
            // Node.js'de WebSocket mesajı Buffer olarak gelir
            if (msg instanceof Buffer) {
                try {
                    // Buffer'ı string'e çevir ve JSON olarak parse et
                    const strMsg = msg.toString('utf8');
                    console.log("Buffer'dan çevrilen string:", strMsg.substring(0, 50) + "...");
                    
                    try {
                        const data = JSON.parse(strMsg);
                        processJsonMessage(ws, data);
                    } catch (jsonErr) {
                        console.error("JSON parse hatası:", jsonErr.message);
                    }
                } catch (bufferErr) {
                    console.error("Buffer dönüştürme hatası:", bufferErr);
                }
                return;
            }
            
            // String mesaj 
            if (typeof msg === 'string') {
                try {
                    const data = JSON.parse(msg);
                    processJsonMessage(ws, data);
                } catch (err) {
                    console.error("String JSON parse hatası:", err.message);
                }
                return;
            }
            
            // Diğer tip mesajlar
            console.log("Beklenmeyen mesaj türü:", typeof msg);
            
        } catch (error) {
            console.error("Mesaj işleme hatası:", error);
        }
    });
    
    ws.on('close', () => {
        // Kullanıcının kanaldan ayrılmasını sağla
        const clientInfo = clients.get(ws);
        if (clientInfo && clientInfo.channel) {
            // Kullanıcıyı kanaldan çıkar
            leaveChannel(clientInfo.channel, clientInfo.id);
        }
        
        // Kullanıcıyı listeden sil
        clients.delete(ws);
        console.log("Client bağlantısı kapandı, ID:", clientInfo ? clientInfo.id : "bilinmiyor");
        
        // Tüm kanallardaki kullanıcı sayılarını güncelle
        broadcastUserCounts();
    });
});

// Kanala katılma işlemi
function handleJoinChannel(ws, data) {
    try {
        const channel = data.channel;
        const clientId = data.clientId;
        
        // Client bilgilerini güncelle
        const clientInfo = clients.get(ws);
        if (clientInfo) {
            // Eğer kullanıcı başka bir kanaldaysa, önce oradan çıkar
            if (clientInfo.channel && clientInfo.channel !== channel) {
                leaveChannel(clientInfo.channel, clientInfo.id);
            }
            
            // Yeni kanalı ayarla
            clientInfo.channel = channel;
            clients.set(ws, clientInfo);
        }
        
        // Kanal yoksa oluştur
        if (!activeChannels[channel]) {
            activeChannels[channel] = new Set();
        }
        
        // Kullanıcıyı kanala ekle
        activeChannels[channel].add(clientId);
        
        console.log(`Client ${clientId} joined channel ${channel}`);
        
        // Kullanıcıya katılım onayı gönder
        ws.send(JSON.stringify({
            type: 'join',
            channel: channel,
            success: true,
            channelUsers: activeChannels[channel].size
        }));
        
        // Tüm kanallardaki kullanıcı sayılarını güncelle
        broadcastUserCounts();
    } catch (error) {
        console.error("Kanala katılma hatası:", error);
    }
}

// Kanaldan ayrılma işlemi
function handleLeaveChannel(ws, data) {
    try {
        const channel = data.channel;
        const clientId = data.clientId;
        
        leaveChannel(channel, clientId);
        
        // Client bilgilerini güncelle
        const clientInfo = clients.get(ws);
        if (clientInfo && clientInfo.channel === channel) {
            clientInfo.channel = null;
            clients.set(ws, clientInfo);
        }
        
        console.log(`Client ${clientId} left channel ${channel}`);
        
        // Kullanıcıya ayrılma onayı gönder
        ws.send(JSON.stringify({
            type: 'leave',
            channel: channel,
            success: true
        }));
        
        // Tüm kanallardaki kullanıcı sayılarını güncelle
        broadcastUserCounts();
    } catch (error) {
        console.error("Kanaldan ayrılma hatası:", error);
    }
}

// Kullanıcıyı kanaldan çıkar
function leaveChannel(channel, clientId) {
    try {
        if (activeChannels[channel] && activeChannels[channel].has(clientId)) {
            activeChannels[channel].delete(clientId);
            
            // Eğer kanalda kimse kalmadıysa kanalı sil
            if (activeChannels[channel].size === 0) {
                delete activeChannels[channel];
            }
        }
    } catch (error) {
        console.error("Kanaldan çıkarma hatası:", error);
    }
}

// Ses mesajını işle ve ilgili kanaldaki diğer kullanıcılara ilet
function handleAudioMessage(ws, data) {
    try {
        const channel = data.channel;
        const senderId = data.clientId;
        
        console.log(`🔊 Ses verisi alındı - Kanal: ${channel}, Gönderen: ${senderId}, Boyut: ${data.audioData.length} karakter`);
        
        let recipientCount = 0;
        
        // İlgili kanaldaki tüm kullanıcılara ses verisini gönder (gönderen hariç)
        wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                const clientInfo = clients.get(client);
                
                // Sadece aynı kanaldaki kullanıcılara gönder
                if (clientInfo && clientInfo.channel === channel) {
                    console.log(`🔄 Ses verisi iletiliyor - Hedef: ${clientInfo.id}`);
                    client.send(JSON.stringify(data));
                    recipientCount++;
                }
            }
        });
        
        // Ses iletim bilgisini tüm kanaldaki kullanıcılara gönder
        const transmissionInfo = JSON.stringify({
            type: 'audioTransmission',
            channel: channel,
            senderId: senderId,
            recipientCount: recipientCount,
            timestamp: Date.now()
        });
        
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                const clientInfo = clients.get(client);
                if (clientInfo && clientInfo.channel === channel) {
                    client.send(transmissionInfo);
                }
            }
        });
        
        console.log(`✅ Ses verisi ${recipientCount} kullanıcıya iletildi - Kanal: ${channel}`);
        
        // Hiç kullanıcı yoksa bildir
        if (recipientCount === 0) {
            console.log(`⚠️ Kanal ${channel}'de alıcı kullanıcı yok!`);
            
            // Kanal kullanıcılarını kontrol et
            if (activeChannels[channel]) {
                console.log(`📊 Kanal ${channel} kullanıcıları: ${Array.from(activeChannels[channel]).join(', ')}`);
            } else {
                console.log(`📊 Kanal ${channel} aktif değil`);
            }
        }
    } catch (error) {
        console.error("Ses mesajı iletme hatası:", error);
    }
}

// Tüm kanallardaki kullanıcı sayılarını hesapla ve gönder
function broadcastUserCounts() {
    try {
        // Toplam kullanıcı sayısı
        const totalUsers = clients.size;
        
        // Aktif client ID'leri topla
        const activeClientIds = new Set();
        clients.forEach(client => {
            activeClientIds.add(client.id);
        });
        
        // Her kanaldaki kullanıcı sayısını hesapla ve inaktif kullanıcıları temizle
        const channelCounts = {};
        for (const channel in activeChannels) {
            // Kanaldan bağlantısı kopmuş kullanıcıları çıkar
            for (const clientId of activeChannels[channel]) {
                if (!activeClientIds.has(clientId)) {
                    console.log(`Bağlantısı kopmuş kullanıcı ${clientId} kanaldan ${channel} çıkarılıyor`);
                    activeChannels[channel].delete(clientId);
                }
            }
            
            // Kullanıcı sayısını güncelle
            channelCounts[channel] = activeChannels[channel].size;
            
            // Eğer kanalda hiç kullanıcı kalmadıysa kanalı sil
            if (activeChannels[channel].size === 0) {
                delete activeChannels[channel];
            }
        }
        
        // Tüm bağlı kullanıcılara kullanıcı sayılarını gönder
        const userCountMsg = JSON.stringify({
            type: 'userCount',
            count: totalUsers,
            channelCounts: channelCounts
        });
        
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(userCountMsg);
            }
        });
    } catch (error) {
        console.error("Kullanıcı sayısı yayınlama hatası:", error);
    }
}

// JSON mesajlarını işle
function processJsonMessage(ws, data) {
    // Mesaj tipini kontrol et
    switch (data.type) {
        case 'join':
            // Kanal katılım işlemi
            handleJoinChannel(ws, data);
            break;
            
        case 'leave':
            // Kanaldan ayrılma işlemi
            handleLeaveChannel(ws, data);
            break;
            
        case 'audio':
            // Ses verisi tam ve doğru formatta mı kontrol et
            if (data.type === 'audio' &&
                typeof data.channel === 'string' &&
                typeof data.clientId === 'string' &&
                typeof data.format === 'string' &&
                typeof data.audioData === 'string' &&
                typeof data.timestamp === 'number') {
                
                // Ses verisini işle ve diğer kullanıcılara ilet
                handleAudioMessage(ws, data);
            } else {
                console.error("Geçersiz ses verisi formatı:", data);
            }
            break;
            
        default:
            console.log("Bilinmeyen mesaj türü:", data.type);
    }
}

console.log(`WebSocket server running on port ${PORT}`);

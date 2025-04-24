const WebSocket = require("ws");
const fs = require("fs");
const PORT = process.env.PORT || 10000;

const wss = new WebSocket.Server({ port: PORT });

wss.on("connection", function connection(ws) {
    console.log("Client connected");

    ws.on('message', (msg) => {
        let data;
        try {
            data = JSON.parse(msg);
        } catch (err) {
            console.error("JSON çözümleme hatası:", err);
            return;
        }

        // ✅ Geçerli formatta mı?
        if (
            data.type === 'audio' &&
            typeof data.channel === 'string' &&
            typeof data.clientId === 'string' &&
            typeof data.format === 'string' &&
            typeof data.audioData === 'string' &&
            typeof data.timestamp === 'number'
        ) {
            // 📁 Dosyaya yaz
            const buffer = Buffer.from(data.audioData, 'base64');
            const fileName = `audio-${data.clientId}-${data.timestamp}.webm`;

            fs.writeFile(fileName, buffer, (err) => {
                if (err) {
                    console.error("Ses kaydı yazılamadı:", err);
                } else {
                    console.log(`Ses dosyası kaydedildi: ${fileName}`);
                }
            });

            // 📡 Diğer kullanıcılara formatlı şekilde gönder
            const formattedMessage = JSON.stringify({
                type: 'audio',
                channel: data.channel,
                clientId: data.clientId,
                format: data.format,
                audioData: data.audioData,
                timestamp: data.timestamp
            });

            wss.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(formattedMessage);
                }
            });
        } else {
            console.warn("Geçersiz ses mesajı formatı alındı:", data);
        }
    });

    ws.send(JSON.stringify({ type: "info", message: "Bağlantı kuruldu" }));
});

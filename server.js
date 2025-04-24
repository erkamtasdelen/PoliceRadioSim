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

        if (data.type === 'audio') {
            const buffer = Buffer.from(data.audioData, 'base64');
            const fileName = `audio-${data.clientId}-${data.timestamp}.webm`;

            fs.writeFile(fileName, buffer, (err) => {
                if (err) {
                    console.error("Ses kaydı yazılamadı:", err);
                } else {
                    console.log(`Ses dosyası kaydedildi: ${fileName}`);
                }
            });
        }
    });


  ws.send("Welcome to the WebSocket server!");
});
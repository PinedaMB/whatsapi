const express = require('express');
const {Client, LocalAuth} = require('whatsapp-web.js');
const bodyParser = require('body-parser');
const {Server} = require('socket.io');
const {createServer} = require("http");
const morgan = require('morgan');

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
const port = process.env.PORT || 8000;
app.use(bodyParser.json());
app.use(morgan('dev'));
const sessions = {};

function createSession(client_id) {
    try {
        if (sessions[client_id]) {
            io.to(client_id).emit('session_already_started', true);
            return false;
        }


        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: client_id,
            }),
            qrMaxRetries: 1,
        });

        client.on('qr', (qr) => {
            console.log('QR RECEIVED', qr);
            io.to(client_id).emit('qr', qr);
        });

        client.on('loading_screen', (status) => {
            console.log('LOADING SCREEN', status);
            io.to(client_id).emit('loading_screen', true);
        });

        client.on('authenticated', (session) => {
            console.log('AUTHENTICATED', session);
            io.to(client_id).emit('authenticated', true);
        });

        client.on('message', msg => {
            let message = msg.body.toLowerCase();
            message = message.trim();
            message = message.replace(/\s/g, '')
            if (message === '!notificar') {
                msg.reply('Notificaciones activadas!').then(r => {});
            }
        });

        client.on('ready', () => {
            console.log('READY');
            sessions[client_id] = client;
            io.to(client_id).emit('ready', true);
        });

        client.on('auth_failure', msg => {
            console.error('AUTHENTICATION FAILURE', msg);
        });

        client.on('disconnected', (reason) => {
            io.to(client_id).emit('disconnected', true);
            delete sessions[client_id];
        });

        client.initialize().then(r => {
            console.log('INITIALIZED');
        });
    } catch (e) {
        console.log(e);
    }
}

app.post('/session', (req, res) => {
    const {client_id} = req.body;
    createSession(client_id);
    res.status(200).json({'success': true});
});

app.post('/send-multiple-messages', async (req, res) => {
    const {numbers, message, client_id} = req.body;
    const client = sessions[client_id];
    const numbers_array = numbers.split(',');

    if (client === undefined) {
        res.status(500).json({'success': false, 'message': 'Es necesario iniciar sesión'});
    } else {
        let success_numbers = [];
        try {
            for (let i = 0; i < numbers_array.length; i++) {
                const sanitizedNumber = numbers_array[i].replace(/[- )(]/g, "");
                const finalNumber = `52${sanitizedNumber}`;
                const number_details = await client.getNumberId(finalNumber);

                if (number_details !== null) {
                    await client.sendMessage(number_details._serialized, message);
                    success_numbers.push(numbers_array[i]);
                }
            }
            res.status(200).json({'success': true, 'message': `${success_numbers.length} mensajes enviados`});
        } catch (e) {
            res.status(500).json({'success': false, 'message': e.message});
        }
    }
});

app.post('/send-message', async (req, res) => {
    const {number, message, client_id} = req.body;
    const client = sessions[client_id];

    if (client === undefined) {
        res.status(500).json({'success': false, 'message': 'Es necesario iniciar sesión'});
    } else {
        const sanitizedNumber = number.replace(/[- )(]/g, "");
        const finalNumber = `52${sanitizedNumber}`;
        const number_details = await client.getNumberId(finalNumber);

        if (!number_details) {
            res.status(500).json({'success': false, 'message': 'Número no encontrado'});
        } else {
            await client.sendMessage(number_details._serialized, message);
            res.status(200).json({'success': true});
        }
    }
});

io.on("connection", (socket) => {
    socket.on('join', (client_id) => {
        console.log('Client joined', client_id);
        socket.join(client_id);
    });
});
server.listen(port, function () {
    console.log(`Listening on port http://localhost:${port}`);
});
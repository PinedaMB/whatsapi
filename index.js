const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const bodyParser = require("body-parser");
const morgan = require("morgan");
const { Server } = require("socket.io");
const { createServer } = require("http");

const app = require("express")();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(morgan("dev"));

const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let clients = [];
const port = process.env.PORT || 3000;
app.post("/login", (req, res) => {
    const { session_id } = req.body;
    let client = new Client({
        authStrategy: new LocalAuth({
            clientId: session_id,
        }),
        qrMaxRetries: 1,
    });

    client.on("qr", (qr) => {
        /*res.send(qr);*/
        io.to(session_id).emit("qr", qr);
    });

    client.on("authenticated", (session) => {
        console.log("AUTHENTICATED", session);
        io.to(session_id).emit("authenticated", session);
    });

    client.on("ready", () => {
        const isClientExist = clients.find((client) => client.sessionId === session_id);
        if (!isClientExist) {
            clients.push({ sessionId: session_id, client });
        }
        res.send("Logged in!");
    });

    client.on("disconnected", (reason) => {
        clients = clients.filter((client) => client.sessionId !== session_id);
        client.destroy().then(r => {
            res.send("Client was logged out");
        });
    });

    client.initialize().then(r => {
        console.log("INITIALIZED");
    }).catch(e => {
        console.log("ERROR", e);
    });

});

app.post("/send", async (req, res) => {
    const { number, message, session_id } = req.body;
    let client = clients.find((client) => client.sessionId === session_id);
    if (client === undefined) {
        res.send("You need to login first!");
        return;
    }
    client = client.client;

    const sanitizedNumber = number.replace(/[- )(]/g, "");
    const finalNumber = `52${sanitizedNumber}`;
    const number_details = await client.getNumberId(finalNumber);

    try {
        await client.sendMessage(number_details._serialized, message);
        res.send("Message sent!");
    } catch (e) {
        res.send("Error sending message!");
    }
});

io.on("connection", (socket) => {
    socket.on("join", (session_id) => {
        console.log("User joined", session_id);
        socket.join(session_id);
    });
});

server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
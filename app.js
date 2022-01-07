const { Client, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const {body, validationResult} = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatter } = require('./helper/formatter');
const axios = require('axios');
const port = process.env.PORT || 3007;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({extended: true}));

const SESSION_FILE_PATH = './whatsapp-session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
}

app.get('/', (req, res) => {
    res.sendFile('index.html', {
        root: __dirname
    });
});

const client = new Client({ 
    puppeteer: { 
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process', // <- this one doesn't works in Windows
          '--disable-gpu'
        ],
    }, 
    session: sessionCfg 
});

client.initialize();

// Socket IO
io.on('connection', function(socket){
    socket.emit('message', 'Connecting...');

    client.on('qr', (qr) => {
        console.log('QR RECEIVED', qr);
        qrcode.toDataURL(qr, (err, url) => {
            socket.emit('qr', url);
            socket.emit('message', 'QR Code Received, Please Scan!');
        });
    });

    client.on('ready', () => {
        socket.emit('ready', 'WhastApp is Ready!');
        socket.emit('message', 'WhastApp is Ready!');
    });

    client.on('authenticated', (session) => {
        socket.emit('authenticated', 'WhastApp is Authenticated!');
        socket.emit('message', 'WhastApp is Authenticated!');
        console.log('AUTHENTICATED', session);
        sessionCfg=session;
        fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
            if (err) {
                console.error(err);
            }
        });
    });

    client.on('auth_failure', function(session) {
        socket.emit('message', 'Auth failure, restarting...');
    });

    client.on('disconnected', (session) => {
        socket.emit('message', 'Whatsapp is disconnected!');
        fs.unlinkSync(SESSION_FILE_PATH, function(err) {
            if(err) return console.log(err);
            console.log('Session file deleted!');
        });
        client.destroy();
        client.initialize();
    });    

});

client.on('message', msg => {
    if (msg.body == 'Follow') {
        msg.reply('Follow Akun Cakji di https://www.instagram.com/cakj1/');
    } else if (msg.body == 'Info') {
        msg.reply('Informasi kegiatan @cakj1 silahkan kunjungi https://cakji.id/ ');
    } else if (msg.body == 'Lapor') {
        msg.reply('Untuk memberikan laporan silahkan kunjungi https://cakji.id/lapor-cakji ');
    } else {
        msg.reply('Ini adalah Nomor WhatsApp Press Release @cakj1 (Wakil Walikota Surabaya)'+
            '\n- Untuk Follow @cakj1 ketik Follow'+
            '\n- Untuk Informasi ketik Info'+
            '\n- untuk memberi Laporan ketik Lapor');    
    }
});

// check nomor handphone terdaftar di whatsapp atau belum
const checkRegisteredNumber = async function(number) {
    const isRegistered = await client.isRegisteredUser(number);
    return isRegistered;
}

// check nomor whatsapp
app.post('/check-no-wa', [
        body('number').notEmpty(),
], async (req, res) => {
    const errors = validationResult(req).formatWith(({msg}) => {
        return msg;
    });

    if (!errors.isEmpty()) {
        return res.status(422).json({
            status : false,
            message: errors.mapped()
        });
    }

    const number = phoneNumberFormatter(req.body.number);
    const isRegisteredNumber = await checkRegisteredNumber(number);

    if (!isRegisteredNumber) {
        return res.status(422).json({
            status : false,
            message: 'The Number is Not Register!'
        });
    } else {
        return res.status(200).json({
            status : true,
            message: 'The Number is Registered!'
        });
    }
});

// Send Message
app.post('/send-message', [
    body('number').notEmpty(),
    body('message').notEmpty(),
], (req, res) => {
    const errors = validationResult(req).formatWith(({msg}) => {
        return msg;
    });

    if (!errors.isEmpty()) {
        return res.status(422).json({
            status : false,
            message: errors.mapped()
        });
    }

    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;

    client.sendMessage(number, message).then(response => {
        res.status(200).json({
            status :true,
            response : response
        });
    }).catch(err => {
        res.status(500).json({
            status :false,
            response : err
        });
    });
});

// Send media
// app.post('/send-media', async (req, res) => {
//     const number = phoneNumberFormatter(req.body.number);
//     const caption = req.body.caption;
//     const fileUrl = req.body.file;

//     let mimetype;
//     const attachment = await axios.get(fileUrl, {
//         responseType: 'arraybuffer'
//     }).then(response => {
//         mimetype = response.headers['content-type'];
//         return response.data.toString('base64');
//     });

//     const media = new MessageMedia(mimetype, attachment, 'Media');

//     client.sendMessage(number, media, {
//         caption: caption
//     }).then(response => {
//         res.status(200).json({
//             status: true,
//             response: response
//         });
//     }).catch(err => {
//         res.status(500).json({
//             status: false,
//             response: err
//         });
//     });
// });

server.listen(port, function(){
    console.log('App Running on *:' + port);
});

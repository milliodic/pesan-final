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
app.use(express.urlencoded({
  extended: true
}));

app.get('/', (req, res) => {
  res.sendFile('index.html', {
    root: __dirname
  });
});

const sessions = [];
const SESSIONS_FILE = './whatsapp-sessions.json';

const createSessionsFileIfNotExists = function() {
  if (!fs.existsSync(SESSIONS_FILE)) {
    try {
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
      console.log('Sessions file created successfully.');
    } catch(err) {
      console.log('Failed to create sessions file: ', err);
    }
  }
}

createSessionsFileIfNotExists();

const setSessionsFile = function(sessions) {
  fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions), function(err) {
    if (err) {
      console.log(err);
    }
  });
}

const getSessionsFile = function() {
  return JSON.parse(fs.readFileSync(SESSIONS_FILE));
}

const createSession = function(id, description) {
  console.log('Creating session: ' + id);
  const SESSION_FILE_PATH = `./whatsapp-session-${id}.json`;
  let sessionCfg;
  if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
  }

  const client = new Client({
    restartOnAuthFail: true,
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


  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      io.emit('qr', { id: id, src: url });
      io.emit('message', { id: id, text: 'QR Code received, scan please!' });
    });
  });

  client.on('ready', () => {
    io.emit('ready', { id: id });
    io.emit('message', { id: id, text: 'Whatsapp is ready!' });

    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex(sess => sess.id == id);
    savedSessions[sessionIndex].ready = true;
    setSessionsFile(savedSessions);
  });

  client.on('authenticated', (session) => {
    io.emit('authenticated', { id: id });
    io.emit('message', { id: id, text: 'Whatsapp is authenticated!' });
    sessionCfg = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function(err) {
      if (err) {
        console.error(err);
      }
    });
  });

  client.on('auth_failure', function(session) {
    io.emit('message', { id: id, text: 'Auth failure, restarting...' });
  });

  client.on('disconnected', (reason) => {
    io.emit('message', { id: id, text: 'Whatsapp is disconnected!' });
    fs.unlinkSync(SESSION_FILE_PATH, function(err) {
        if(err) return console.log(err);
        console.log('Session file deleted!');
    });
    client.destroy();
    client.initialize();

    // Menghapus pada file sessions
    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex(sess => sess.id == id);
    savedSessions.splice(sessionIndex, 1);
    setSessionsFile(savedSessions);

    io.emit('remove-session', id);
  });

  // Tambahkan client ke sessions
  sessions.push({
    id: id,
    description: description,
    client: client
  });

  // Menambahkan session ke file
  const savedSessions = getSessionsFile();
  const sessionIndex = savedSessions.findIndex(sess => sess.id == id);

  if (sessionIndex == -1) {
    savedSessions.push({
      id: id,
      description: description,
      ready: false,
    });
    setSessionsFile(savedSessions);
  }
}

const init = function(socket) {
  const savedSessions = getSessionsFile();

  if (savedSessions.length > 0) {
    if (socket) {
      socket.emit('init', savedSessions);
    } else {
      savedSessions.forEach(sess => {
        createSession(sess.id, sess.description);
      });
    }
  }
}

init();

// Socket IO
io.on('connection', function(socket) {
  init(socket);

  socket.on('create-session', function(data) {
    console.log('Create session: ' + data.id);
    createSession(data.id, data.description);
  });
});

// check nomor handphone terdaftar di whatsapp atau belum
// const checkRegisteredNumber = async function(number) {
//     const isRegistered = await client.isRegisteredUser(number);
//     return isRegistered;
// } 

// check nomor whatsapp
// app.post('/check-no-wa', [
//     body('number').notEmpty(),
// ], async (req, res) => {
//     const errors = validationResult(req).formatWith(({msg}) => {
//         return msg;
//     });

//     if (!errors.isEmpty()) {
//         return res.status(422).json({
//             status : false,
//             message: errors.mapped()
//         });
//     }

//     const number = phoneNumberFormatter(req.body.number);
//     const isRegisteredNumber = await checkRegisteredNumber(number);

//     if (!isRegisteredNumber) {
//         return res.status(422).json({
//             status : false,
//             message: 'The Number is Not Register!'
//         });
//     } else {
//         return res.status(200).json({
//             status : true,
//             message: 'The Number is Registered!'
//         });
//     }
// });


// Send message
app.post('/send-message', [
    body('sender').notEmpty(),
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

    const sender = req.body.sender;
    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;

    const client = sessions.find(sess => sess.id == sender).client;

    client.sendMessage(number, message).then(response => {
        res.status(200).json({
            status: true,
            response: response
        });
    }).catch(err => {
        res.status(500).json({
            status: false,
            response: err
        });
    });
});

// Send media
// app.post('/send-media', [
//     body('sender').notEmpty(),
//     body('number').notEmpty(),
//     body('caption').notEmpty(),
//     body('file').notEmpty(),
// ], async (req, res) => {

//     const errors = validationResult(req).formatWith(({msg}) => {
//         return msg;
//     });

//     if (!errors.isEmpty()) {
//         return res.status(422).json({
//             status : false,
//             message: errors.mapped()
//         });
//     }

//     const sender = req.body.sender;
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
//     const client = sessions.find(sess => sess.id == sender).client;


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

server.listen(port, function() {
  console.log('App running on *: ' + port);
});

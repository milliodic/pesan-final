const { Client, LocalAuth } = require('whatsapp-web.js/index');
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

const client = new Client({
    authStrategy: new LocalAuth(),
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
    }
});

client.initialize();

// Socket IO
io.on('connection', function(socket){
    socket.emit('message', 'Connecting...');

    client.on('qr', (qr) => {
    // NOTE: This event will not be fired if a session is specified.
        console.log('QR RECEIVED', qr);
        qrcode.toDataURL(qr, (err, url) => {
            socket.emit('qr', url);
            socket.emit('message', 'QR Code Received, Please Scan!');
        });
    });

    client.on('authenticated', () => {
        console.log('AUTHENTICATED');
        socket.emit('AUTHENTICATED', 'WhastApp is Authenticated!');
        socket.emit('message', 'WhastApp is Authenticated!');
    });

    client.on('auth_failure', () => {
        // Fired if session restore was unsuccessful
        socket.emit('AUTHENTICATION FAILURE', 'Authenticated Failure!');
        socket.emit('message', 'Authenticated Failure!');
    });

    client.on('ready', () => {
        console.log('READY');
        socket.emit('ready', 'Server OTP CONNECTED!');
        socket.emit('message', 'Server OTP CONNECTED!');
    });

    client.on('disconnected', msg => {
        socket.emit('message', 'Server OTP DISCONNECTED!');
        client.destroy();
        client.initialize();
    });    

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
    body('sender').notEmpty(),
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
    const sender = req.body.sender;
    const message = req.body.message;

    if (sender == 'sheila') {
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
    }
    else if (sender == 'klinikdak') {
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
    }
    else {
      return res.status(422).json({
        status : false,
        message: 'unmatched'
      });
    }

});

server.listen(port, function(){
    console.log('App Running on *:' + port);
});

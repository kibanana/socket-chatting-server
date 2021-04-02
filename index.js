const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const dataManage = require('./dataManage');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const server = http.createServer(app);
server.listen(process.env.PORT || 3000, () => {
    console.log('Server is running!');
})

const io = socketIo(server);

dataManage.setIo(io);

let userIndex = 1;

io.on('connection', (socket) => {
    socket.on('register', (data) => {
        const ipAddress = socket.handshake.address.replace(`::ffff:`, ``);
        dataManage.setSocketId(ipAddress, socket.id);

        const username = `유저${userIndex++}`;
        socket.broadcast.emit('notice', { message: `${username}이(가) 서버에 접속했습니다!` });
        socket.emit('admin_message', { message: `사용자 이름 '${username}'을(를) 부여받았습니다` });
    });
});
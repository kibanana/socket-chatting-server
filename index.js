const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const socketIo = require('socket.io');
const redis = require('socket.io-redis');
const dataManager = require('./dataManager');
// const dbManager = require('./dbManager');
const redisClient = require('./cacheManager');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const server = http.createServer(app);
server.listen(process.env.PORT || 3000, () => {
    console.log('Server is running!');
})

mongoose.connect('mongodb://localhost:27017', { useUnifiedTopology: true, useNewUrlParser: true, dbName: 'socket_chatting' });
mongoose.connection.once('open', () => {
    console.log('DB is connected!');
})

const io = socketIo(server, {
    pingTimeout: 60000,
    pingInterval: 60000
});

io.adapter(redis({ host: '127.0.0.1', port: 6379 }));

dataManager.setIo(io);

io.on('connection', (socket) => {
    socket.on('disconnect', async () => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const room = await redisClient.getRoomByUser({ userId: currentUser.key });

        if (room) {
            const { key: roomId } = room;
            let { users } = room;

            users = JSON.parse(users);
            const idx = users.indexOf(currentUser.key);

            socket.leave(roomId);

            if (users.length <= 1) {
                await redisClient.deleteRoom({ key: roomId });
                return socket.broadcast.emit('admin_delete_data', { room: roomId });
            }
            
            let additionalMessage = '';
            if (idx === 0) {
                additionalMessage += `기존 방 주인이었던 '${currentUser.name}'이(가) 나갔으므로 '${(await redisClient.getUserItemByKey({ key: users[1] })).name}'이(가) 방 주인이 됩니다.`;
            }

            await redisClient.deleteUserFromRoom({ key: roomId, user: currentUser.key });

            users.splice(idx, 1);

            socket.broadcast.emit('admin_data', {
                roomUsers: { room: roomId, users }
            });

            socket.to(roomId).emit('admin_message', {
                message: `'${currentUser.name}'가 방에서 나갔습니다. ${additionalMessage}`
            });
        }

        socket.broadcast.emit('notice', {
            message: `${currentUser.name}이(가) 접속을 종료했습니다!`
        });
        socket.broadcast.emit('admin_delete_data', { user: currentUser.key });

        redisClient.updateUserInactivated({ key: currentUser.key, lastSocketId: socketId });
        redisClient.updateUsernameInactivated({ name: currentUser.name, key: currentUser.key });
    });

    socket.on('register', async (data) => {
        const socketId = socket.id;
        let name = data.name && !(await redisClient.isActiveDuplicatedName({ name: data.name })) ? data.name : `유저${Date.now()}`;
        await redisClient.createUser({ lastSocketId: socketId, name });
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });

        if (name === data.name) {
            await redisClient.updateUserActivated({ key: currentUser.key });
            await redisClient.updateUsernameActivated({ name: currentUser.name, key: currentUser.key });
        }
        
        socket.broadcast.emit('notice', { message: `'${name}'이(가) 서버에 접속했습니다!` });
        socket.broadcast.emit('admin_data', { userMap: { [currentUser.key]: currentUser } });
        const userMap = {};
        const roomMap = {};
        const users = await redisClient.getUserList();
        const rooms = await redisClient.getRoomList();
        users.forEach(user => userMap[user.key] = user );
        rooms.forEach(room => roomMap[room.key] = { ...room, users: JSON.parse(room.users), password: undefined, isLocked: Boolean(password) } );

        socket.join(currentUser.key);
        socket.join('loud_speaker');
        
        io.in(currentUser.key).emit('admin_data', {
            id: currentUser.key,
            name,
            userMap,
            roomMap
        });
        io.in(currentUser.key).emit('admin_message', { message: `사용자 이름 '${name}'을(를) 부여받았습니다` });
    });

    socket.on('change_name', async (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { text: nickname } = data;

        if (await redisClient.isDuplicatedName({ name: nickname })) {
            io.in(currentUser.key).emit('admin_error', { message: `'${nickname}'은(는) 중복된 닉네임입니다` });
        } else {
            await redisClient.updateName({ key: currentUser.key, name: nickname });

            socket.broadcast.emit('admin_data', {
                userMap: { [socketId]: { ...currentUser, name: nickname } } 
            });
            socket.broadcast.emit('admin_message', {
                message: `유저 '${currentUser.name}'이(가) '${nickname}'로 이름을 변경했습니다!`
            });
            io.in(currentUser.key).emit('admin_data', { name: nickname });
            // io.to(socket.id).emit('admin_data', { name: nickname }); // Send to specific socket id
        }
    });

    socket.on('loud_speaker', async (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { text: message } = data;
        
        io.in('loud_speaker').emit('loud_speaker', { user: currentUser.name, message });
    });

    socket.on('update_loud_speaker_settings', async () => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });

        let loudSpeakerOn = undefined;

        if (socket.rooms.has('loud_speaker')) {
            loudSpeakerOn = false;
            socket.leave('loud_speaker');
        } else {
            loudSpeakerOn = true;
            socket.join('loud_speaker');
        }

        io.in(currentUser.key).emit('admin_data', { loudSpeakerOn });
        io.in(currentUser.key).emit('admin_message', { message: '확성기 설정을 변경했습니다' });
    });

    socket.on('create_room', async (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { text: title, arguments: invitedUsers, password } = data;

        if (title && invitedUsers && Array.isArray(invitedUsers) && invitedUsers.length > 0) {
            const users = await redisClient.getUserListByIds({ keys: invitedUsers });
            const userIds = [currentUser.key, ...users.map(user => user.key)];
            const userNames = [currentUser.name, ...users.map(user => user.name)];
            const message = `'${currentUser.name}'이(가) '${userNames.join(', ')}'을(를) '${title}'에 초대했습니다!`;

            const roomId = await redisClient.createRoom({ title, users: userIds, password });
            socket.join(roomId);
            
            userIds.forEach(userKey => {
                if (userKey !== currentUser.key) io.in(userKey).emit('invited_room', { room: roomId, message });
            });

            if (userIds.length <= 1) {
                return io.in(currentUser.key).emit('admin_error', { message: '방 만들기에 실패했습니다!' });
            }

            const room = await redisClient.getRoomItem({ key: roomId });
            
            io.emit('admin_data', { roomMap: { [roomId]: { ...room, users: JSON.parse(room.users), password: undefined, isLocked: Boolean(password) } } });
            io.in(roomId).emit('admin_data', { room: roomId });
            io.in(currentUser.key).emit('admin_message', { message });
        } else {
            io.in(currentUser.key).emit('admin_error', { message: `방을 만들 수 없습니다!` });
        }
    });

    socket.on('invited_room', async (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { room: roomId, message } = data;

        socket.join(roomId);
        io.in(currentUser.key).emit('admin_data', { room: roomId });
        io.in(currentUser.key).emit('admin_message', { message });
    });

    socket.on('send_message', async (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { text: message, room: roomId } = data;

        if (message && roomId) {
            io.in(roomId).emit('send_message', { user: currentUser.name, message });
        } else {
            io.in(currentUser.key).emit('admin_error', { message: `빈 메시지가 전달되었습니다!` });
        }
    });

    socket.on('join_room', async (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { room: roomId, password } = data;

        const room = redisClient.getRoomItem({ key: roomId });
        if (room.password && room.password !== password) {
            return io.in(currentUser.key).emit('admin_error', { message: `비밀번호가 틀렸습니다!` });
        }

        socket.join(roomId);
        await redisClient.addUserToRoom({ key: roomId, user: currentUser.key });

        io.emit('admin_data', { roomUsers: { room: roomId, users: JSON.parse((await redisClient.getRoomItem({ key: roomId })).users) } });
        io.in(roomId).emit('admin_data', { room: roomId });
        io.in(roomId).emit('admin_message', { message: `'${currentUser.name}'이(가) 방에 들어왔습니다!` });
    });

    socket.on('leave_room', async (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { room: roomId } = data;
        
        if (roomId) {
            socket.leave(roomId);

            const room = await redisClient.getRoomItem({ key: roomId });
            room.users = JSON.parse(room.users);
            if (room.users.length <= 1) {
                await redisClient.deleteRoom({ key: roomId });
                io.emit('admin_delete_data', { room: roomId });
                return io.in(currentUser.key).emit('admin_message', { message: '방에 남은 사람이 없어 방이 삭제되었습니다!' });
            }
            
            let additionalMessage = '';
            const idx = room.users.indexOf(currentUser.key);
            if (idx === 0) {
                additionalMessage += `기존 방 주인이었던 '${currentUser.name}'이(가) 나갔으므로 '${(await redisClient.getUserItemByKey({ key: room.users[1] })).name}'이(가) 방 주인이 됩니다.`;
            }

            await redisClient.deleteUserFromRoom({ key: roomId, user: currentUser.key });
            room.users.splice(idx, 1);

            io.emit('admin_data', { roomUsers: { room: roomId, users: room.users } });
            socket.to(roomId).emit('admin_message', {
                message: `'${currentUser.name}'가 방에서 나갔습니다. ${additionalMessage}`
            });
            io.in(currentUser.key).emit('admin_message', { message: '방에서 나왔습니다.'});
        } else {
            io.in(currentUser.key).emit('admin_error', { message: `정상적으로 방에서 나갈 수 없습니다!` });
        }
    });

    socket.on('update_room_password', async (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { room: roomId, password } = data;

        if (roomId) {
            await redisClient.updateRoomPassword({ key: roomId, password });

            io.in(currentUser.key).emit('admin_message', { message: '방 비밀번호를 변경했습니다.'});
            io.emit('admin_data', { roomIsLocked: { room: roomId, isLocked: Boolean(password) } });
        } else {
            io.in(currentUser.key).emit('admin_error', { message: `정상적으로 방 비밀번호를 변경할 수 없습니다!` });
        }
    });

    socket.on('kicked_out_room', (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { room: roomId, message } = data;

        socket.leave(roomId);
        io.in(currentUser.key).emit('admin_delete_data', { myRoom: true });
        io.in(currentUser.key).emit('admin_message', { message });
    })

    socket.on('kick_out_room', async (data) => {
        const { room: roomId, arguments: kickedOutUsers } = data;

        const room = await redisClient.getRoomItem({ key: roomId });
        room.users = JSON.parse(room.users);

        for (let i = 0; i < kickedOutUsers.length; i++) {
            const idx = room.users.indexOf(kickedOutUsers[0]);

            if (idx >= 0) {
                io.in(room.users[idx]).emit('blew_up_room', { room: roomId, message: '방에서 강퇴당했습니다.' });
                io.in(room.users[idx]).emit('admin_delete_data', { myRoom: true });
                await redisClient.deleteUserFromRoom({ key: roomId, user: room.users[idx] });
                room.users.splice(idx, 1);
            }
        }

        io.emit('admin_data', { roomUsers: { room: roomId, users: room.users } });
        io.in(roomId).emit('admin_message', { message: `유저 ${kickedOutUsers.length}명이 방에서 강퇴당했습니다.` });
        
    });

    socket.emit('blew_up_room', async () => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { room: roomId, message } = data;

        socket.leave(roomId);
        io.in(currentUser.key).emit('admin_delete_data', { myRoom: true });
        io.in(currentUser.key).emit('admin_message', { message });
    });

    socket.on('blow_up_room', async (data) => {
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { room: roomId } = data;

        const room = await redisClient.getRoomItem({ key: roomId });
        await redisClient.deleteRoom({ key: roomId });

        socket.leave(roomId);
        
        room.users.forEach(userKey => {
            if (userKey !== currentUser.key) io.in(userKey).emit('blew_up_room', { room: roomId, message: '방이 폭파되었습니다.' });
        });

        io.emit('admin_delete_data', { room: roomId });
        io.in(currentUser.key).emit('admin_message', { message: '방을 폭파했습니다.'});
    });

    socket.on('set_room_notice', (data) => {

    }); // TODO: 방 공지 설정(마스터 권한 필요)

    socket.on('invite_friend', (data) => {

    }); // TODO: 내가 있는 방에 친구 초대하기(비밀번호가 있어도 없는 것처럼 동작해야 함)
});

process.stdin.resume(); //so the program will not close instantly

const exitHandler = async (options, exitCode) => {
    await redisClient.updateAllUsersInactivated();
    await redisClient.deleteAllRooms();

    if (options.cleanup) console.log('clean');
    if (exitCode || exitCode === 0) {
        console.log(exitCode);
        process.exit();
    }
    if (options.exit) process.exit();
};

//do something when app is closing
process.on('exit', exitHandler.bind(null, {}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {}));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, {}));
process.on('SIGUSR2', exitHandler.bind(null, {}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {}));
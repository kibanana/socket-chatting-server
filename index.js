const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const socketIo = require('socket.io');
const redis = require('socket.io-redis');
const dataManager = require('./dataManager');
const dbManager = require('./dbManager');

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
        const currentUser = await dbManager.getUserItem({ lastSocketId: socketId });
        const roomList = await dbManager.getRoomList();
        const room = await dbManager.getRoomByUser({ userId: String(currentUser._id) });

        if (room) {
            const { _id: roomId, users } = roomList[i];
            const idx = users.indexOf(String(currentUser._id));

            socket.leave(roomId);

            if (users.length <= 1) {
                await dbManager.deleteRoom({ _id: roomId });
                return socket.broadcast.emit('admin_delete_data', { room: String(roomId) });
            }
            
            let additionalMessage = '';
            if (idx === 0) {
                additionalMessage += `기존 방 주인이었던 '${currentUser.name}'이(가) 나갔으므로 '${(await dbManager.getUserItemById({ _id: users[1] })).name}'이(가) 방 주인이 됩니다.`;
            }

            await dbManager.deleteUserFromRoom({ _id: roomId, user: currentUser._id });
            users.splice(idx, 1);

            socket.broadcast.emit('admin_data', {
                roomUsers: { room: String(roomId), users }
            });

            socket.to(roomId).emit('admin_message', {
                message: `'${currentUser.name}'가 방에서 나갔습니다. ${additionalMessage}`
            });
        }

        socket.broadcast.emit('notice', {
            message: `${currentUser.name}이(가) 접속을 종료했습니다!`
        });
        socket.broadcast.emit('admin_delete_data', { user: currentUser._id });

        dbManager.updateUserInactivated({ _id: currentUser._id });
    });

    socket.on('register', async (data) => {
        const socketId = socket.id;
        const name = (data.name && !(await dbManager.isActiveDuplicatedName({ name: data.name }))) ? data.name : `유저${Date.now()}`;
        await dbManager.createUser({ lastSocketId: socketId, name });
        const currentUser = await dbManager.getUserItem({ lastSocketId: socketId });

        socket.broadcast.emit('notice', { message: `'${name}'이(가) 서버에 접속했습니다!` });
        socket.broadcast.emit('admin_data', { userMap: { [String(currentUser._id)]: currentUser } });
        const userMap = {};
        const roomMap = {};
        (await dbManager.getUserList()).forEach(user => userMap[String(user._id)] = user );
        (await dbManager.getRoomList()).forEach(room => roomMap[String(room._id)] = room );
        
        socket.emit('admin_data', {
            id: String(currentUser._id),
            name,
            userMap,
            roomMap
        });
        socket.emit('admin_message', { message: `사용자 이름 '${name}'을(를) 부여받았습니다` });
    });

    socket.on('change_name', async (data) => {
        const socketId = socket.id;
        const currentUser = await dbManager.getUserItem({ lastSocketId: socketId });
        const { text: nickname } = data;

        if (await dbManager.isDuplicatedName({ name: nickname })) {
            socket.emit('admin_error', { message: `'${nickname}'은(는) 중복된 닉네임입니다` });
        } else {
            await dbManager.updateName({ _id: currentUser._id, name: nickname });

            socket.broadcast.emit('admin_data', {
                userMap: { [socketId]: { ...currentUser, name: nickname } } 
            });
            socket.broadcast.emit('admin_message', {
                message: `유저 '${currentUser.name}'이(가) '${nickname}'로 이름을 변경했습니다!`
            });
            socket.emit('admin_data', { name: nickname });
            // io.to(socket.id).emit('admin_data', { name: nickname }); // Send to specific socket id
        }
    });

    socket.on('loud_speaker', async (data) => {
        const socketId = socket.id;
        const currentUser = await dbManager.getUserItem({ lastSocketId: socketId });
        const { text: message } = data;

        // const connectedSocketIds = Array.from(io.sockets.sockets.keys());
        // users.forEach(user => {
        //     if (connectedSocketIds.includes(user.lastSocketId)) {
        //         io.sockets.sockets.get(user.lastSocketId).join(String(roomId));
        //     }
        // });

        const notDisabledLoudSpeakerUserList = await dbManager.getDisabledLoudSpeakerUserList();
        notDisabledLoudSpeakerUserList.forEach((user) => {
            io.to(user.lastSocketId).emit('loud_speaker', {
                user: currentUser.name,
                message
            });
        });
    });

    socket.on('update_loud_speaker_settings', async () => {
        const socketId = socket.id;
        const currentUser = await dbManager.getUserItem({ lastSocketId: socketId });
        let loudSpeakerOn = undefined;

        if (currentUser.disabledLoudSpeaker) loudSpeakerOn = true;
        else loudSpeakerOn = false;

        await dbManager.setDisabledLoudSpeaker({ _id: currentUser._id, value: !loudSpeakerOn });

        socket.emit('admin_data', { loudSpeakerOn });
        socket.emit('admin_message', { message: '확성기 설정을 변경했습니다' });
    });

    socket.on('create_room', async (data) => {
        const socketId = socket.id;
        const currentUser = await dbManager.getUserItem({ lastSocketId: socketId });
        const { text: title, arguments: invitedUsers, password } = data;

        if (title && invitedUsers && Array.isArray(invitedUsers) && invitedUsers.length > 0) {
            const users = await dbManager.getUserListByIds({ ids: invitedUsers });
            const userIds = [String(currentUser._id), ...users.map(user => String(user._id))];
            const userNames = [currentUser.name, ...users.map(user => user.name)];

            const { insertedId: roomId } = await dbManager.createRoom({ title, users: userIds });
            socket.join(String(roomId));
            const connectedSocketIds = Array.from(io.sockets.sockets.keys());
            users.forEach(user => {
                if (connectedSocketIds.includes(user.lastSocketId)) {
                    io.sockets.sockets.get(user.lastSocketId).join(String(roomId));
                }
            });

            if (userIds.length <= 1) {
                return socket.emit('admin_error', { message: '방 만들기에 실패했습니다!' });
            }
            
            io.emit('admin_data', { roomMap: { [String(roomId)]: (await dbManager.getRoomItem({ _id: roomId })) } });
            io.in(String(roomId)).emit('admin_data', { room: String(roomId) });
            io.in(String(roomId)).emit('admin_message', {
                message: `'${currentUser.name}'이(가) '${userNames.join(', ')}'을(를) '${title}'에 초대했습니다!`
            });
        } else {
            socket.emit('admin_error', { message: `방을 만들 수 없습니다!` });
        }
    });

    socket.on('send_message', async (data) => {
        const socketId = socket.id;
        const currentUser = await dbManager.getUserItem({ lastSocketId: socketId });
        const { text: message, room: roomId } = data;

        if (message && roomId) {
            io.in(String(roomId)).emit('send_message', { user: currentUser.name, message });
        } else {
            socket.emit('admin_error', { message: `빈 메시지가 전달되었습니다!` });
        }
    });

    socket.on('join_room', async (data) => {
        const socketId = socket.id;
        const currentUser = await dbManager.getUserItem({ lastSocketId: socketId });
        const { room: roomId } = data;

        socket.join(roomId);
        await dbManager.addUserToRoom({ _id: roomId, user: String(currentUser._id) });

        io.emit('admin_data', { roomUsers: { room: roomId, users: (await dbManager.getRoomItem({ _id: roomId })).users } });
        io.in(roomId).emit('admin_data', { room: roomId });
        io.in(roomId).emit('admin_message', { message: `'${currentUser.name}'이(가) 방에 들어왔습니다!` });
    }); // TODO: 방에 입장하기 -> 잠겨있을 때에는 비밀번호 보내야 함

    socket.on('leave_room', async (data) => {
        const socketId = socket.id;
        const currentUser = await dbManager.getUserItem({ lastSocketId: socketId });
        const { room: roomId } = data;
        
        if (roomId) {
            socket.leave(roomId);

            const room = await dbManager.getRoomItem({ _id: roomId });
            if (room.users.length <= 1) {
                await dbManager.deleteRoom({ _id: roomId });
                io.emit('admin_delete_data', { room: roomId });
                return socket.emit('admin_message', { message: '방에 남은 사람이 없어 방이 삭제되었습니다!' });
            }
            
            let additionalMessage = '';
            const idx = room.users.indexOf(String(currentUser._id));
            if (idx === 0) {
                additionalMessage += `기존 방 주인이었던 '${currentUser.name}'이(가) 나갔으므로 '${(await dbManager.getUserItemById({ _id: room.users[1] })).name}'이(가) 방 주인이 됩니다.`;
            }

            await dbManager.deleteUserFromRoom({ _id: roomId, user: String(currentUser._id) });
            room.users.splice(idx, 1);

            io.emit('admin_data', { roomUsers: { room: roomId, users: room.users } });
            socket.to(roomId).emit('admin_message', {
                message: `'${currentUser.name}'가 방에서 나갔습니다. ${additionalMessage}`
            });
            socket.emit('admin_message', { message: '방에서 나왔습니다.'});
        } else {
            socket.emit('admin_error', { message: `정상적으로 방에서 나갈 수 없습니다!` });
        }
    });

    // socket.on('lock_room') // TODO: 방 비밀번호 설정
    // socket.on('update_room_password') // TODO: 방 비밀번호 변경

    // socket.on('') // TODO: 방에서 강퇴시키기(마스터 권한 필요)
    // socker.on('') // TODO: 방 폭파(마스터 권한 필요)

    // socket.on('') // TOOD: 권한 넘기기(마스터 권한 필요)

    // socket.on('set_room_notice') // 방 공지 설정(마스터 권한 필요)
    // socket.on('set_room_color') // 방 대표색 설정(마스터 권한 필요)

    // socket.on('invite_friend') // TODO: 내가 있는 방에 친구 초대하기(비밀번호가 있어도 없는 것처럼 동작해야 함)
});

process.stdin.resume(); //so the program will not close instantly

const exitHandler = async (options, exitCode) => {
    await dbManager.updateAllUsersInactivated();
    await dbManager.deleteAllRooms();

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
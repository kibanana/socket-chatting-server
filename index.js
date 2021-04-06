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

const io = socketIo(server, {
    pingTimeout: 60000,
    pingInterval: 60000
});

dataManage.setIo(io);

let userIndex = 1;

io.on('connection', (socket) => {
    socket.on('disconnect', () => {
        const socketId = socket.id;

        socket.broadcast.emit('notice', { message: `${dataManage.getUser(socketId).name}이(가) 접속을 종료했습니다!` });
        socket.broadcast.emit('admin_delete_data', { user: socketId });
        // TODO: 방에서 나가기 처리
        dataManage.unsetUser(socketId);
    });

    socket.on('register', () => {
        const socketId = socket.id;
        // const ipAddress = socket.handshake.address.replace(`::ffff:`, ``);

        const username = `유저${userIndex++}`;
        dataManage.setSocket(socket);
        dataManage.setUser(socketId, { name: username, createdAt: new Date() });

        socket.broadcast.emit('notice', { message: `'${username}'이(가) 서버에 접속했습니다!` });
        socket.broadcast.emit('admin_data', { userMap: { [socketId]: dataManage.getUser(socketId) } });
        socket.emit('admin_message', {
            message: `사용자 이름 '${username}'을(를) 부여받았습니다`,
            name: username,
            userMap: dataManage.getUserMap(),
            roomMap: dataManage.getRoomMap()
        });
    });

    socket.on('change_name', (data) => {
        const socketId = socket.id;

        if (dataManage.getUserNames().includes(data.text)) {
            socket.emit('admin_error', { message: `'${data.text}'은(는) 중복된 닉네임입니다` });
        } else {
            const user = dataManage.getUser(socketId);
            dataManage.setUser(socketId, { name: data.text });
            socket.broadcast.emit('admin_message', {
                message: `유저 '${user.name}'이(가) '${data.text}'로 이름을 변경했습니다!`,
                userMap: { [socketId]: dataManage.getUser(socketId) } 
            });
            socket.emit('admin_data', { name: data.text });
            // io.to(socket.id).emit('admin_data', { name: data.text }); // Send to specific socket id
        }
    });

    socket.on('global_message', (data) => {
        dataManage.getSocketIds().forEach(socketId => {
            if (!dataManage.getDisableLoudSpeakerKeys().includes(socketId)) {
                io.to(socketId).emit('global_message', {
                    user: dataManage.getUser(socket.id).name,
                    message: data.text
                });
            }
        });
    });

    socket.on('update_global_message_settings', () => {
        const socketId = socket.id;
        let loudSpeakerOn = undefined;
        
        if (dataManage.getDisableLoudSpeakerKeys().includes(socketId)) {
            dataManage.unsetDisableLoudSpeaker(socketId);
            loudSpeakerOn = true;
        } else {
            dataManage.setDisableLoudSpeaker(socketId);
            loudSpeakerOn = false;
        }

        socket.emit('admin_message', { message: '확성기 설정을 변경했습니다', loudSpeakerOn });
    });

    socket.on('create_room', (data) => {
        if (data.text) {
            dataManage.setRoom(data.text, { password: data.password, users: [socket.id], createdAt: new Date() });

            const usernames = [];
            socket.join(data.text);
            if (data.arguments && Array.isArray(data.arguments) && data.arguments.length > 0) {
                data.arguments.forEach(socketId => {
                    dataManage.addUserToRoom(data.text, socketId);
                    usernames.push(dataManage.getUser(socketId).name);
                    dataManage.getSocket(socketId).join(data.text);
                });
            } else {
                const filteredSockets = dataManage.getSockets().filter(tempSocket => tempSocket.id !== socket.id);
                filteredSockets.forEach(tempSocket => {
                    const user = dataManage.getUser(tempSocket.id);
                    if (user) {
                        dataManage.addUserToRoom(data.text, tempSocket.id);
                        usernames.push(user.name);
                        tempSocket.join(data.text);
                    }
                });
            }

            if (usernames.length <= 0) {
                dataManage.unsetRoom(data.text);
                return socket.emit('admin_error', { message: '방 만들기에 실패했습니다!' })
            }

            socket.broadcast.emit('admin_data', { roomMap: { [data.text]: dataManage.getRoom(data.text) } })
            io.in(data.text).emit('admin_message', {
                message: `'${dataManage.getUser(socket.id).name}'이(가) '${usernames.join(', ')}'을(를) '${data.text}'에 초대했습니다!`,
                room: data.text
            });
        } else {
            socket.emit('admin_error', { message: `방 이름이 전달되지 않았습니다!` });
        }
    });

    socket.on('send_message', (data) => {
        const socketId = socket.id;

        if (data.text && data.room) {
            io.in(data.room).emit('send_message', {
                user: dataManage.getUser(socketId).name,
                message: data.text
            });
        } else {
            socket.emit('admin_error', { message: `빈 메시지가 전달되었습니다!` });
        }
    });

    // socket.on('update_room_password') // TODO: 방 정보 변경
    // socket.on('lock_room') // TODO: 방 비밀번호 설정
    // socket.on('delete_room') // TODO: 방 삭제하기

    // socket.on('') // TODO: 방에서 강퇴시키기

    socket.on('join_room', (data) => {
        socket.join(data.room);
        dataManage.addUserToRoom(data.room, socketId);
        io.in(data.room).emit('admin_message', {
            message: `'${dataManage.getUser(socketId).name}'이(가) 방에 들어왔습니다!`,
            room: data.room
        });
        socket.broadcast.emit('admin_data', { room: data.room, roomUser: dataManage.getRoomUsers(data.room) });
    }); // TODO: 방에 입장하기 -> 잠겨있을 때에는 비밀번호 보내야 함

    socket.on('leave_room', (data) => {
        const socketId = socket.id;

        if (data.room) {
            socket.leave(data.room);
            dataManage.deleteUserFromRoom(data.room, socketId);

            socket.emit('admin_message', {
                message: '방에서 나왔습니다'
            });
            socket.to(data.room).emit('admin_message', {
                message: `'${dataManage.getUser(socketId).name}'가 방에서 나갔습니다.`
            });

            const users = dataManage.getRoomUsers;
            if (users.length <= 0) {
                socket.broadcast.emit('admin_delete_data', { room: data.room });
            } else {
                socket.broadcast.emit('admin_data', { room: data.room, roomUser: dataManage.getRoomUsers(data.text) });
            }
        } else {
            socket.emit('admin_error', { message: `정상적으로 방에서 나갈 수 없습니다!` });
        }
    });

    // socket.on('bookmark_room') // TODO: 특정 방 즐겨찾기 목록에 추가

    // socket.on('invite_friend') // TODO: 내가 있는 방에 친구 초대하기(비밀번호가 있어도 없는 것처럼 동작해야 함)

    // socket.on('set_room_notice') // 방 공지 설정(마스터 권한 필요)
    // socket.on('set_room_color') // 방 대표색 설정(마스터 권한 필요)

    // socket.on('update_global_user') // TODO: 현재 id 없이 친구추가할 수 있는 유저(광장 개념)
    // socket.on('update_global_user_settings') // TODO: 다른 유저들이 id 없이 나를 친구추가할 수 있는가? yes/no

    // socket.on('get_friend_list') // TODO: 모든 친구 정보 가져오기
    // socket.on('get_user_info') // TODO: 특정 친구 정보 가져오기
    // socket.on('add_friend') // TODO: 친구추가(양방향)
    // socket.on('delete_friend') // TODO: 친구삭제(양방향) -> 예전에 친구관계였지만 지금은 친구삭제된 것 명시

    // socket.on('switch_all_alarm') // TODO: 전체 방(광장) 알림 설정 변경
});
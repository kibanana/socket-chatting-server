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
    socket.on('disconnect', () => {
        dataManage.unsetUser(socket.id);
    });

    socket.on('register', () => {
        // const ipAddress = socket.handshake.address.replace(`::ffff:`, ``);

        const username = `유저${userIndex++}`;
        socket.broadcast.emit('notice', { message: `${username}이(가) 서버에 접속했습니다!` });
        socket.emit('admin_message', { message: `사용자 이름 '${username}'을(를) 부여받았습니다`, name: username });
        dataManage.setUser(socket.id, { name: username });
    });

    socket.on('change_name', (data) => {
        if (dataManage.getUserNames().includes(data.text)) {
            socket.emit('admin_error', { message: `'${data.text}'은(는) 중복된 닉네임입니다` });
        } else {
            const user = dataManage.getUser(socket.id);
            socket.broadcast.emit('notice', { message: `유저 '${user.name}'이(가) '${data.text}'로 이름을 변경했습니다!` });
            socket.emit('admin_data', { name: data.text });
            // io.to(socket.id).emit('admin_data', { name: data.text }); // Send to specific socket id
            dataManage.setUser(socket.id, { name: data.text });
        }
    });

    socket.on('global_message', (data) => {
        const user = dataManage.getUser(socket.id);

        socket.broadcast.emit('global_message', { user: user.name, message: data.text });
    });

    socket.on('update_global_message_settings', () => {
        let loudSpeakerOn = undefined;
        
        if (dataManage.getDisableLoudSpeakerKeys().includes(socket.id)) {
            dataManage.unsetDisableLoudSpeaker(socket.id);
            loudSpeakerOn = true;
        } else {
            dataManage.setDisableLoudSpeaker(socket.id);
            loudSpeakerOn = false;
        }

        socket.emit('admin_message', { message: '확성기 설정을 변경했습니다', loudSpeakerOn });
    });

    // socket.on('create_room') // TODO: 방 만들기 -> 방에 초대할 유저 목록 보내야 함
    // socket.on('update_room') // TODO: 방 정보 변경
    // socket.on('lock_room') // TODO: 방 비밀번호 설정
    // socket.on('delete_room') // TODO: 방 삭제하기

    // socket.on('get_room_list') // TODO: 모든 방 정보 가져오기
    // socket.on('get_room_info') // TODO: 방 정보 가져오기(현재 활동중인 유저 정보 포함)
    // socket.on('join_room') // TODO: 방에 입장하기 -> 잠겨있을 때에는 비밀번호 보내야 함
    // socket.on('leave_room') // TODO: 방에서 나가기
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
    // socket.on('switch_specific_alarm') // TODO: 특정 방 알림 변경
});
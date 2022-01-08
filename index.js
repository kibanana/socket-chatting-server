const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const dataManager = require('./dataManager');
// const dbManager = require('./dbManager');
const redisClient = require('./cacheManager');
const {
    roomEventType: {
        roomDeleteData,
        roomSendData,
        roomSendError,
        roomSendMessage
    },
    systemEventType: {
        systemDeleteData,
        systemSendData,
        systemSendError,
        systemSendMessage
    },
    userEventType: {
        userRegister,
        userNotice,
        userChangeName,
        userLoudSpeaker,
        userUpdateLoudSpeakerSettings,
        userCreateRoom,
        usetGetRoomInvitation,
        userSendMessage,
        userJoinRoom,
        userLeaveRoom,
        userUpdateRoomPassword,
        userKickOutRoom,
        userBlowUpRoom,
        userSetRoomNotice,
        userSendRoomInvitation
    }
} = require('./lib');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const server = http.createServer(app);
server.listen(process.env.PORT || 3000, () => {
    console.log('Server is running!');
})

mongoose.connect('mongodb://localhost:27017', {
    useUnifiedTopology: true,
    useNewUrlParser: true,
    dbName: 'socket_chatting'
});
mongoose.connection.once('open', () => {
    console.log('DB is connected!');
})

const io = require('socket.io')(server, {
    pingTimeout: 60000,
    pingInterval: 60000
});
io.adapter(require('socket.io-redis')({
    host: '127.0.0.1',
    port: 6379
}));

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

                return socket.broadcast.emit(systemDeleteData, {
                    room: roomId
                });
            }
            
            let additionalMessage = '';
            if (idx === 0) {
                additionalMessage += `방 주인 '${currentUser.name}'이(가) 나갔으므로 '${(await redisClient.getUserItemByKey({ key: users[1] })).name}'이(가) 새로운 방 주인이 됩니다.`;
            }

            await redisClient.deleteUserFromRoom({ key: roomId, user: currentUser.key });

            users.splice(idx, 1);

            socket.broadcast.emit(systemSendData, {
                roomUsers: {
                    room: roomId,
                    users
                }
            });
            socket.to(roomId).emit(roomSendMessage, {
                message: `'${currentUser.name}'이(가) 방에서 나갔습니다. ${additionalMessage}`
            });
        }

        socket.broadcast.emit(userNotice, {
            message: `${currentUser.name}이(가) 접속을 종료했습니다.`
        });
        socket.broadcast.emit(systemDeleteData, {
            user: currentUser.key
        });

        redisClient.updateUserInactivated({ key: currentUser.key, lastSocketId: socketId });
        redisClient.updateUsernameInactivated({ name: currentUser.name, key: currentUser.key });
    });

    socket.on(userRegister, async (data) => {
        const socketId = socket.id;
        let name = data.name && !(await redisClient.isActiveDuplicatedName({ name: data.name })) ? data.name : `유저${Date.now()}`;
        await redisClient.createUser({ lastSocketId: socketId, name });
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });

        if (name === data.name) {
            await redisClient.updateUserActivated({ key: currentUser.key });
            await redisClient.updateUsernameActivated({ name: currentUser.name, key: currentUser.key });
        }
        
        socket.broadcast.emit(userNotice, {
            message: `'${name}'이(가) 접속했습니다.`
        });
        socket.broadcast.emit(systemSendData, {
            userMap: {
                [currentUser.key]: currentUser
            }
        });

        const userMap = {};
        const roomMap = {};
        const users = await redisClient.getUserList();
        const rooms = await redisClient.getRoomList();
        users.forEach(user => userMap[user.key] = user );
        rooms.forEach(room => roomMap[room.key] = { ...room, users: JSON.parse(room.users), password: undefined, isLocked: Boolean(password) } );

        socket.join(currentUser.key);
        socket.join('loud_speaker');
        
        io.in(currentUser.key).emit(systemSendData, {
            id: currentUser.key,
            name,
            userMap,
            roomMap
        });
        io.in(currentUser.key).emit(systemSendMessage, {
            message: `내 이름: '${name}'`
        });
    });

    socket.on(userChangeName, async (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { text: nickname } = data;

        if (await redisClient.isDuplicatedName({ name: nickname })) {
            io.in(currentUser.key).emit(systemSendError, {
                message: `'${nickname}'은(는) 중복되는 닉네임입니다.`
            });
        } else {
            await redisClient.updateName({ key: currentUser.key, name: nickname });

            socket.broadcast.emit(systemSendData, {
                userMap: {
                    [socketId]: {
                        ...currentUser,
                        name: nickname
                    }
                } 
            });
            socket.broadcast.emit(systemSendMessage, {
                message: `'${currentUser.name}'이(가) '${nickname}'로 이름을 변경했습니다.`
            });
            io.in(currentUser.key).emit(systemSendData, {
                name: nickname
            });
            // io.to(socket.id).emit(systemSendData, { name: nickname }); // Send to specific socket id
        }
    });

    socket.on(userLoudSpeaker, async (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { text: message } = data;
        
        io.in('loud_speaker').emit(userLoudSpeaker, {
            user: currentUser.name,
            message
        });
    });

    socket.on(userUpdateLoudSpeakerSettings, async () => {
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

        io.in(currentUser.key).emit(systemSendData, {
            loudSpeakerOn
        });
        io.in(currentUser.key).emit(systemSendMessage, {
            message: `확성기 설정을 변경했습니다`
        });
    });

    socket.on(userCreateRoom, async (data) => {
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
                if (userKey !== currentUser.key) {
                    io.in(userKey).emit(usetGetRoomInvitation, {
                        room: roomId, message
                    });
                }
            });

            if (userIds.length <= 1) {
                return io.in(currentUser.key).emit(systemSendError, {
                    message: `방을 생성하던 중 오류가 발생했습니다!`
                });
            }

            const room = await redisClient.getRoomItem({ key: roomId });
            
            io.emit(systemSendData, {
                roomMap: {
                    [roomId]: {
                        ...room,
                        users: JSON.parse(room.users),
                        password: undefined,
                        isLocked: Boolean(password)
                    }
                }
            });
            io.in(roomId).emit(roomSendData, {
                room: roomId
            });
            io.in(currentUser.key).emit(systemSendMessage, {
                message
            });
        } else {
            io.in(currentUser.key).emit(systemSendError, {
                message: `방을 생성하던 중 오류가 발생했습니다! 잠시후 다시 시도해주세요`
            });
        }
    });

    socket.on(usetGetRoomInvitation, async (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { room: roomId, message } = data;

        socket.join(roomId);
        io.in(currentUser.key).emit(systemSendData, {
            room: roomId
        });
        io.in(currentUser.key).emit(systemSendMessage, {
            message
        });
    });

    socket.on(userSendMessage, async (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { text: message, room: roomId } = data;

        if (message && roomId) {
            io.in(roomId).emit(userSendMessage, {
                user: currentUser.name,
                message
            });
        } else {
            io.in(currentUser.key).emit(systemSendError, {
                message: `메시지를 전송하던 도중 오류가 발생했습니다!`
            });
        }
    });

    socket.on(userJoinRoom, async (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { room: roomId, password } = data;

        const room = redisClient.getRoomItem({ key: roomId });
        if (room.password && room.password !== password) {
            return io.in(currentUser.key).emit(systemSendError, {
                message: `틀린 비밀번호입니다!`
            });
        }

        socket.join(roomId);
        await redisClient.addUserToRoom({ key: roomId, user: currentUser.key });
        const users = JSON.parse((await redisClient.getRoomItem({ key: roomId })).users)

        io.emit(systemSendData, {
            roomUsers: {
                room: roomId,
                users
            }
        });
        io.in(roomId).emit(roomSendData, {
            room: roomId
        });
        io.in(roomId).emit(roomSendMessage, {
            message: `'${currentUser.name}'이(가) 방에 들어왔습니다.`
        });
    });

    socket.on(userLeaveRoom, async (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { room: roomId } = data;
        
        if (roomId) {
            socket.leave(roomId);

            const room = await redisClient.getRoomItem({ key: roomId });
            room.users = JSON.parse(room.users);

            if (room.users.length <= 1) {
                await redisClient.deleteRoom({ key: roomId });

                io.emit(systemDeleteData, {
                    room: roomId
                });

                return io.in(currentUser.key).emit(systemSendMessage, {
                    message: '사람이 없어 방이 삭제되었습니다!'
                });
            }
            
            let additionalMessage = '';
            const idx = room.users.indexOf(currentUser.key);
            if (idx === 0) {
                additionalMessage += `방 주인 '${currentUser.name}'이(가) 나갔으므로 '${(await redisClient.getUserItemByKey({ key: users[1] })).name}'이(가) 새로운 방 주인이 됩니다.`;
            }

            await redisClient.deleteUserFromRoom({ key: roomId, user: currentUser.key });
            room.users.splice(idx, 1);

            io.emit(systemSendData, {
                roomUsers: {
                    room: roomId,
                    users: room.users
                }
            });
            socket.to(roomId).emit(roomSendMessage, {
                message: `'${currentUser.name}'가 방에서 나갔습니다. ${additionalMessage}`
            });
            io.in(currentUser.key).emit(systemSendMessage, {
                message: `방에서 나왔습니다.`
            });
        } else {
            io.in(currentUser.key).emit(systemSendError, {
                message: `방에서 나가던 도중 오류가 발생했습니다!`
            });
        }
    });

    socket.on(userUpdateRoomPassword, async (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { room: roomId, password } = data;

        if (roomId) {
            await redisClient.updateRoomPassword({ key: roomId, password });

            io.in(currentUser.key).emit(systemSendMessage, {
                message: `방 비밀번호가 변경되었습니다.`
            });
            io.emit(systemSendData, {
                roomIsLocked: {
                    room: roomId,
                    isLocked: Boolean(password)
                }
            });
        } else {
            io.in(currentUser.key).emit(systemSendError, {
                message: `방 비밀번호를 변경하던 도중 오류가 발생했습니다!`
            });
        }
    });

    socket.on(userKickOutRoom, (data) => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { room: roomId, message } = data;

        socket.leave(roomId);
        io.in(currentUser.key).emit(systemDeleteData, {
            myRoom: true
        });
        io.in(currentUser.key).emit(systemSendMessage, {
            message
        });
    })

    socket.on(userKickOutRoom, async (data) => {
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { room: roomId, arguments: kickedOutUsers } = data;

        if (kickedOutUsers && Array.isArray(kickedOutUsers) && kickedOutUsers.length > 0) {
            const room = await redisClient.getRoomItem({ key: roomId });
            room.users = JSON.parse(room.users);
    
            for (let i = 0; i < kickedOutUsers.length; i++) {
                const idx = room.users.indexOf(kickedOutUsers[0]);
    
                if (idx >= 0) {
                    io.in(room.users[idx]).emit(userBlowUpRoom, {
                        room: roomId,
                        message: `방장이 나를 강퇴시켰습니다.`
                    });
                    io.in(room.users[idx]).emit(systemDeleteData, {
                        myRoom: true
                    });
                    
                    await redisClient.deleteUserFromRoom({ key: roomId, user: room.users[idx] });
                    room.users.splice(idx, 1);
                }
            }

            io.emit(systemSendData, {
                roomUsers: {
                    room: roomId,
                    users: room.users
                }
            });
            io.in(roomId).emit(roomSendMessage, {
                message: `유저 ${kickedOutUsers.length}명이 방에서 강퇴 처리되었습니다.`
            });
        } else {
            io.in(currentUser.key).emit(systemSendError, {
                message: `유저를 방에서 강퇴시키던 도중 오류가 발생했습니다!`
            });
        }
    });

    socket.emit(userBlowUpRoom, async () => {
        const socketId = socket.id;
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { room: roomId, message } = data;

        socket.leave(roomId);
        io.in(currentUser.key).emit(systemDeleteData, {
            myRoom: true
        });
        io.in(currentUser.key).emit(systemSendMessage, {
            message
        });
    });

    socket.on(userBlowUpRoom, async (data) => {
        const currentUser = await redisClient.getUserBySocketId({ key: socketId });
        const { room: roomId } = data;

        const room = await redisClient.getRoomItem({ key: roomId });
        await redisClient.deleteRoom({ key: roomId });

        socket.leave(roomId);
        
        room.users.forEach(userKey => {
            if (userKey !== currentUser.key) {
                io.in(userKey).emit(userBlowUpRoom, {
                    room: roomId,
                    message: '방이 폭파되었습니다.'
                });
            }
        });

        io.emit(systemDeleteData, {
            room: roomId
        });
        io.in(currentUser.key).emit(systemSendMessage, {
            message: '방을 폭파했습니다.'
        });
    });

    socket.on(userSetRoomNotice, (data) => {

    }); // TODO: 방 공지 설정(마스터 권한 필요)

    socket.on(userSendRoomInvitation, (data) => {

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
let io = undefined;
const socketMap = {};
const userMap = {};
const roomMap = {};
const disableLoudSpeaker = {};

const setIo = (newIo) => io = newIo;
const getIo = () => io;

const setSocket = (socket) => socketMap[socket.id] = socket;
const getSocket = (socketId) => socketMap[socketId];
const getSockets = () => Object.values(socketMap);

const getSocketIds = () => Object.keys(userMap);

const setUser = (socketId, values = {}) => {
    if (!userMap[socketId]) userMap[socketId] = {};
    Object.keys(values).map(key => userMap[socketId][key] = values[key]);
};
const unsetUser = (socketId) => {
    delete userMap[socketId];
};
const getUserMap = () => userMap;
const getUser = (socketId) => userMap[socketId];
const getUserNames = () => Object.values(userMap).map(user => user.name);

const setRoom = (key, password, users) => roomMap[key] = { password, users };
const unsetRoom = (key) => delete roomMap[key];

const getRoomPassword = (key) => roomMap[key].password;
const getRoomUsers = (key) => roomMap[key].users;

const deleteRoomUser = (key, idx) => roomMap[key].users.splice(idx, 1);

const setDisableLoudSpeaker = (socketId) => disableLoudSpeaker[socketId] = true;
const unsetDisableLoudSpeaker = (socketId) => delete disableLoudSpeaker[socketId];
const getDisableLoudSpeakerKeys = () => Object.keys(disableLoudSpeaker);

module.exports = {
    setIo,
    getIo,

    setSocket,
    getSocket,
    getSockets,
    getSocketIds,

    setUser,
    unsetUser,
    getUserMap,
    getUser,
    getUserNames,

    setRoom,
    unsetRoom,

    getRoomPassword,
    getRoomUsers,

    deleteRoomUser,

    setDisableLoudSpeaker,
    unsetDisableLoudSpeaker,
    getDisableLoudSpeakerKeys
};

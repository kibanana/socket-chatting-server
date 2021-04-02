let io = undefined;
const socketMap = {};
const userMap = {};
const roomMap = {};
const disableLoudSpeaker = {};

const setIo = (newIo) => io = newIo;
const getIo = () => io;

const setSocket = (socket) => socketMap[socket.id] = socket;
const getSockets = () => Object.values(socketMap);

const getSocketIds = () => Object.keys(userMap);

const setUser = (socketId, values = {}) => {
    if (!userMap[socketId]) userMap[socketId] = {};
    Object.keys(values).map(key => userMap[socketId][key] = values[key]);
};
const unsetUser = (socketId) => {
    delete userMap[socketId];
};
const getUser = (socketId) => userMap[socketId];
const getUserNames = () => Object.values(userMap).map(user => user.name);

const setRoom = (key, password) => roomMap[key] = password

const setDisableLoudSpeaker = (socketId) => disableLoudSpeaker[socketId] = true;
const unsetDisableLoudSpeaker = (socketId) => delete disableLoudSpeaker[socketId];
const getDisableLoudSpeakerKeys = () => Object.keys(disableLoudSpeaker);

module.exports = {
    setIo,
    getIo,

    setSocket,
    getSockets,
    getSocketIds,

    setUser,
    unsetUser,
    getUser,
    getUserNames,

    setRoom,

    setDisableLoudSpeaker,
    unsetDisableLoudSpeaker,
    getDisableLoudSpeakerKeys
};

let io = undefined;

const socketMap = {};
const userMap = {};
const roomMap = {};
const disableLoudSpeaker = {};

// io
const setIo = (newIo) => io = newIo;
const getIo = () => io;

// socketMap: { [socket.id]: socket }
const setSocket = (socket) => socketMap[socket.id] = socket;
const getSockets = () => Object.values(socketMap);
const getSocket = (socketId) => socketMap[socketId];

// userMap: { socketId: { [key]: value } }
const setUser = (socketId, values = {}) => {
    if (!userMap[socketId]) userMap[socketId] = {};
    Object.keys(values).map(key => userMap[socketId][key] = values[key]);
};
const unsetUser = (socketId) => {
    delete userMap[socketId];
};
const getUserMap = () => userMap;
const getUser = (socketId) => userMap[socketId];
const getUserKeys = () => Object.keys(userMap);
const getUserNames = () => Object.values(userMap).map(user => user.name);

// roomMap
const setRoom = (roomId, values = {}) => {
    if (!roomMap[roomId]) roomMap[roomId] = {};
    Object.keys(values).map(key => roomMap[roomId][key] = values[key]);
}
const unsetRoom = (roomId) => delete roomMap[roomId];

const addUserToRoom = (roomId, socketId) => roomMap[roomId].users.push(socketId);
const deleteUserFromRoom = (roomId, socketId) => {
    const idx = roomMap[roomId].users.indexOf(socketId);
    roomMap[roomId].users.splice(idx, 1);
}

const getRoomMap = () => roomMap;
const getRoom = (roomId) => roomMap[roomId];

// disableLoudSpeaker
const setDisableLoudSpeaker = (socketId) => disableLoudSpeaker[socketId] = true;
const unsetDisableLoudSpeaker = (socketId) => delete disableLoudSpeaker[socketId];
const getDisableLoudSpeakerKeys = () => Object.keys(disableLoudSpeaker);

module.exports = {
    setIo,
    getIo,

    setSocket,
    getSockets,
    getSocket,

    setUser,
    unsetUser,
    getUserMap,
    getUser,
    getUserKeys,
    getUserNames,

    setRoom,
    unsetRoom,
    addUserToRoom,
    deleteUserFromRoom,
    getRoomMap,
    getRoom,

    setDisableLoudSpeaker,
    unsetDisableLoudSpeaker,
    getDisableLoudSpeakerKeys
};

let io = undefined;
const userMap = {};
const disableLoudSpeaker = {};

const setIo = (newIo) => io = newIo;
const getIo = () => io;

const setUser = (socketId, values = {}) => {
    if (!userMap[socketId]) userMap[socketId] = {};
    Object.keys(values).map(key => userMap[socketId][key] = values[key]);
};
const unsetUser = (socketId) => {
    delete userMap[socketId];
};
const getUser = (socketId) => userMap[socketId];
const getUserNames = () => Object.values(userMap).map(user => user.name);

const setDisableLoudSpeaker = (socketId) => disableLoudSpeaker[socketId] = true;
const unsetDisableLoudSpeaker = (socketId) => delete disableLoudSpeaker[socketId];
const getDisableLoudSpeakerKeys = () => Object.keys(disableLoudSpeaker);

module.exports = {
    setIo,
    getIo,

    setUser,
    unsetUser,
    getUser,
    getUserNames,

    setDisableLoudSpeaker,
    unsetDisableLoudSpeaker,
    getDisableLoudSpeakerKeys
};

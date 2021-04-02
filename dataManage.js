let io = undefined;
const socketIdMap = {};
const userMap = {};

const setIo = (newIo) => io = newIo;
const getIo = () => io;
const setSocketId = (ipAddress, socketId) => socketIdMap[ipAddress] = socketId;
const getSocketId = (ipAddress) => socketIdMap[ipAddress];
const setUser = (ipAddress) => userMap[ipAddress] = {};
const getUser = () => userMap[ipAddress];

module.exports = {
    setIo,
    getIo,
    setSocketId,
    getSocketId,
    setUser,
    getUser
};

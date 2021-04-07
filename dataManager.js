let io = undefined;

// io
const setIo = (newIo) => io = newIo;
const getIo = () => io;

module.exports = {
    setIo,
    getIo
};
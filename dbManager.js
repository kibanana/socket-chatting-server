const { ObjectId } = require('mongodb');
const { connection } = require('mongoose');

const userColl = connection.collection('users');
const roomColl = connection.collection('rooms');

// users
const createUser = (params) => {
    const { name, lastSocketId } = params;
    return userColl.insertOne({ name, lastSocketId, createdAt: new Date(), updatedAt: new Date(), lastLoginDate: new Date() });
};

const getUserList = () => {
    return userColl.find();
};

const getUserItem = (params) => {
    const { lastSocketId } = params;
    return userColl.find({ lastSocketId });
};

const getAllIds = () => {
    return userColl.find({}, { projection: { _id: true } });
};

const getAllNames = () => {
    return userColl.find({}, { projection: { name: true } });
};

const setDisabledLoudSpeaker = (params) => {
    const { _id, value } = params;
    return userColl.update({ _id: ObjectId(_id) }, { $set: { disabledLoudSpeaker: value, updatedAt: new Date() } });
};

const getDisabledLoudSpeakerUserList = () => {
    return userColl.find({ disabledLoudSpeaker: true });
};

// rooms
const createRoom = (params) => {
    const { title, password, users } = params;
    return roomColl.insertOne({ title, password, users, createdAt: new Date() });
};

const deleteRoom = (params) => {
    const { _id } = params;
    return roomColl.deleteOne({ _id: new ObjectId(_id) });
};

const addUserToRoom = (params) => {
    const { user } = params;
    return roomColl.update({ $push: { users: user } });
};

const deleteUserToRoom = (params) => {
    const { user } = params;
    return roomColl.update({ $pull: { users: user } });
};

const getRoomList = () => {
    return roomColl.find();
};

const getRoomItem = (params) => {
    const { _id } = params;
    return roomColl.find({ _id: new ObjectId(_id) });
};

module.expors = {
    createUser,
    getUserList,
    getUserItem,
    getAllIds,
    getAllNames,
    setDisabledLoudSpeaker,
    getDisabledLoudSpeakerUserList,
    
    createRoom,
    deleteRoom,
    addUserToRoom,
    deleteUserToRoom,
    getRoomList,
    getRoomItem  
};

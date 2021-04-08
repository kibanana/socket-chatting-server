const { ObjectId } = require('mongodb');
const { connection } = require('mongoose');

const userColl = connection.collection('users');
const roomColl = connection.collection('rooms');

// users
const createUser = (params) => {
    const { name, lastSocketId } = params;
    return userColl.updateOne({ name }, { $set: { lastSocketId, lastLoginDate: new Date(), active: true } }, { upsert: true });
};

const updateName = (params) => {
    const { _id, name } = params;
    return userColl.updateOne({ _id: ObjectId(_id) }, { $set: { name, updatedAt: new Date() } });
};

const updateUserInactivated = (params) => {
    const { _id } = params;
    return userColl.updateOne({ _id: ObjectId(_id) }, { $set: { active: false, updatedAt: new Date() }});
};

const getUserListByIds = (params) => {
    const { ids } = params;
    return userColl.find({ _id: { $in: ids.filter(id => id.length === 24).map(id => new ObjectId(id)) } }).toArray();
};

const getUserList = () => {
    return userColl.find({ active: true }).toArray();
};

const getUserItemById = (params) =>{
    const { _id } = params;
    return userColl.findOne({ _id: ObjectId(_id) });
};

const getUserItem = (params) => {
    const { lastSocketId } = params;
    return userColl.findOne({ lastSocketId });
};

const isDuplicatedName = async (params) => {
    const { name } = params;
    return (await userColl.countDocuments({ name })) > 0;
};

const isActiveDuplicatedName = async (params) => {
    const { name } = params;
    return (await userColl.countDocuments({ name, active: true })) > 0;
};

const setDisabledLoudSpeaker = (params) => {
    const { _id, value } = params;
    return userColl.updateOne({ _id: ObjectId(_id) }, { $set: { disabledLoudSpeaker: value, updatedAt: new Date() } });
};

const getNotDisabledLoudSpeakerUserList = () => {
    return userColl.find({ disabledLoudSpeaker: { $ne: true } }, { projection: { lastSocketId: true } }).toArray();
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
    const { _id, user } = params;
    return roomColl.updateOne({ _id: new ObjectId(_id) }, { $push: { users: user } });
};

const deleteUserFromRoom = (params) => {
    const { _id, user } = params;
    return roomColl.updateOne({ _id: new ObjectId(_id) }, { $pull: { users: user } });
};

const getRoomList = () => {
    return roomColl.find().toArray();
};

const getRoomItem = (params) => {
    const { _id } = params;
    return roomColl.findOne({ _id: new ObjectId(_id) });
};

const getRoomByUser = (params) => {
    const { userId } = params;
    return roomColl.findOne({ users: { $elemMatch: userId } });
};

const updateAllUsersInactivated = () => {
    return userColl.updateMany({}, { $set: { active: false } });
};

const deleteAllRooms = () => {
    return roomColl.deleteMany();
};

module.exports = {
    createUser,
    updateName,
    updateUserInactivated,
    getUserListByIds,
    getUserList,
    getUserItemById,
    getUserItem,
    isDuplicatedName,
    isActiveDuplicatedName,
    setDisabledLoudSpeaker,
    getNotDisabledLoudSpeakerUserList,
    
    createRoom,
    deleteRoom,
    addUserToRoom,
    deleteUserFromRoom,
    getRoomList,
    getRoomItem,
    getRoomByUser,

    updateAllUsersInactivated,
    deleteAllRooms
};

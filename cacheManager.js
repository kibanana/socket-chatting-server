const redis = require('redis');
const { promisify } = require('util');

class RedisClient {
	constructor () {
		this.client = redis.createClient('http://localhost:6379');

		// this.client.auth('', (err) => {
		//   if (err) console.error(err)
		// });

		this.client.on('connect', () => console.log('Cache is connected'));
		
		this.client.on('error', (err) => {
			if (err) console.error(err);
		});

		this.getAsync= promisify(this.client.GET).bind(this.client);
		this.setAsync = promisify(this.client.SET).bind(this.client);
		this.delAsync = promisify(this.client.DEL).bind(this.client);
		this.hmsetAsync = promisify(this.client.HMSET).bind(this.client);
		this.hgetallAsync = promisify(this.client.HGETALL).bind(this.client);
		this.mgetAsync = promisify(this.client.MGET).bind(this.client);
		this.keysAsync = promisify(this.client.KEYS).bind(this.client);
		this.incrAsync = promisify(this.client.INCR).bind(this.client);
		this.multiAsync = promisify(this.client.MULTI).bind(this.client);
	}

    // users
    async createUser(params) {
        const { name, lastSocketId } = params;

		const matchedKey = await this.getAsync(`username:${name}`);
		if (matchedKey) {
			await this.setAsync(`socketid:${lastSocketId}`, matchedKey);
			return matchedKey;
		}

		await this.incrAsync('userkey');
		const key = `activeuser:${Number(await this.getAsync('userkey'))}`;
		await this.hmsetAsync(key, { key, name, createdAt: new Date(), updatedAt: new Date() });
		await this.setAsync(`socketid:${lastSocketId}`, key);
		await this.setAsync(`username:${name}`, key);
		return key;
    };

    async updateName(params) {
        const { key, name } = params;

		const user = await this.hgetallAsync(key);
		await this.hmsetAsync(key, { ...user, name, updatedAt: new Date() });
		const usernameKeys = await this.keysAsync('username:*');
		const usernameValues = await this.mgetAsync(usernameKeys);
		for (let i = 0; i < usernameValues.length; i++) {
			if (usernameValues[i] === key) {
				await this.delAsync(usernameKeys[i]);
				break;
			}
		}
		return this.setAsync(`username:${name}`, key);
    };

    async updateUserInactivated(params) {
        const { key, lastSocketId } = params;

		if (key.startsWith('activeuser:')) {
			const user = await this.hgetallAsync(key);
			await this.hmsetAsync(key.replace('active', 'inactive'), { ...user, key: key.replace('active', 'inactive'), updatedAt: new Date() });
			await this.delAsync(key);
			return this.delAsync(`socketid:${lastSocketId}`);
		}
    };

	async updateUserActivated(params) {
		const { key } = params;

		if (key.startsWith('inactiveuser:')) {
			const user = await this.hgetallAsync(key);
			await this.hmsetAsync(key.replace('inactive', 'active'), { ...user, key: key.replace('inactive', 'active'), updatedAt: new Date() });
			return this.delAsync(key);
		}
	}

    async getUserListByIds(params) {
        const { keys } = params;

		const result = [];
		for (let i = 0; i < keys.length; i++) {
			result.push(await this.hgetallAsync(keys[i]));
		}

		return result;
    };

    async getUserList() {
		const keys = await this.keysAsync('activeuser:*');

		const result = [];
		for (let i = 0; i < keys.length; i++) {
			result.push(await this.hgetallAsync(keys[i]));
		}

		return result;
    };

    async getUserBySocketId(params) {
		const { key } = params;

		const userKey = await this.getAsync(`socketid:${key}`)
		return (await this.hgetallAsync(userKey));
    };

	getUserKey(params) {
		const { lastSocketId } = params;

		return this.getAsync(`socketid:${lastSocketId}`);
    };

	getUserItemByKey(params) {
		const { key } = params;

		return this.hgetallAsync(key);
	};

    async getUserItem(params) {
		const { lastSocketId } = params;

		const key = await this.getAsync(`socketid:${lastSocketId}`);
		return this.hgetallAsync(key);
    };

    async isDuplicatedName(params) {
        const { name } = params;

		const matchedKey = await this.getAsync(`username:${name}`);
		if (matchedKey) return true;
		return false;
    };

    async isActiveDuplicatedName(params) {
		const { name } = params;

		const matchedKey = await this.getAsync(`username:${name}`);
		if (matchedKey && matchedKey.startsWith('activeuser:')) return true;
		return false;
    };

	async updateUsernameInactivated(params) {
		const { name, key } = params;

		return this.setAsync(`username:${name}`, key.replace('active', 'inactive'));
	};

	async updateUsernameActivated(params) {
		const { name, key } = params;

		return this.setAsync(`username:${name}`, key.replace('inactive', 'active'));
	};

    // rooms
    async createRoom(params) {
		const { title, users, password } = params;

		await this.incrAsync('roomkey');
		const key = `room:${Number(await this.getAsync('roomkey'))}`;
		await this.hmsetAsync(key, { key, title, users: JSON.stringify(users), password });
		return key;
    };

    deleteRoom(params) {
        const { key } = params;

		return this.delAsync(key);
    };

    async addUserToRoom(params) {
		const { key, user } = params;

		const room = await this.hgetallAsync(key);
		return this.hmsetAsync(key, { ...room, users: JSON.stringify([...JSON.parse(room.users), user]) });
    };

    async deleteUserFromRoom(params) {
        const { key, user } = params;

		const room = await this.hgetallAsync(key);
		room.users = JSON.parse(room.users);
		room.users.splice(room.users.indexOf(user), 1);
		room.users = JSON.stringify(room.users)
		return this.hmsetAsync(key, { ...room });
    };

    async getRoomList() {
        const keys = await this.keysAsync('room:*');

		const result = [];
		for (let i = 0; i < keys.length; i++) {
			result.push(await this.hgetallAsync(keys[i]));
		}

		return result;
    };

    getRoomItem(params) {
        const { key } = params;

		return this.hgetallAsync(key);
    };

    async getRoomByUser(params) {
        const { userId } = params;

		const keys = this.keysAsync('room:*');
		const rooms = [];
		for (let i = 0; i < keys.length; i++) {
			rooms.push(await this.hgetallAsync(keys[i]));
		}

		for (let i = 0; i < rooms.length; i++) {
			if (rooms[i].includes(userId)) {
				return rooms[i];
			}
		}
    };

	async updateRoomPassword(params) {
		const { key, password } = params;

		const room = await this.hgetallAsync(key);
		return this.hmsetAsync(key, { ...room, password });
	}

    async updateAllUsersInactivated() {
		const activeUserkeys = await this.keysAsync('activeuser:*');
		const socketIdkeys = await this.keysAsync('socketid:*');
		const usernamekeys = await this.keysAsync('username:*');

		for (let i = 0; i < activeUserkeys.length; i++) {
			const user = await this.hgetallAsync(activeUserkeys[i]);
			await this.hmsetAsync(activeUserkeys[i].replace('active', 'inactive'), { ...user, key: activeUserkeys[i].replace('active', 'inactive'), updatedAt: new Date() });
			await this.delAsync(activeUserkeys[i]);
		}

		for (let i = 0; i < socketIdkeys.length; i++) {
			await this.delAsync(socketIdkeys[i]);
		}

		for (let i = 0; i < usernamekeys.length; i++) {
			await this.delAsync(usernamekeys[i]);
		}
    };

    async deleteAllRooms() {
		const keys = await this.keysAsync('room:*');
		for (let i = 0; i < keys.length; i++) {
			await this.delAsync(keys[i]);
		}
    };
}

const redisClient = new RedisClient();

module.exports = redisClient;
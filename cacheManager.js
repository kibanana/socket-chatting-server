import redis from 'redis';
import { promisify } from 'util';

class RedisClient {
	constructor () {
		this.client = redis.createClient('http://localhost:6379');

		// this.client.auth('', (err) => {
		//   if (err) console.error(err)
		// });

		this.client.on('connect', () => console.log('connected'));
		
		this.client.on('error', (err) => {
			if (err) console.error(err);
		});

		this.getAsync= promisify(this.client.GET).bind(this.client);
		this.setAsync = promisify(this.client.SET).bind(this.client);
		this.delAsync = promisify(this.client.DEL).bind(this.client);
		this.hmsetAsync = promisify(this.client.HMSET).bind(this.client);
		this.mgetAsync = promisify(this.client.MGET).bind(this.client);
		this.keysAsync = promisify(this.client.KEYS).bind(this.client);
		this.incrAsync = promisify(this.client.INCR).bind(this.client);
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

		const user = await this.getAsync(key);
		await this.hmsetAsync(key, { ...user, name, updatedAt: new Date() });
		const usernameKeys = await this.keysAsync('username:*');
		const usernameValues = await this.mgetAsync(usernameKeys);
		for (let i = 0; i < usernameValues.length; i++) {
			if (usernameValues[i] === key) {
				await this.delAsync(usernameKeys[i]);
				break;
			}
		}
		return this.hmsetAsync(`username:${name}`, key);
    };

    async updateUserInactivated(params) {
        const { key, lastSocketId } = params;

		if (key.includes('activeuser:')) {
			const user = await this.getAsync(key);
			await this.hmsetAsync(key.replace('active', 'inactive'), { ...user, updatedAt: new Date() });
			await this.delAsync(key);
			return this.delAsync(`socketid:${lastSocketId}`);
		}
    };

    getUserListByIds(params) {
        const { keys } = params;

		return this.mgetAsync(keys);
    };

    async getUserList() {
		const keys = await this.keysAsync('activeuser:*');

		return this.mgetAsync(keys);
    };

    async getUserBySocketId(params) {
		const { key } = params;

		return this.getAsync((await this.getAsync(key)));
    };

	getUserKey(params) {
		const { lastSocketId } = params;

		return this.getAsync(`socketid:${lastSocketId}`);
    };

	getUserItemByKey(params) {
		const { key } = params;

		return this.getAsync(key);
	};

    async getUserItem(params) {
		const { lastSocketId } = params;

		const key = await this.getAsync(`socketid:${lastSocketId}`);
		return this.getAsync(key);
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
		if (matchedKey && matchedKey.includes('activeuser:')) return true;
		return false;
    };

    // rooms
    async createRoom(params) {
		const { title, users } = params;

		await this.incrAsync('roomkey');
		const key = `room:${Number(await this.getAsync('roomkey'))}`;
		await this.hmsetAsync(key, { key, title, users });
		return key;
    };

    deleteRoom(params) {
        const { key } = params;

		return this.delAsync(key);
    };

    async addUserToRoom(params) {
		const { key, user } = params;

		const room = await this.getAsync(key);
		return this.hmsetAsync(key, { ...room, users: [...room.users, user] });
    };

    async deleteUserFromRoom(params) {
        const { key, user } = params;

		const room = await this.getAsync(key);
		room.splice(room.users.indexOf(user), 1);
		return this.hmsetAsync(key, { ...room });
    };

    async getRoomList() {
        const keys = await this.keysAsync('room:*');

		return this.mgetAsync(keys);
    };

    getRoomItem(params) {
        const { key } = params;

		return this.getAsync(key);
    };

    async getRoomByUser(params) {
        const { userId } = params;

		const keys = this.keysAsync('room:*');
		const rooms = await this.mgetAsync(keys);

		for (let i = 0; i < rooms.length; i++) {
			if (rooms[i].includes(userId)) {
				return rooms[i];
			}
		}
    };

    async updateAllUsersInactivated() {
		const activeUserkeys = await this.keysAsync('activeuser:*');
		const socketIdkeys = await this.keysAsync('socketid:*');

		for (let i = 0; i < activeUserkeys.length; i++) {
			const user = await this.getAsync(activeUserkeys[i]);
			await this.hmsetAsync(activeUserkeys[i].replace('active', 'inactive'), { ...user, updatedAt: new Date() });
			await this.delAsync(activeUserkeys[i]);
		}

		for (let i = 0; i < socketIdkeys.length; i++) {
			await this.delAsync(socketIdkeys[i]);
		}
    };

    async deleteAllRooms() {
		const keys = await this.keysAsync('room:*');
		for (let i = 0; i < keys.length; i++) {
			await this.delAsync(keys[i]);
		}
    };
}

const redisClient = new RedisClient()

export default redisClient
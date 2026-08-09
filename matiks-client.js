class MatiksClient {
  constructor() {
    this.apiUrl = 'https://server.matiks.com/api';
    this.graphqlUrl = 'https://server.matiks.com/api';
  }

  static normalizeBearerToken(value) {
    if (!value || value.trim() === '') {
      return null;
    }

    const candidate = value.trim();
    return candidate.toLowerCase().startsWith('bearer ') ? candidate : `Bearer ${candidate}`;
  }

  async getCookieHeader(domain = 'server.matiks.com') {
    const domains = Array.from(new Set([
      'server.matiks.com',
      '.server.matiks.com',
      'matiks.com',
      '.matiks.com',
      'server.matiks.org',
      '.server.matiks.org'
    ]));

    const cookiePromises = domains.map((candidate) => new Promise((resolve) => {
      chrome.cookies.getAll({ domain: candidate }, (cookies) => {
        resolve(cookies || []);
      });
    }));

    const cookieLists = await Promise.all(cookiePromises);
    const allCookies = cookieLists.flat();

    const cookieHeader = allCookies
      .filter((cookie) => cookie && cookie.name && cookie.value)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');

    return cookieHeader;
  }

  getCookieHeaderFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['matiksSessionCookie'], (result) => {
        const cookie = result.matiksSessionCookie || '';
        resolve(cookie);
      });
    });
  }

  async getFriendRecords(filters = {}) {
    const userQuery = filters.friendQuery || `query GetFriends {
      getFriends(page: 1, pageSize: 30) {
        results {
          friendInfo {
            _id
            userStreaks {
              lastPlayedDate
            }
          }
        }
        pageNumber
        pageSize
        hasMore
        totalResults
      }
    }`;

    const authHeaderValue = MatiksClient.normalizeBearerToken(filters.authorizationToken || '') || filters.authorizationToken || '';

    const payload = {
      query: userQuery
    };

    const cookieHeader = await this.getCookieHeader();

    const headers = {
      'content-type': 'application/json',
      authorization: authHeaderValue
    };

    if (cookieHeader) {
      headers.cookie = cookieHeader;
    }

    const response = await fetch(this.graphqlUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Matiks GraphQL friend query failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    const payloadData = json && json.data ? json.data : {};

    const records = this.extractFriendRecords(payloadData);
    this.lastFriendRecords = records;

    return records;
  }

  async getFriendIds(filters = {}) {
    const records = await this.getFriendRecords(filters);
    return records.map((record) => record.userId);
  }

  extractFriendRecords(data) {
    const records = [];

    if (data && data.getFriends && Array.isArray(data.getFriends.results)) {
      data.getFriends.results.forEach((row) => {
        const friendInfo = row && row.friendInfo ? row.friendInfo : {};
        const userId = friendInfo._id || row.receiverId || row.senderId || row._id;

        if (!userId) {
          return;
        }

        const streaks = friendInfo.userStreaks || {};
        const lastPlayedDate = streaks.lastPlayedDate || null;

        records.push({
          userId: String(userId),
          lastPlayedDate,
          raw: row
        });
      });
    }

    return records;
  }

  extractFriendIds(data) {
    const records = this.extractFriendRecords(data);

    if (records.length > 0) {
      return records.map((record) => record.userId);
    }

    const keys = ['getFriends', 'friends', 'friendList', 'socialGraph'];

    for (const key of keys) {
      if (data && data[key]) {
        const source = data[key];
        const ids = this.walkFriendList(source);
        if (ids.length > 0) {
          return ids;
        }
      }
    }

    return this.flatIds(data);
  }

  walkFriendList(value) {
    const ids = [];

    function visit(item) {
      if (!item || typeof item !== 'object') {
        return;
      }

      const directId = item.userId || item.id || item.friendId || item.friend_id;
      if (directId) {
        ids.push(String(directId));
      }

      if (Array.isArray(item)) {
        item.forEach(visit);
      } else {
        Object.values(item).forEach((child) => {
          if (child && typeof child === 'object') {
            visit(child);
          }
        });
      }
    }

    visit(value);
    return ids;
  }

  flatIds(data) {
    if (!data || typeof data !== 'object') {
      return [];
    }

    const ids = [];
    const queue = [data];

    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') {
        continue;
      }

      if (typeof current.userId !== 'undefined' || typeof current.id !== 'undefined') {
        const candidate = current.userId || current.id || current.friendId;
        if (candidate) {
          ids.push(String(candidate));
        }
      }

      for (const value of Object.values(current)) {
        if (Array.isArray(value)) {
          queue.push(...value);
        } else if (value && typeof value === 'object') {
          queue.push(value);
        }
      }
    }

    return ids;
  }

  async removeFriend(userId, options = {}) {
    const auth = MatiksClient.normalizeBearerToken(options.authorizationToken || '') || options.authorizationToken || '';
    const cookieHeader = options.cookieHeader || (await this.getCookieHeader());

    const payload = {
      operationName: 'RemoveFriend',
      variables: {
        removeFriendInput: {
          userId: String(userId)
        }
      },
      query: 'mutation RemoveFriend($removeFriendInput: RemoveFriendInput!) {\n  removeFriend(removeFriendInput: $removeFriendInput)\n}'
    };

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: auth,
        cookie: cookieHeader
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`removeFriend failed for ${userId}: ${response.status} ${response.statusText} ${errorText}`);
    }

    return response;
  }

  async resolveFilters(records, filters = {}) {
    const rawItems = Array.isArray(records) ? records : [];

    const include = (filters.includeIds || '')
      .split(/\s|,|\n/)
      .map((value) => value.trim())
      .filter(Boolean);

    const exclude = (filters.excludeIds || '')
      .split(/\s|,|\n/)
      .map((value) => value.trim())
      .filter(Boolean);

    const includeSet = new Set(include);
    const excludeSet = new Set(exclude);

    let selectedRecords = rawItems.map((record) => {
      if (typeof record === 'string') {
        return { userId: record, lastPlayedDate: null, raw: null };
      }

      return record;
    });

    if (include.length > 0) {
      selectedRecords = selectedRecords.filter((record) => includeSet.has(record.userId || record.id || record));
    }

    if (exclude.length > 0) {
      selectedRecords = selectedRecords.filter((record) => !excludeSet.has(record.userId || record.id || record));
    }

    const inactiveDays = Number(filters.inactiveDays || filters.lastPlayedDays || filters.inactiveForDays || 0);

    if (inactiveDays > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - inactiveDays);

      selectedRecords = selectedRecords.filter((record) => {
        const dateValue = record.lastPlayedDate || record.userStreaks?.lastPlayedDate || null;

        if (!dateValue) {
          return true;
        }

        const parsed = new Date(dateValue);
        if (Number.isNaN(parsed.getTime())) {
          return true;
        }

        return parsed < cutoff;
      });
    }

    if (filters.maxFriends > 0) {
      selectedRecords = selectedRecords.slice(0, Number(filters.maxFriends));
    }

    const selectedIds = selectedRecords.map((record) => record.userId || record.id || record);

    if (filters.reverseFilter) {
      const allIds = Array.isArray(records) ? records.map((record) => record.userId || record.id || record) : [];
      const selected = new Set(selectedIds);
      const reversed = allIds.filter((id) => !selected.has(id));
      return [...new Set(reversed)];
    }

    return [...new Set(selectedIds)];
  }
}

globalThis.MatiksClient = MatiksClient;

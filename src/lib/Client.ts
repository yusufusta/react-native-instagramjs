import fetch from 'cross-fetch';
import { Cookie } from 'tough-cookie';
import getUserAgent from '../utils/user-agents';
import {stringify} from 'query-string';
import md5 from 'md5';

class Client {
    private readonly baseUrl = 'https://www.instagram.com';
    private readonly baseUrlApi = 'https://i.instagram.com';

    private sharedData: any;
    public userAgent: string;
    private csrftoken: undefined | string;
    private credentials!: {
        username: string;
        password: string;
    };
    private cookies: any;

    public constructor() {
        this.userAgent = getUserAgent();
    }

    public async login({ username, password }: { username: string; password: string }) {
        this.credentials.username = username;
        this.credentials.password = password;

        const responseData: any = await (await this.fetch('/')).json();
        const matches = responseData?.body?.match(/(csrf_token":")\w+/g);

        this.csrftoken = matches![0].substring(13);

        const res = await this.fetch('/accounts/login/ajax/', {
            method: 'POST',
            body: { username: this.credentials.username, enc_password: this.encPassword }
        });

        if (!res.headers.get('set-cookie')) {
            throw new Error('No cookie');
        }

        // @ts-expect-error
        const cookies: Cookie[] = res.headers.get('set-cookie')?.map(Cookie.parse);

        this.csrftoken = cookies?.find(({ key }: { key: string }) => key === 'csrftoken')?.toJSON().value;

        this.cookies = cookies.map((cookie: Cookie) => cookie?.toJSON() as Cookie);

        this.sharedData = await this.getSharedData();

        return res.body;
    }

    public async loginWithCookies(cookiesJson: any) {
        const cookies: Cookie[] = cookiesJson?.map((cookie: any) => Cookie?.fromJSON(cookie) as Cookie);
        this.csrftoken = cookies?.find(({ key }: { key: string }) => key === 'csrftoken')?.toJSON().value;
        this.cookies = cookies.map((cookie: Cookie) => cookie?.cookieString() as string).join('; ');
        this.sharedData = await this.getSharedData();
        return;
    }

    public async getUser({ username }: { username: string }) {
        const res = await this.fetch(`/${username}/?__a=1`, {
            method: 'GET',
            headers: {
                Referer: `${this.baseUrl}/${username}/'`,
                'x-instagram-gis': await this.getGis(`/${username}/`)
            }
        });
        const data: any = await res.json();
        return data.graphql.user;
    }

    public async getMediaByShortCode({ shortcode }: { shortcode: string }) {
        const res = await this.fetch(`/p/${shortcode}/?__a=1`, {
            method: 'GET',
            headers: {
                Referer: `${this.baseUrl}/p/${shortcode}/'`,
                'x-instagram-gis': await this.getGis(`/p/${shortcode}/`)
            }
        });
        const data: any = await res.json();
        return data.graphql.shortcode_media;
    }

    public async likeById({ id }: { id: number }) {
        const res = await this.fetch(`/web/likes/${id}/like/`, {
            method: 'POST',
            body: ""
        });
        const data: any = await res.json();
        return data;
    }

    public async unlikeById({ id }: { id: number }) {
        const res = await this.fetch(`/web/likes/${id}/unlike/`, {
            method: 'POST',
            body: ""
        });
        const data: any = await res.json();
        return data;
    }

    public async commentById({ id, comment, replyToCommentId }: { id: number, comment: string, replyToCommentId?: number }) {
        const res = await this.fetch(`/web/comments/${id}/add/`, {
            method: 'POST',
            body: {
                comment_text: comment,
                replied_to_comment_id: replyToCommentId
            },
            headers: {
                Referer: `${this.baseUrl}/p/${id}/'`,
                'content-type': "application/x-www-form-urlencoded"
            }
        });
        const data: any = await res.json();
        return data;
    }

    public async getMe() {
        const userData = (await this.getSharedData("/accounts/edit/")).config.viewer;
        return userData;
    }

    public async followById({ id }: { id: number }) {
        const res = await this.fetch(`/web/friendships/${id}/follow/`, {
            method: 'POST',
            body: ""
        });
        const data: any = await res.json();
        return data;
    }

    public async unfollowById({ id }: { id: number }) {
        const res = await this.fetch(`/web/friendships/${id}/unfollow/`, {
            method: 'POST',
            body: ""
        });
        const data: any = await res.json();
        return data;
    }

    async getFollowings({
        userId,
        nextMaxId = null
    }: {
        userId: number,
        nextMaxId?: any
    }) {
        const res = await this.fetch(`/api/v1/friendships/${userId}/following/?count=12${nextMaxId != null ? `&max_id=${nextMaxId}` : ""}`, {
            method: 'GET',
            isApi: true,
            headers: {
                Referer: `${this.baseUrl}/`,
                Origin: this.baseUrl,
                "x-ig-app-id": 936619743392459,
            }
        });
        const data: any = await res.json();
        return data;
    }

    async getFollowers({
        userId,
        nextMaxId = null
    }: {
        userId: number,
        nextMaxId?: any
    }) {
        const res = await this.fetch(`/api/v1/friendships/${userId}/followers/?count=12${nextMaxId != null ? `&max_id=${nextMaxId}` : ""}`, {
            method: 'GET',
            isApi: true,
            headers: {
                Referer: this.baseUrl,
                "x-ig-app-id": 936619743392459,
            }
        });
        const data: any = await res.json();
        return data;
    }

    private async getSharedData(url = '/') {
        return this.fetch(url)
            .then((res) => res.text())
            .then((html) => html.split('window._sharedData = ')[1].split(';</script>')[0])
            .then((_sharedData) => JSON.parse(_sharedData));
    }

    private async getGis(path: string) {
        const { rhx_gis } = this.sharedData || (await this.getSharedData(path));

        return md5(`${rhx_gis}:${path}`);
    }

    private async fetch(
        path: string,
        { method, headers, body, isApi = false }: { method: string; headers?: any; body?: any, isApi?: boolean } = {
            method: 'GET',
            headers: {},
            body: {}
        }
    ) {
        const options = {
            method,
            headers: {
                'User-Agent': this.userAgent,
                'Accept-Language': 'en-US',
                'X-Instagram-AJAX': '1',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': this.csrftoken || '',
                'Cookie': this.cookies,
                
                ...headers
            }
        };

        if (method !== 'GET') Object.assign(options, { body: stringify(body) });
        const res = await fetch(`${isApi ? this.baseUrlApi : this.baseUrl}${path}`, options);

        return res;
    }

    private get encPassword() {
        return `#PWD_INSTAGRAM_BROWSER:0:${Date.now()}:${this.credentials.password}`;
    }
}

export { Client };

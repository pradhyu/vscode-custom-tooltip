import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export interface JsonPostConfig {
    url: string;
    method: string;
    headers: Record<string, string>;
}

export interface JsonPostResult {
    success: boolean;
    data?: any;
    error?: string;
    statusCode?: number;
}

export class JsonPoster {
    async post(jsonContent: string, config: JsonPostConfig): Promise<JsonPostResult> {
        if (!config.url || config.url.trim() === '') {
            return {
                success: false,
                error: 'No URL configured. Please set commandOutputHover.jsonPostUrl in settings.'
            };
        }

        try {
            // Validate JSON
            JSON.parse(jsonContent);
        } catch (error) {
            return {
                success: false,
                error: `Invalid JSON: ${error}`
            };
        }

        return new Promise((resolve) => {
            try {
                const url = new URL(config.url);
                const isHttps = url.protocol === 'https:';
                const httpModule = isHttps ? https : http;

                const options = {
                    hostname: url.hostname,
                    port: url.port || (isHttps ? 443 : 80),
                    path: url.pathname + url.search,
                    method: config.method,
                    headers: {
                        ...config.headers,
                        'Content-Length': Buffer.byteLength(jsonContent)
                    }
                };

                const req = httpModule.request(options, (res) => {
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                            try {
                                const parsedData = JSON.parse(data);
                                resolve({
                                    success: true,
                                    data: parsedData,
                                    statusCode: res.statusCode
                                });
                            } catch {
                                // Response is not JSON, return as string
                                resolve({
                                    success: true,
                                    data: data,
                                    statusCode: res.statusCode
                                });
                            }
                        } else {
                            resolve({
                                success: false,
                                error: `HTTP ${res.statusCode}: ${data}`,
                                statusCode: res.statusCode
                            });
                        }
                    });
                });

                req.on('error', (error) => {
                    resolve({
                        success: false,
                        error: `Request failed: ${error.message}`
                    });
                });

                req.write(jsonContent);
                req.end();
            } catch (error) {
                resolve({
                    success: false,
                    error: `Failed to make request: ${error}`
                });
            }
        });
    }
}

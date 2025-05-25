import { PlayViewUniteReply, PlayViewUniteReq } from '@proto/bilibili/app/playerunite/v1/player';
import { PGCAnyModel } from '@proto/bilibili/app/playerunite/pgcanymodel/pgcanymodel';
import { BizType, ConfType } from '@proto/bilibili/playershared/playershared';
import { ClipInfo, ClipType } from '@proto/bilibili/pgc/gateway/player/v2/playurl';
import { av2bv } from '@util/bilibili';

const url = $request.url;

if (url.endsWith('/PlayViewUnite')) {
    handlePlayViewUniteReq($request);
} else {
    $done({});
}

function handlePlayViewUniteReq({ url, headers, body }) {
    const binaryBody = getBinaryBody(body);
    const message = PlayViewUniteReq.fromBinary(binaryBody);
    const { vod, bvid } = message;
    const { aid, cid } = vod || {};
    Promise.all([fetchOriginalRequest(url, headers, body), fetchBilijumpData(cid !== '0' ? cid : '')])
        .then(([{ headers, body }, segments]) => {
            $done({ response: { headers, body: newRawBody(handlePlayViewUniteReply(body, segments, cid)) } });
        })
        .catch(err => {
            console.log(err?.toString());
            $done({});
        });
}

function fetchOriginalRequest(url, headers, body): Promise<{ headers; body }> {
    const params = {
        url,
        headers,
        body,
        'binary-mode': true,
    };
    return new Promise((resolve, reject) => {
        $httpClient.post(params, (error, response, data) => {
            if (response?.status !== 200) {
                reject('Fetch Original Request Failed');
            } else {
                resolve({
                    headers: response.headers,
                    body: data,
                });
            }
        });
    });
}

function fetchBilijumpData(cid): Promise<number[][]> {
    const params = {
        url: `https://api.cloudflare.com/client/v4/accounts/34c49ed8e1d2bd41c330fb65de4c5890/d1/database/c1ad567a-2375-49b4-83e2-d1de52a0902f/query`,
        headers: {
            "Authorization": `Bearer Dmlpe9TkvsvBCE0N-FkqeRkN5ANCyHTnUSnAtGCH`,
        	"Content-Type": "application/json",
        },
        body: JSON.stringify({sql: "SELECT data,model FROM bilijump WHERE cid = ? LIMIT 1;", params: [cid]}),
    };
    return new Promise(resolve => {
        $httpClient.post(params, (error, response, data) => {
            if (response?.status !== 200) {
                resolve([]);
            } else {
            	const responseData = JSON.parse(data as string);
            	const innerData = JSON.parse(responseData?.result?.[0]?.results?.[0]?.data || '{}');
            	const segments = innerData?.ads?.reduce((result, ad) => {
                    const startTime = parseFloat(ad.start_time);
                    const endTime = parseFloat(ad.end_time);
                    if (!isNaN(startTime) && !isNaN(endTime)) {
                        result.push([startTime, endTime]);
                    }
                    return result;
                }, []);
                resolve(segments);
            }
        });
    });
}

function handlePlayViewUniteReply(body, segments: number[][], cid) {
    const emptyBytes = new Uint8Array(0);
    const binaryBody = getBinaryBody(body);
    const message = PlayViewUniteReply.fromBinary(binaryBody);

    if (message.viewInfo) {
        message.viewInfo.promptBar = emptyBytes;
    }
    if (!segments.length && message.playArcConf?.arcConfs) {
        Object.values(message.playArcConf.arcConfs).forEach(item => {
            if (item.isSupport && item.disabled) {
                item.disabled = false;
                item.extraContent = undefined;
                item.unsupportScene.length = 0;
            }
        });
    }
    if (segments?.length) {
        console.log(`${cid}: ${JSON.stringify(segments)}`);

        const arcConfs = message.playArcConf?.arcConfs || {};
        [ConfType.SKIPOPED].forEach(i => {
            arcConfs[i] = {
                isSupport: true,
                disabled: false,
                unsupportScene: [],
            };
        });
        [ConfType.FREYAENTER, ConfType.FREYAFULLENTER].forEach(i => {
            arcConfs[i] = {
                isSupport: false,
                disabled: true,
                unsupportScene: [],
            };
        });

        if (message.vodInfo) {
            message.vodInfo.streamList.forEach(item => {
                delete item.streamInfo?.needVip;
            });
        }

        if (message.playArc) {
            message.playArc.videoType = BizType.PGC;
        }

        message.supplement = {
            typeUrl: 'type.googleapis.com/bilibili.app.playerunite.pgcanymodel.PGCAnyModel',
            value: PGCAnyModel.toBinary(getPGCAnyModel(segments)),
        };
    }

    return PlayViewUniteReply.toBinary(message);
}

function getPGCAnyModel(segments: number[][]): PGCAnyModel {
    return {
        business: {
            clipInfo: getClipInfo(segments),
            vipStatus: 1,
            episodeInfo: {
                epId: 1231523,
                cid: '27730904912',
                aid: '113740078909891',
                epStatus: '2',
                seasonInfo: {
                    seasonId: 73081,
                    seasonType: 1,
                    seasonStatus: 13,
                    mode: 2,
                },
            },
            userStatus: {
                watchProgress: {
                    lastEpId: 1231523,
                    lastEpIndex: 'OP',
                    progress: '1',
                    lastPlayAid: '113740078909891',
                    lastPlayCid: '27730904912',
                },
            },
        },
        playExtConf: {
            allowCloseSubtitle: true,
        },
    };
}

function getClipInfo(segments: number[][]): ClipInfo[] {
    return segments.map(([start, end]) => ({
        start: Math.floor(start),
        end: Math.ceil(end),
        clipType: ClipType.CLIP_TYPE_OP,
    }));
}

// Removed function handleDmSegMobileReply as it was not called
// Removed function getAirBorneDms as it was only called by handleDmSegMobileReply

function getBinaryBody(body) {
    const header = body.slice(0, 5);
    let binaryBody = body.slice(5);
    if (header[0]) {
        binaryBody = $utils.ungzip(binaryBody);
    }
    return binaryBody;
}

function newRawBody(body) {
    const checksum = Checksum(body.length);
    const rawBody = new Uint8Array(5 + body.length);

    rawBody[0] = 0; // 直接置protobuf 为未压缩状态
    rawBody.set(checksum, 1); // 1-4位： 校验值(4位)
    rawBody.set(body, 5); // 5-end位：protobuf数据
    return rawBody;
}

function Checksum(num) {
    const arr = new ArrayBuffer(4); // an Int32 takes 4 bytes
    const view = new DataView(arr);
    view.setUint32(0, num, false); // byteOffset = 0; litteEndian = false
    return new Uint8Array(arr);
}
# 龍山派 曾氏族譜

- `index.html` — 族譜紀念堂（祖先名冊、靈骨塔位、族譜樹狀、祭祀提醒）
- `3d.html` — 3D 立體世系祠堂（three.js）：神位牌、匾額楹聯、沿革碑、字輩牌、塔位側殿、上香、忌日、語音口述
- `worker/zupu-module.js` — 祭祀雲端後端，掛在 arcar Worker 的 `/zupu` 路由

3D 祠堂會讀取同一瀏覽器中紀念堂的資料（localStorage `ancestorApp_v28`）。

## 後端部署（arcar）

1. arcar 新增 KV 綁定 `ZUPU_KV`
2. 貼入 `worker/zupu-module.js` 的 `handleZupu`、`withZupuCors`、`ZUPU_CORS` 與 `z*` 輔助函式（`export default` 那段不用）
3. 在 arcar `fetch` 最前面（全域 CORS 之前）加：

```js
if (url.pathname.startsWith('/zupu')) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: ZUPU_CORS });
  return withZupuCors(await handleZupu(request, env, url.pathname.slice(5), url));
}
```

前端呼叫 `https://arcar.kftseng2oo1.workers.dev/zupu`（`3d.html` 內的 `RITE_API`）。未部署時 3D 祠堂自動改為本機模式：上香只記在該裝置，語音無法上傳。

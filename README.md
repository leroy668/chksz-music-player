# 声场 · ChKSz 音乐播放器

基于 [ChKSz API](https://api.chksz.com/#apis) 的音乐播放器，提供网易云音乐、QQ 音乐与酷狗音乐搜索、歌曲解析播放、歌词、播放队列，以及使用 Supabase 进行跨设备歌单同步。

## 本地运行

```powershell
npm install
npm run dev
```

打开终端显示的本地地址。进入应用后，在“连接 ChKSz API”中填写个人 API Key。Key 只保存在当前浏览器的 `localStorage`，不会写入项目文件或 GitHub Actions。

## 构建

```powershell
npm run build
```

构建结果位于 `dist`，可部署到任意静态网站托管服务。

## GitHub Pages 部署

项目已经包含 `.github/workflows/deploy-pages.yml`：

1. 创建一个新的 GitHub 仓库，例如 `chksz-music-player`。
2. 推送本项目的 `main` 分支。
3. 在仓库 **Settings > Pages** 中将 Source 设为 **GitHub Actions**。
4. 工作流完成后，页面地址通常为 `https://<GitHub 用户名>.github.io/chksz-music-player/`。

部署后的网页会由用户自行在浏览器中输入 API Key；不要把 API Key 写入 `.env`、仓库或 Actions Secrets。

## Supabase 云同步

1. 在 Supabase 创建项目，在 SQL Editor 中执行 `supabase/schema.sql`。
2. 在 Authentication 的 URL Configuration 中把生产网址加入 Redirect URLs。
3. 在 GitHub 仓库的 **Settings > Secrets and variables > Actions > Variables** 中添加 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。
4. 重新运行 Pages 工作流。

Supabase 的 Publishable/anon Key 用于识别项目，可以放入前端构建；真正的数据隔离由 `schema.sql` 中的 RLS 策略实现。ChKSz API Key 不会上传，只保存在各设备浏览器中。

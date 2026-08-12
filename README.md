# 声场 · ChKSz 音乐播放器

基于 [ChKSz API](https://api.chksz.com/#apis) 的静态音乐播放器，提供网易云音乐、QQ 音乐与酷狗音乐搜索、歌曲解析播放、歌词、播放队列及本地收藏。

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
